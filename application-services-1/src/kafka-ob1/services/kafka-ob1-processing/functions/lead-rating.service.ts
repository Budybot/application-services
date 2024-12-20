import { Injectable, Logger, Inject } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';
import { ClientKafka } from '@nestjs/microservices';
import {
  OB1Global,
  CURRENT_SCHEMA_VERSION,
} from 'src/interfaces/ob1-message.interfaces';
import { GoogleSheetService } from '../../google/google-sheet.service';

@Injectable()
export class LeadRatingService {
  private readonly logger = new Logger(LeadRatingService.name);

  constructor(
    private readonly agentServiceRequest: AgentServiceRequest,
    private readonly googleSheetService: GoogleSheetService,
    @Inject('KAFKA_OB1_CLIENT') private readonly kafkaClient: ClientKafka,
  ) {}

  private async describeObjectFields(
    describeToolId: string,
    objectName: string,
    personId: string,
    userOrgId: string,
  ): Promise<string[]> {
    const describeResult = await this.agentServiceRequest.sendToolRequest(
      personId,
      userOrgId,
      describeToolId,
      { objectName },
    );

    if (
      !describeResult.messageContent?.toolSuccess ||
      describeResult.messageContent.toolstatusCodeReturned !== 200 ||
      !describeResult.messageContent.toolresult?.result
    ) {
      throw new Error(
        `Failed to describe object fields: ${
          describeResult.messageContent?.toolresult?.error || 'Unknown error'
        }`,
      );
    }

    const fields =
      describeResult.messageContent.toolresult.result.fieldNames || [];

    const fieldsToExclude = ['Description'];
    return fields.filter(
      (field) => !field.startsWith('Budy_') && !fieldsToExclude.includes(field),
    );
  }

