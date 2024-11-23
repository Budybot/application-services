import { Injectable, Logger, Inject } from '@nestjs/common';
import { ToolTestingService } from '../tool-tester.service';
import { AgentServiceRequest } from '../agent-service-request.service';
import { ClientKafka } from '@nestjs/microservices';
import {
  OB1Global,
  CURRENT_SCHEMA_VERSION,
} from 'src/interfaces/ob1-message.interfaces';

@Injectable()
export class LeadRatingService {
  private readonly logger = new Logger(LeadRatingService.name);

  constructor(
    private readonly toolTestingService: ToolTestingService,
    private readonly agentServiceRequest: AgentServiceRequest,
    @Inject('KAFKA_OB1_CLIENT') private readonly kafkaClient: ClientKafka,
  ) {}

  private async describeObjectFields(
    serverUrl: string,
    describeToolId: string,
    objectName: string,
  ): Promise<string[]> {
    const describeResult = await this.toolTestingService.runTest(
      serverUrl,
      describeToolId,
      { objectName },
    );
    const fields =
      JSON.parse(describeResult.toolresult.body)?.result.fieldNames || [];
    // Remove fields starting with "Budy_"
    return fields.filter((field) => !field.startsWith('Budy_'));
  }

  private chunkArray(array: any[], chunkSize: number): any[][] {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private async getLeadDataBatch(
    serverUrl: string,
    queryToolId: string,
    leadFields: string[],
    leadIds: string[],
  ): Promise<any[]> {
    const leadIdsQuoted = leadIds.map((id) => `'${id}'`).join(',');
    const leadQuery = `SELECT ${leadFields.join(
      ', ',
    )} FROM Lead WHERE Id IN (${leadIdsQuoted})`;
    const leadDataResult = await this.toolTestingService.runTest(
      serverUrl,
      queryToolId,
      { query: leadQuery },
    );
    const leadData =
      JSON.parse(leadDataResult.toolresult.body)?.result.records || [];
    return leadData;
  }

  private async getActivityDataBatch(
    serverUrl: string,
    queryToolId: string,
    eventFields: string[],
    taskFields: string[],
    leadIds: string[],
  ): Promise<{ [leadId: string]: { events: any[]; tasks: any[] } }> {
    const leadIdsQuoted = leadIds.map((id) => `'${id}'`).join(',');
    const eventQuery = `SELECT ${eventFields.join(
      ', ',
    )} FROM Event WHERE WhoId IN (${leadIdsQuoted})`;
    const taskQuery = `SELECT ${taskFields.join(
      ', ',
    )} FROM Task WHERE WhoId IN (${leadIdsQuoted})`;

    const [eventDataResult, taskDataResult] = await Promise.all([
      this.toolTestingService.runTest(serverUrl, queryToolId, {
        query: eventQuery,
      }),
      this.toolTestingService.runTest(serverUrl, queryToolId, {
        query: taskQuery,
      }),
    ]);

    const eventRecords =
      JSON.parse(eventDataResult.toolresult.body)?.result.records || [];
    const taskRecords =
      JSON.parse(taskDataResult.toolresult.body)?.result.records || [];

    const activityData = {};

    leadIds.forEach((leadId) => {
      activityData[leadId] = {
        events: [],
        tasks: [],
      };
    });

    eventRecords.forEach((event) => {
      const whoId = event.WhoId;
      if (activityData[whoId]) {
        activityData[whoId].events.push(event);
      }
    });

    taskRecords.forEach((task) => {
      const whoId = task.WhoId;
      if (activityData[whoId]) {
        activityData[whoId].tasks.push(task);
      }
    });

    return activityData;
  }

  async processLeadBatch(
    serverUrl: string,
    queryToolId: string,
    promptId: string,
    leadFields: string[],
    eventFields: string[],
    taskFields: string[],
    criteriaQuestions: string[],
    leadIds: string[],
    personId: string,
    userOrgId: string,
  ): Promise<{ tableData: any[]; apiCount: number; llmCount: number }> {
    let apiCount = 0;
    let llmCount = 0;
    const tableData = [];

    // Fetch lead data in batch
    const leadDataList = await this.getLeadDataBatch(
      serverUrl,
      queryToolId,
      leadFields,
      leadIds,
    );
    apiCount++;

    // Fetch activity data in batch
    const activityData = await this.getActivityDataBatch(
      serverUrl,
      queryToolId,
      eventFields,
      taskFields,
      leadIds,
    );
    apiCount += 2; // Two queries: one for events, one for tasks

    // Process each lead in the batch
    for (const leadData of leadDataList) {
      const recordId = leadData.Id;
      const leadActivities = activityData[recordId] || {
        events: [],
        tasks: [],
      };

      // Filter out null fields from lead and activity data
      const filteredLeadData = this.filterNullFields(leadData);
      const filteredEvents = leadActivities.events.map(this.filterNullFields);
      const filteredTasks = leadActivities.tasks.map(this.filterNullFields);

      // Check if there is no activity data
      const noActivityData =
        filteredEvents.length === 0 && filteredTasks.length === 0;

      let evaluation;
      if (noActivityData) {
        // Skip LLM call and assign default evaluation
        evaluation = criteriaQuestions.map(() => ({
          outcome: 'NA',
          justification:
            'There is no activity data. Budy is not even going to check this lead.',
        }));
      } else {
        // Prepare LLM prompt
        const userPrompt = `Lead Data: ${JSON.stringify(
          filteredLeadData,
        )}\nActivity Results: ${JSON.stringify({
          events: filteredEvents,
          tasks: filteredTasks,
        })}`;
        const config = {
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          maxTokens: 4096,
          frequencyPenalty: 0,
          presencePenalty: 0,
        };

        // Call LLM
        const llmResponse =
          await this.agentServiceRequest.sendPromptExecutionRequest(
            personId,
            userOrgId,
            promptId,
            userPrompt,
            config,
            { criteriaQuestions: criteriaQuestions },
          );
        apiCount++;
        llmCount++;

        // Process LLM response
        const content = llmResponse?.messageContent?.content;
        if (!content || typeof content !== 'object') {
          this.logger.error('LLM response content is missing or invalid');
          continue;
        }
        evaluation = content.evaluation;
      }

      // Prepare data for patching
      const leadUpdateData: Record<string, any> = { id: recordId };
      evaluation.forEach((entry, index) => {
        const criteriaKey = `Budy_Criteria_${index + 1}__c`;
        const justificationKey = `Budy_Justification_${index + 1}__c`;
        leadUpdateData[criteriaKey] = entry.outcome;
        leadUpdateData[justificationKey] = entry.justification;
      });

      // Compute lead score and bucket
      const leadScore = this.computeLeadScore(evaluation);
      function getLeadScoreColor(leadScore: number) {
        if (leadScore < 25) return 'Red';
        if (leadScore < 50) return 'Yellow';
        if (leadScore < 75) return 'Blue';
        return 'Green';
      }
      leadUpdateData['Budy_Lead_Score__c'] = leadScore;
      leadUpdateData['Budy_Lead_Score_Bucket__c'] =
        getLeadScoreColor(leadScore);

      tableData.push(leadUpdateData);
    }

    return { tableData, apiCount, llmCount };
  }
  private filterNullFields(record: any): any {
    return Object.fromEntries(
      Object.entries(record).filter(([, value]) => value !== null),
    );
  }

  async rateLeads(
    serverUrl: string,
    recordToolId: string,
    describeToolId: string,
    queryToolId: string,
    patchToolId: string,
    createToolId: string,
    criteriaRecordId: string,
    promptId: string,
    makeSnapshot: boolean,
    personId: string,
    userOrgId: string,
    NDays: number = 14,
    limit?: number,
  ): Promise<{ apiCount: number; llmCount: number }> {
    try {
      let apiCount = 0;
      let llmCount = 0;

      // Step 1: Get the lead records
      let leadRecordQuery = `SELECT Id FROM Lead WHERE CreatedDate = LAST_N_DAYS:${NDays}`;
      if (limit) {
        leadRecordQuery += ` LIMIT ${limit}`;
      }
      const leadRecords = await this.toolTestingService.runTest(
        serverUrl,
        queryToolId,
        {
          query: leadRecordQuery,
        },
      );
      apiCount++;
      const responseBody = JSON.parse(leadRecords.toolresult.body);

      const recordIds = responseBody.result.records.map(
        (record: any) => record.Id,
      );

      // Step 2: Describe Lead, Event, and Task objects
      const [leadFields, eventFields, taskFields] = await Promise.all([
        this.describeObjectFields(serverUrl, describeToolId, 'Lead'),
        this.describeObjectFields(serverUrl, describeToolId, 'Event'),
        this.describeObjectFields(serverUrl, describeToolId, 'Task'),
      ]);
      apiCount += 3;

      // Step 3: Get criteria record data
      const criteriaRecordData = await this.toolTestingService.runTest(
        serverUrl,
        recordToolId,
        {
          recordId: criteriaRecordId,
          objectName: 'Budy_Lead_Criteria__c',
        },
      );
      apiCount++;
      const criteriaResponseBody = JSON.parse(
        criteriaRecordData.toolresult.body,
      );
      const recordData = criteriaResponseBody.result?.recordData || {};

      // Extract the questions into a list
      const criteriaQuestions = [
        recordData.Question_1__c,
        recordData.Question_2__c,
        recordData.Question_3__c,
        recordData.Question_4__c,
      ];

      // Step 4: Process leads in batches
      const chunkSize = 20;
      const recordIdChunks = this.chunkArray(recordIds, chunkSize);
      const tableData: any[] = [];

      let batchCounter = 0;
      for (const leadIdsBatch of recordIdChunks) {
        batchCounter++;
        this.logger.debug(
          `Processing batch ${batchCounter}/${recordIdChunks.length}`,
        );

        const {
          tableData: batchTableData,
          apiCount: batchApiCount,
          llmCount: batchLlmCount,
        } = await this.processLeadBatch(
          serverUrl,
          queryToolId,
          promptId,
          leadFields,
          eventFields,
          taskFields,
          criteriaQuestions,
          leadIdsBatch,
          personId,
          userOrgId,
        );
        apiCount += batchApiCount;
        llmCount += batchLlmCount;

        // Step 5: Update lead records in batch
        await this.toolTestingService.runTest(serverUrl, patchToolId, {
          record_type: 'Lead',
          field_names: [
            'Budy_Criteria_1__c',
            'Budy_Justification_1__c',
            'Budy_Criteria_2__c',
            'Budy_Justification_2__c',
            'Budy_Criteria_3__c',
            'Budy_Justification_3__c',
            'Budy_Criteria_4__c',
            'Budy_Justification_4__c',
            'Budy_Lead_Score__c',
            'Budy_Lead_Score_Bucket__c',
          ],
          records: batchTableData,
        });
        apiCount++;

        tableData.push(...batchTableData);

        this.logger.debug(`Batch ${batchCounter} processed successfully.`);
      }

      // Step 6: Create snapshot records if needed
      if (makeSnapshot) {
        // Snapshot logic can be updated similarly to process in batches
        // ...
      }

      const messageInput = {
        content: `Lead rating process completed successfully. Total API calls: ${apiCount}. Total LLM calls: ${llmCount}.`,
      };
      this.emitMessage(
        messageInput,
        'budyos-ob1-applicationService',
        false,
        personId,
        userOrgId,
      );
      return { apiCount, llmCount };
    } catch (error) {
      const errorMessageInput = {
        content: `Error in rateLeads: ${error.message}. Stack: ${error.stack}.`,
      };
      this.emitMessage(
        errorMessageInput,
        'budyos-ob1-applicationService',
        true,
        personId,
        userOrgId,
      );
      throw new Error(`Error in rateLeads: ${error.message}`);
    }
  }

  emitMessage(
    messageInput: any,
    topic: string,
    error: boolean,
    personId: string,
    userOrgId: string,
  ): void {
    try {
      const messageValue: OB1Global.MessageResponseValueV2 = {
        messageContent: messageInput,
        messageType: 'NOTIFICATION',
        error: error,
      };
      const messageHeaders: OB1Global.MessageHeaderV2 = {
        sourceService: process.env.SERVICE_NAME || 'unknown-service',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        personId: personId,
        userOrgId: userOrgId,
      };
      this.logger.log(
        `Emitting message to topic: ${topic}, with content: ${JSON.stringify(
          messageValue,
        )}`,
      );
      // Emit the message to Kafka topic without awaiting a response
      this.kafkaClient
        .emit(topic, {
          value: messageValue,
          headers: messageHeaders,
        })
        .subscribe({
          error: (err) =>
            this.logger.error(
              `Failed to emit Kafka message: ${err.message}`,
              err.stack,
            ),
        });

      this.logger.log('Kafka message emitted successfully');
    } catch (error) {
      this.logger.error(
        `Failed to emit Kafka message: ${error.message}`,
        error.stack,
      );
    }
  }

  private computeLeadScore(evaluation: any): number {
    const yesCount = evaluation.filter(
      (entry: any) => entry.outcome === 'Yes',
    ).length;
    return (yesCount / 4) * 100;
  }
}
