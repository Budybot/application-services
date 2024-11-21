import { Injectable, Logger } from '@nestjs/common';
import { ToolTestingService } from '../tool-tester.service';
import { AgentServiceRequest } from '../agent-service-request.service';
// import { GoogleSheetService } from '../../google/google-sheet.service';

@Injectable()
export class LeadRatingService {
  private readonly logger = new Logger(LeadRatingService.name);
  constructor(
    private readonly toolTestingService: ToolTestingService,
    private readonly agentServiceRequest: AgentServiceRequest,
    // private readonly googleSheetService: GoogleSheetService,
  ) {}

  async rateLead(
    serverUrl: string,
    recordToolId: string,
    activityToolId: string,
    eventFields: string[],
    taskFields: string[],
    criteriaQuestions: string[],
    recordId: string,
    apiCount: number,
    instanceName: string,
    userId: string,
  ): Promise<any> {
    try {
      // Step 1: Run the record tool to get lead data
      const leadDataRaw = await this.toolTestingService.runTest(
        serverUrl,
        recordToolId,
        {
          recordId: recordId,
          objectName: 'Lead',
        },
      );
      apiCount++;
      //   this.logger.debug(`Raw Lead Data: ${JSON.stringify(leadDataRaw)}`);

      // Restructure the lead data to only contain field names and values
      const leadData = {
        success: leadDataRaw.success,
        executionTime: leadDataRaw.executionTime,
        result: JSON.parse(leadDataRaw.result.body)?.result.recordData || {},
      };

      // Step 2: Build queries dynamically
      const eventQuery = `SELECT ${eventFields.join(', ')} FROM Event WHERE WhoId = '${recordId}'`;
      const taskQuery = `SELECT ${taskFields.join(', ')} FROM Task WHERE WhoId = '${recordId}'`;

      // Step 3: Run the activity tool twice:
      // First with { event: true, recordId }
      const activityEventRaw = await this.toolTestingService.runTest(
        serverUrl,
        activityToolId,
        {
          query: eventQuery,
        },
      );
      apiCount++;

      const activityTaskRaw = await this.toolTestingService.runTest(
        serverUrl,
        activityToolId,
        {
          query: taskQuery,
        },
      );
      apiCount++;

      // Transform activity results
      const activityResults = {
        event: this.transformActivityResult(activityEventRaw),
        task: this.transformActivityResult(activityTaskRaw),
      };

      // Step 4: Run LLM call
      const systemPrompt = `
      You are an expert Salesforce evaluator tasked with assessing an SDR's responsiveness and performance for a given lead. You will be provided with two data sets:

Lead Data: Detailed Salesforce information about the lead.
Activity Data: Records of interactions, activities, or communications associated with the lead.
Using this information, evaluate the following:

${criteriaQuestions.join('\n')}

For each question, provide a response of either 'Yes,' 'No,' or 'NA.' Justify your answer in one sentence, referencing the provided data. If the available data is insufficient to answer a question, respond with 'NA' and note that there is not enough information to make a determination.
Provide your response only as a structured JSON object in the following format, without any additional text or explanation:
    {
  "evaluation": [
    {
      "question": "${criteriaQuestions[0]}",
      "outcome": "Yes/No/NA",
      "justification": "Provide justification here."
    },
    {
      "question": "${criteriaQuestions[1]}",
      "outcome": "Yes/No/NA",
      "justification": "Provide justification here."
    },
    {
      "question": "${criteriaQuestions[2]}",
      "outcome": "Yes/No/NA",
      "justification": "Provide justification here."
    },
    {
      "question": "${criteriaQuestions[3]}",
      "outcome": "Yes/No/NA",
      "justification": "Provide justification here."
    }
  ]
}
Ensure that justifications reference the provided data and that outcomes of 'NA' include a note indicating insufficient data. The output must conform strictly to this JSON format.
  
`;
      const userPrompt = `Lead Data: ${JSON.stringify(leadData)} \n Activity Results: ${JSON.stringify(activityResults)}`;
      const config = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 4096,
        frequencyPenalty: 0,
        presencePenalty: 0,
      };
      const llmResponse = await this.agentServiceRequest.sendAgentRequest(
        systemPrompt,
        userPrompt,
        config,
        instanceName,
        userId,
      );
      try {
        // Access the content field
        const rawContent = llmResponse?.messageContent?.content;

        if (!rawContent) {
          throw new Error('Response content is missing or invalid');
        }

        // Clean the response: Remove backticks and unnecessary text
        const cleanedResponse = rawContent
          .trim()
          .replace(/^```json/, '')
          .replace(/```$/, '')
          .trim();

        // Parse the cleaned string into JSON
        const jsonResponse = JSON.parse(cleanedResponse);

        const leadName = leadData.result?.Name || 'Unknown';
        const ownerId = leadData.result?.OwnerId || 'Unknown';
        const status = leadData.result?.Status || 'Unknown';
        const createdDate = leadData.result?.CreatedDate || 'Unknown';
        const country = leadData.result?.Country__c || 'Unknown';
        return {
          leadName, // Include lead's name
          ownerId, // Include lead's owner ID
          status, // Include lead's status
          createdDate, // Include lead's created date
          country, // Include lead's country
          evaluation: jsonResponse.evaluation, // Keep existing evaluation data
          apiCount, // Include the API count
        };
      } catch (error) {
        console.error('Error processing LLM response:', error);
        throw new Error('Failed to process LLM response');
      }
    } catch (error) {
      throw new Error(`Error in rateLead: ${error.message}`);
    }
  }
  private transformActivityResult(activityResultRaw: any): any {
    const parsedBody = JSON.parse(activityResultRaw.result.body);
    const records = parsedBody?.result?.records || [];

    // Filter out null fields from each record
    const cleanedRecords = records.map((record: any) => {
      return Object.fromEntries(
        Object.entries(record).filter(([key, value]) => value !== null),
      );
    });

    return {
      success: activityResultRaw.success,
      executionTime: activityResultRaw.executionTime,
      totalSize: parsedBody?.result?.totalSize || 0,
      records: cleanedRecords,
    };
  }
  async rateLeads(
    serverUrl: string,
    recordToolId: string,
    describeToolId: string,
    activityToolId: string,
    patchToolId: string,
    criteriaRecordId: string,
    // recordIds: string[],
    instanceName: string,
    userId: string,
  ): Promise<any[]> {
    try {
      let apiCount = 0;
      const NDays = 100;
      // Step 1: Get the first 10 lead records
      const leadRecords = await this.toolTestingService.runTest(
        serverUrl,
        activityToolId,
        {
          query: `SELECT Id FROM Lead WHERE CreatedDate = LAST_N_DAYS:${NDays} LIMIT 5`,
        },
      );
      apiCount++;
      console.log('Lead Records Response:', leadRecords);

      // Parse the JSON string to an object
      const responseBody = JSON.parse(leadRecords.result.body);

      // Now access the records
      const recordIds = responseBody.result.records.map(
        (record: any) => record.Id,
      );

      this.logger.debug(
        `Rating leads: ${recordIds} with tools: ${recordToolId}, ${describeToolId}, ${activityToolId}`,
      );
      const tableData: any[] = [];

      // Step 2: Run the describe tool twice (once with "Event" and once with "Task")
      const describeEvent = await this.toolTestingService.runTest(
        serverUrl,
        describeToolId,
        { objectName: 'Event' },
      );
      apiCount++;
      const describeTask = await this.toolTestingService.runTest(
        serverUrl,
        describeToolId,
        { objectName: 'Task' },
      );
      apiCount++;
      const eventFields =
        JSON.parse(describeEvent.result.body)?.result.fieldNames || [];
      const taskFields =
        JSON.parse(describeTask.result.body)?.result.fieldNames || [];

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
      const criteriaResponseBody = JSON.parse(criteriaRecordData.result.body);
      const recordData = criteriaResponseBody.result?.recordData || {};

      // Extract the questions into a list
      const criteriaQuestions = [
        recordData.Question_1__c,
        recordData.Question_2__c,
        recordData.Question_3__c,
        recordData.Question_4__c,
      ];
      this.logger.debug(`Criteria Questions: ${criteriaQuestions}`);
      // Step 4: Process each lead
      for (const recordId of recordIds) {
        try {
          // Step 4.1: Call rateLead for each record ID
          const leadEvaluation = await this.rateLead(
            serverUrl,
            recordToolId,
            activityToolId,
            eventFields,
            taskFields,
            criteriaQuestions,
            recordId,
            apiCount,
            instanceName,
            userId,
          );

          // Step 4.2: Extract evaluation data
          const evaluation = leadEvaluation?.evaluation || [];
          const leadData: Record<string, any> = {
            id: recordId,
          };

          // Step 4.3: Append evaluation results to the row
          evaluation.forEach((entry, index) => {
            const criteriaKey = `Budy_Criteria_${index + 1}__c`;
            const justificationKey = `Budy_Justification_${index + 1}__c`;
            leadData[criteriaKey] = entry.outcome;
            leadData[justificationKey] = entry.justification;
          });
          // Step 4.4: Compute lead score
          const leadScore = this.computeLeadScore(evaluation);
          leadData['Budy_Lead_Score__c'] = leadScore;

          // Step 4.5: Add the row to the table data
          tableData.push(leadData);

          // Step 4.6: Update the API count
          apiCount = leadEvaluation.apiCount;
        } catch (error) {
          this.logger.error(
            `Error processing LeadId ${recordId}: ${error.message}`,
          );
        }
      }
      this.logger.debug(`Lead Results: ${JSON.stringify(tableData)}`);
      // Step 5: Run the patch tool to update the records
      await this.toolTestingService.runTest(serverUrl, patchToolId, {
        objectName: 'Lead',
        fieldNames: [
          'id',
          'Budy_Criteria_1__c',
          'Budy_Jusitification_1__c',
          'Budy_Criteria_2__c',
          'Budy_Jusitification_2__c',
          'Budy_Criteria_3__c',
          'Budy_Jusitification_3__c',
          'Budy_Criteria_4__c',
          'Budy_Jusitification_4__c',
          'Budy_Lead_Score__c',
        ],
        records: tableData,
      });
      apiCount++;

      //   // Create a Google Folder
      //   const folderTitle = 'Lead Ratings Folder';
      //   const folderId =
      //     await this.googleSheetService.createGoogleDriveFolder(folderTitle);

      //   // Create a Google Sheet
      //   const sheetTitle = 'Lead Ratings';
      //   const sheetId = await this.googleSheetService.createGoogleSheet(
      //     sheetTitle,
      //     folderId,
      //     userId,
      //   );

      //   // Add the table data to a sheet
      //   await this.googleSheetService.writeToSheet(sheetId, tableData);
      //   this.logger.debug(`Wrote data to Google Sheet: ${sheetId}`);

      // query to get all SDRs
      // query to get count per lead status for all SDRs
      // query to get count per lead score for all SDRs

      // Get all SDR Ids
      //   const sdrQuery = `SELECT OwnerId
      //                     FROM Lead
      //                     WHERE CreatedDate = LAST_N_DAYS:3
      //                     GROUP BY OwnerId
      //                     `;
      //   const sdrResults = await this.toolTestingService.runTest(
      //     serverUrl,
      //     activityToolId,
      //     { query: sdrQuery },
      //   );
      //   apiCount++;
      //   const sdrIds = sdrResults.result.records.map(
      //     (record: any) => record.OwnerId,
      //   );

      //  // Get status data for each SDR
      const statusQuery = `SELECT OwnerId, Status, COUNT(Id) LeadCount
                            FROM Lead
                            WHERE CreatedDate = LAST_N_DAYS:${NDays}
                            GROUP BY OwnerId, Status
                            ORDER BY OwnerId LIMIT 5
                            `;
      const statusResults = await this.toolTestingService.runTest(
        serverUrl,
        activityToolId,
        { query: statusQuery },
      );
      apiCount++;
      const statusResponse = JSON.parse(statusResults.result.body);
      console.log('Status Data:', statusResponse);

      //   // Get score data for each SDR
      //   const scoreQuery = `SELECT OwnerId, Status, COUNT(Id) LeadCount
      //                         FROM Lead
      //                         WHERE CreatedDate = LAST_N_DAYS:14
      //                         GROUP BY OwnerId, Status
      //                         ORDER BY OwnerId
      //                         `;
      //   const scoreResults = await this.toolTestingService.runTest(
      //     serverUrl,
      //     activityToolId,
      //     { query: scoreQuery },
      //   );
      //   apiCount++;
      //   const scoreData = statusResults.result.records;

      const parseSDRReport = (response) => {
        const report = {};

        response.records.forEach((record) => {
          const { OwnerId, Status, LeadCount } = record;

          // Initialize SDR report if not already present
          if (!report[OwnerId]) {
            report[OwnerId] = {
              'Open Leads': 0,
              'Dropped Leads': 0,
              'Qualified Leads': 0,
              'Total Leads': 0,
            };
          }

          // Categorize counts based on Status
          if (['New', 'Working'].includes(Status)) {
            report[OwnerId]['Open Leads'] += LeadCount;
          } else if (Status === 'Dropped') {
            report[OwnerId]['Dropped Leads'] += LeadCount;
          } else if (Status === 'Qualified') {
            report[OwnerId]['Qualified Leads'] += LeadCount;
          }

          // Increment total lead count
          report[OwnerId]['Total Leads'] += LeadCount;
        });

        return report;
      };

      const sdrReport = parseSDRReport(statusResponse.result);
      this.logger.debug(`SDR Report: ${JSON.stringify(sdrReport)}`);

      this.logger.debug(`Approximate API Count: ${apiCount}`);

      return tableData;
    } catch (error) {
      throw new Error(`Error in rateLeads: ${error.message}`);
    }
  }
  // write a function to compute lead score from the evaluation (percentage of yes out of four questions)
  private computeLeadScore(evaluation: any): number {
    const yesCount = evaluation.filter(
      (entry: any) => entry.outcome === 'Yes',
    ).length;
    return (yesCount / 4) * 100;
  }
}