  private chunkArray(array: any[], chunkSize: number): any[][] {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private async getLeadDataBatch(
    queryToolId: string,
    leadFields: string[],
    leadIds: string[],
    personId: string,
    userOrgId: string,
  ): Promise<any[]> {
    const leadIdsQuoted = leadIds.map((id) => `'${id}'`).join(',');
    const leadQuery = `SELECT ${leadFields.join(
      ', ',
    )} FROM Lead WHERE Id IN (${leadIdsQuoted})`;

    const leadDataResult = await this.agentServiceRequest.sendToolRequest(
      personId,
      userOrgId,
      queryToolId,
      { query: leadQuery },
    );

    if (
      !leadDataResult.messageContent?.toolSuccess ||
      leadDataResult.messageContent.toolstatusCodeReturned !== 200 ||
      !leadDataResult.messageContent.toolresult?.result
    ) {
      throw new Error(
        `Failed to fetch lead data: ${
          leadDataResult.messageContent?.toolresult?.error || 'Unknown error'
        }`,
      );
    }

    const leadData =
      leadDataResult.messageContent.toolresult.result.records || [];

    return leadData;
  }

  private async getActivityDataBatch(
    queryToolId: string,
    eventFields: string[],
    taskFields: string[],
    leadIds: string[],
    personId: string,
    userOrgId: string,
  ): Promise<{ [leadId: string]: { events: any[]; tasks: any[] } }> {
    const leadIdsQuoted = leadIds.map((id) => `'${id}'`).join(',');
    const eventQuery = `SELECT ${eventFields.join(
      ', ',
    )} FROM Event WHERE WhoId IN (${leadIdsQuoted}) LIMIT 20`;
    const taskQuery = `SELECT ${taskFields.join(
      ', ',
    )} FROM Task WHERE WhoId IN (${leadIdsQuoted}) LIMIT 20`;

    const [eventDataResult, taskDataResult] = await Promise.all([
      this.agentServiceRequest.sendToolRequest(
        personId,
        userOrgId,
        queryToolId,
        { query: eventQuery },
      ),
      this.agentServiceRequest.sendToolRequest(
        personId,
        userOrgId,
        queryToolId,
        { query: taskQuery },
      ),
    ]);

    // Check if the tools executed successfully
    if (
      !eventDataResult.messageContent?.toolSuccess ||
      eventDataResult.messageContent.toolstatusCodeReturned !== 200 ||
      !eventDataResult.messageContent.toolresult?.result
    ) {
      throw new Error(
        `Failed to fetch event data: ${
          eventDataResult.messageContent?.toolresult?.error || 'Unknown error'
        }`,
      );
    }

    if (
      !taskDataResult.messageContent?.toolSuccess ||
      taskDataResult.messageContent.toolstatusCodeReturned !== 200 ||
      !taskDataResult.messageContent.toolresult?.result
    ) {
      throw new Error(
        `Failed to fetch task data: ${
          taskDataResult.messageContent?.toolresult?.error || 'Unknown error'
        }`,
      );
    }

    const eventRecords =
      eventDataResult.messageContent.toolresult.result.records || [];

    const taskRecords =
      taskDataResult.messageContent.toolresult.result.records || [];

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
    currentTime: string,
    personId: string,
    userOrgId: string,
  ): Promise<{ tableData: any[]; apiCount: number; llmCount: number }> {
    let apiCount = 0;
    let llmCount = 0;
    const tableData = [];

    // Fetch lead data in batch
    const leadDataList = await this.getLeadDataBatch(
      queryToolId,
      leadFields,
      leadIds,
      personId,
      userOrgId,
    );
    apiCount++;

    // Fetch activity data in batch
    const activityData = await this.getActivityDataBatch(
      queryToolId,
      eventFields,
      taskFields,
      leadIds,
      personId,
      userOrgId,
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
            'There is no activity data for Budy to comment on this lead.',
        }));
      } else {
        // Prepare LLM prompt
        const userPrompt = `Time at the start of analysis: ${currentTime}.\nLead Data: ${JSON.stringify(
          filteredLeadData,
        )}\nActivity Results: ${JSON.stringify({
          events: filteredEvents,
          tasks: filteredTasks,
        })}`;
        const config = {
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.2,
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
    customQuery?: string,
    weekName?: string,
  ): Promise<{ apiCount: number; llmCount: number }> {
    try {
      let apiCount = 0;
      let llmCount = 0;

      let leadRecordsResponse = null;
      // Step 1B: If custom_lead_query is provided, directly run the query and exit
      if (customQuery) {
        if (limit) {
          customQuery += ` LIMIT ${limit}`;
        }
        leadRecordsResponse = await this.agentServiceRequest.sendToolRequest(
          personId,
          userOrgId,
          queryToolId,
          { query: customQuery },
        );
        apiCount++;
      } else {
        // Step 1: Get the lead records
        let leadRecordQuery = `SELECT Id FROM Lead WHERE CreatedDate = LAST_N_DAYS:${NDays}`;
        if (limit) {
          leadRecordQuery += ` LIMIT ${limit}`;
        }

        leadRecordsResponse = await this.agentServiceRequest.sendToolRequest(
          personId,
          userOrgId,
          queryToolId,
          { query: leadRecordQuery },
        );
        apiCount++;
      }
      // Check if the tool executed successfully
      if (
        !leadRecordsResponse.messageContent?.toolSuccess ||
        leadRecordsResponse.messageContent.toolstatusCodeReturned !== 200 ||
        !leadRecordsResponse.messageContent.toolresult?.result
      ) {
        throw new Error(
          `Failed to fetch lead records: ${
            leadRecordsResponse.messageContent?.toolresult?.error ||
            'Unknown error'
          }`,
        );
      }

      const responseBody = leadRecordsResponse.messageContent.toolresult.result;
      const recordIds =
        responseBody.records?.map((record: any) => record.Id) || [];

      // Step 2B: If makeSnapshot is true, directly run the snapshot creation logic and exit
      if (makeSnapshot) {
        const snapshotApiCount = await this.createSnapshotLeads(
          serverUrl,
          queryToolId,
          createToolId,
          recordIds,
          responseBody,
          20,
          personId,
          userOrgId,
          weekName,
        );
        apiCount += snapshotApiCount;
        return { apiCount, llmCount };
      }

      // Step 2: Describe Lead, Event, and Task objects
      const [leadFields, eventFields, taskFields] = await Promise.all([
        this.describeObjectFields(describeToolId, 'Lead', personId, userOrgId),
        this.describeObjectFields(describeToolId, 'Event', personId, userOrgId),
        this.describeObjectFields(describeToolId, 'Task', personId, userOrgId),
      ]);
      apiCount += 3;

      // Step 3: Get criteria record data
      const criteriaRecordData = await this.agentServiceRequest.sendToolRequest(
        personId,
        userOrgId,
        recordToolId,
        {
          recordId: criteriaRecordId,
          objectName: 'Budy_Lead_Criteria__c',
        },
      );
      apiCount++;

      // Check if the tool executed successfully
      if (
        !criteriaRecordData.messageContent?.toolSuccess ||
        criteriaRecordData.messageContent.toolstatusCodeReturned !== 200 ||
        !criteriaRecordData.messageContent.toolresult?.result
      ) {
        throw new Error(
          `Failed to fetch criteria record data: ${
            criteriaRecordData.messageContent?.toolresult?.error ||
            'Unknown error'
          }`,
        );
      }

      const criteriaResponseBody =
        criteriaRecordData.messageContent.toolresult.result;
      const recordData = criteriaResponseBody.recordData || {};

      // Extract the questions into a list
      const criteriaQuestions = [
        recordData.Question_1__c,
        recordData.Question_2__c,
        recordData.Question_3__c,
        recordData.Question_4__c,
      ];

      // Step 4: Process leads in batches
      const currentTime = new Date().toISOString();
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
          currentTime,
          personId,
          userOrgId,
        );
        apiCount += batchApiCount;
        llmCount += batchLlmCount;

        // Step 5: Update lead records in batch
        const patchResponse = await this.agentServiceRequest.sendToolRequest(
          personId,
          userOrgId,
          patchToolId,
          {
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
          },
        );
        apiCount++;

        // Check if the tool executed successfully
        if (
          !patchResponse.messageContent?.toolSuccess ||
          patchResponse.messageContent.toolstatusCodeReturned !== 200
        ) {
          throw new Error(
            `Failed to update lead records: ${
              patchResponse.messageContent?.toolresult?.error || 'Unknown error'
            }`,
          );
        }

        tableData.push(...batchTableData);

        this.logger.debug(`Batch ${batchCounter} processed successfully.`);
      }

      // Step 6: Create snapshot records if needed
      if (makeSnapshot) {
        const snapshotApiCount = await this.createSnapshotLeads(
          serverUrl,
          queryToolId,
          createToolId,
          recordIds,
          responseBody,
          20,
          personId,
          userOrgId,
          weekName,
        );
        apiCount += snapshotApiCount;
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

  private async createSnapshotLeads(
    serverUrl: string,
    queryToolId: string,
    createToolId: string,
    recordIds: string[],
    recordData: any,
    chunkSize: number,
    personId: string,
    userOrgId: string,
    weekName?: string,
  ): Promise<number> {
    let apiCount = 0;

    // Quote record IDs for use in queries
    const recordIdsQuoted = recordIds.map((id) => `'${id}'`);

    // Step 1: Query status data
    const statusQuery = `SELECT OwnerId, Owner.Name, Status, COUNT(Id) LeadCount
                         FROM Lead
                         WHERE Id IN (${recordIdsQuoted.join(',')})
                         GROUP BY OwnerId, Owner.Name, Status
                         ORDER BY OwnerId`;

    const statusResults = await this.agentServiceRequest.sendToolRequest(
      personId,
      userOrgId,
      queryToolId,
      { query: statusQuery },
    );
    apiCount++;

    // Check if the tool executed successfully
    if (
      !statusResults.messageContent?.toolSuccess ||
      statusResults.messageContent.toolstatusCodeReturned !== 200 ||
      !statusResults.messageContent.toolresult?.result
    ) {
      throw new Error(
        `Failed to fetch status data: ${
          statusResults.messageContent?.toolresult?.error || 'Unknown error'
        }`,
      );
    }

    const statusResponse = statusResults.messageContent.toolresult.result;

    // Step 2: Query score data
    const scoreQuery = `
      SELECT OwnerId, Budy_Lead_Score_Bucket__c, COUNT(Id) LeadCount
      FROM Lead
      WHERE Id IN (${recordIdsQuoted.join(',')})
      GROUP BY OwnerId, Budy_Lead_Score_Bucket__c
      ORDER BY OwnerId
    `;

    const scoreResults = await this.agentServiceRequest.sendToolRequest(
      personId,
      userOrgId,
      queryToolId,
      { query: scoreQuery },
    );
    apiCount++;

    // Check if the tool executed successfully
    if (
      !scoreResults.messageContent?.toolSuccess ||
      scoreResults.messageContent.toolstatusCodeReturned !== 200 ||
      !scoreResults.messageContent.toolresult?.result
    ) {
      throw new Error(
        `Failed to fetch score data: ${
          scoreResults.messageContent?.toolresult?.error || 'Unknown error'
        }`,
      );
    }

    const scoreResponse = scoreResults.messageContent.toolresult.result;

    // Log the responses
    this.logger.debug(`Status Response: ${JSON.stringify(statusResponse)}`);
    this.logger.debug(`Score Response: ${JSON.stringify(scoreResponse)}`);

    // Step 3: Parse SDR and score reports
    const sdrReport = this.parseSDRReport(statusResponse);
    const scoreReport = this.parseScoreReport(scoreResponse);

    // Log the parsed reports
    this.logger.debug(`SDR Report: ${JSON.stringify(sdrReport)}`);
    this.logger.debug(`Score Report: ${JSON.stringify(scoreReport)}`);

    // Step 4: Transform to snapshot records
    const snapshotRecords = this.transformToSnapshotRecords(
      sdrReport,
      scoreReport,
      recordData,
      weekName,
    );

    // Log the snapshot records
    this.logger.debug(`Snapshot Records: ${JSON.stringify(snapshotRecords)}`);

    // Step 5: Chunk and create snapshots
    const snapshotRecordChunks = this.chunkArray(snapshotRecords, chunkSize);

    for (const chunk of snapshotRecordChunks) {
      // Log the chunk being sent
      this.logger.debug(`Chunk being sent: ${JSON.stringify(chunk)}`);

      const response = await this.agentServiceRequest.sendToolRequest(
        personId,
        userOrgId,
        createToolId,
        {
          object_name: 'Budy_SDR_Snapshot__c',
          records: chunk,
        },
      );
      apiCount++;

      // Check if the tool executed successfully
      if (
        !response.messageContent?.toolSuccess ||
        response.messageContent.toolstatusCodeReturned !== 200
      ) {
        throw new Error(
          `Failed to create snapshot records: ${
            response.messageContent?.toolresult?.error || 'Unknown error'
          }`,
        );
      }
    }

    return apiCount;
  }

  private parseSDRReport(response: any): any {
    const report = {};
    const records = response?.records || [];
    records.forEach((record) => {
      const { OwnerId, Name, Status, LeadCount } = record;
      if (!report[OwnerId]) {
        report[OwnerId] = {
          Name,
          'Open Leads': 0,
          'Dropped Leads': 0,
          'Qualified Leads': 0,
          'Total Leads': 0,
        };
      }
      if (['New', 'Working'].includes(Status)) {
        report[OwnerId]['Open Leads'] += LeadCount;
      } else if (Status === 'Dropped') {
        report[OwnerId]['Dropped Leads'] += LeadCount;
      } else if (Status === 'Qualified') {
        report[OwnerId]['Qualified Leads'] += LeadCount;
      }
      report[OwnerId]['Total Leads'] += LeadCount;
    });
    return report;
  }

  private parseScoreReport(response: any): any {
    const report = {};
    const records = response?.records || [];
    records.forEach((record) => {
      const { OwnerId, Budy_Lead_Score_Bucket__c, LeadCount } = record;
      if (!report[OwnerId]) {
        report[OwnerId] = {
          Bucket_1_Leads__c: 0,
          Bucket_2_Leads__c: 0,
          Bucket_3_Leads__c: 0,
          Bucket_4_Leads__c: 0,
        };
      }
      const bucketKey = `Bucket_${this.getBucketNumber(
        Budy_Lead_Score_Bucket__c,
      )}_Leads__c`;
      if (report[OwnerId][bucketKey] !== undefined) {
        report[OwnerId][bucketKey] += LeadCount;
      }
    });
    return report;
  }

  private transformToSnapshotRecords(
    sdrReport: any,
    scoreReport: any,
    recordData: any,
    weekName?: string,
  ): any[] {
    const records = [];
    Object.entries(sdrReport).forEach(([ownerId, leadData]) => {
      const scoreData = scoreReport[ownerId] || {
        Bucket_1_Leads__c: 0,
        Bucket_2_Leads__c: 0,
        Bucket_3_Leads__c: 0,
        Bucket_4_Leads__c: 0,
      };

      records.push({
        SDR_Id__c: ownerId,
        Name: leadData['Name'],
        Bucket_1_Leads__c: scoreData.Bucket_1_Leads__c,
        Bucket_2_Leads__c: scoreData.Bucket_2_Leads__c,
        Bucket_3_Leads__c: scoreData.Bucket_3_Leads__c,
        Bucket_4_Leads__c: scoreData.Bucket_4_Leads__c,
        Open_Leads__c: leadData['Open Leads'],
        Dropped_Leads__c: leadData['Dropped Leads'],
        Qualified_Leads__c: leadData['Qualified Leads'],
        Total_Leads__c: leadData['Total Leads'],
        Lead_Criteria_Version__c: recordData.Name,
        Year_Work_Week__c: weekName || this.getYearAndWeek(),
      });
    });

    return records;
  }

  private getBucketNumber(bucket: string): number {
    if (bucket === 'Red') return 1;
    if (bucket === 'Yellow') return 2;
    if (bucket === 'Blue') return 3;
    if (bucket === 'Green') return 4;
    return 0;
  }

  private getYearAndWeek(): string {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const dayOfYear = Math.ceil(
      (now.getTime() -
        startOfYear.getTime() +
        (startOfYear.getTimezoneOffset() - now.getTimezoneOffset()) *
          60 *
          1000) /
        (1000 * 60 * 60 * 24),
    );
    const weekNumber = Math.ceil(dayOfYear / 7);
    return `${now.getFullYear()}_Week_${weekNumber}`;
  }

  async pushSnapshotToGoogleSheet(
    queryToolId: string,
    googleSheetId: string,
    personId: string,
    userOrgId: string,
  ): Promise<void> {
    try {
      // Step 1: Fetch snapshot data
      const snapshotDataResponse =
        await this.agentServiceRequest.sendToolRequest(
          personId,
          userOrgId,
          queryToolId,
          {
            query:
              'SELECT Id, Name, Bucket_1_Leads__c, Bucket_2_Leads__c, Bucket_3_Leads__c, Bucket_4_Leads__c, Qualified_Leads__c, Open_Leads__c, Dropped_Leads__c, Total_Leads__c, Year_Work_Week__c FROM Budy_SDR_Snapshot__c',
          },
        );

      // Check if the tool executed successfully
      if (
        !snapshotDataResponse.messageContent?.toolSuccess ||
        snapshotDataResponse.messageContent.toolstatusCodeReturned !== 200 ||
        !snapshotDataResponse.messageContent.toolresult?.result
      ) {
        throw new Error(
          `Failed to fetch snapshot data: ${
            snapshotDataResponse.messageContent?.toolresult?.error ||
            'Unknown error'
          }`,
        );
      }

      // Corrected this line to access 'records' instead of 'recordData'
      const snapshotData =
        snapshotDataResponse.messageContent.toolresult.result.records || [];

      // Step 2: Prepare data for Google Sheets
      const sheetData = this.transformSnapshotDataForGoogleSheets(snapshotData);

      // Step 3: Push data to Google Sheets
      await this.googleSheetService.writeToSheet(googleSheetId, sheetData);

      this.emitMessage(
        { content: 'Snapshot data pushed to Google Sheets successfully.' },
        'budyos-ob1-applicationService',
        false,
        personId,
        userOrgId,
      );
    } catch (error) {
      const errorMessageInput = {
        content: `Error in pushSnapshotToGoogleSheet: ${error.message}. Stack: ${error.stack}.`,
      };
      this.emitMessage(
        errorMessageInput,
        'budyos-ob1-applicationService',
        true,
        personId,
        userOrgId,
      );
      throw new Error(`Error in pushSnapshotToGoogleSheet: ${error.message}`);
    }
  }

  private transformSnapshotDataForGoogleSheets(snapshotData: any[]): any[][] {
    // Check if snapshotData is an array
    if (!Array.isArray(snapshotData)) {
      throw new Error('snapshotData is not an array');
    }

    // Define the headers for the Google Sheet
    const headers = [
      'Id',
      'Name',
      'Bucket 1 Leads',
      'Bucket 2 Leads',
      'Bucket 3 Leads',
      'Bucket 4 Leads',
      'Qualified Leads',
      'Open Leads',
      'Dropped Leads',
      'Total Leads',
      'Year Work Week',
    ];

    // Initialize the sheet data with headers
    const sheetData = [headers];

    // Iterate over the snapshot data and transform each record into a row
    snapshotData.forEach((record) => {
      const row = [
        record.Id || '',
        record.Name || '',
        record.Bucket_1_Leads__c || 0,
        record.Bucket_2_Leads__c || 0,
        record.Bucket_3_Leads__c || 0,
        record.Bucket_4_Leads__c || 0,
        record.Qualified_Leads__c || 0,
        record.Open_Leads__c || 0,
        record.Dropped_Leads__c || 0,
        record.Total_Leads__c || 0,
        record.Year_Work_Week__c || '',
      ];
      sheetData.push(row);
    });

    return sheetData;
  }
}
