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
    queryToolId: string,
    patchToolId: string,
    createToolId: string,
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
        queryToolId,
        {
          query: `SELECT Id FROM Lead WHERE CreatedDate = LAST_N_DAYS:${NDays} LIMIT 1`,
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

      //   this.logger.debug(
      //     `Rating leads: ${recordIds} with tools: ${recordToolId}, ${describeToolId}, ${queryToolId}, ${patchToolId}, ${createToolId}`,
      //   );
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
      //   this.logger.debug(`Criteria Questions: ${criteriaQuestions}`);
      // Step 4: Process each lead
      for (const recordId of recordIds) {
        try {
          // Step 4.1: Call rateLead for each record ID
          const leadEvaluation = await this.rateLead(
            serverUrl,
            recordToolId,
            queryToolId,
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
          function getLeadScoreColor(leadScore) {
            if (leadScore < 25) return 'Red';
            if (leadScore < 50) return 'Yellow';
            if (leadScore < 75) return 'Blue';
            return 'Green';
          }
          leadData['Budy_Lead_Score__c'] = leadScore;
          leadData['Budy_Lead_Score_Bucket__c'] = getLeadScoreColor(leadScore);
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
      //   this.logger.debug(`Lead Results: ${JSON.stringify(tableData)}`);
      // Step 5: Run the patch tool to update the records
      //   await this.toolTestingService.runTest(serverUrl, patchToolId, {
      //     record_type: 'Lead',
      //     field_names: [
      //       'Budy_Criteria_1__c',
      //       'Budy_Justification_1__c',
      //       'Budy_Criteria_2__c',
      //       'Budy_Justification_2__c',
      //       'Budy_Criteria_3__c',
      //       'Budy_Justification_3__c',
      //       'Budy_Criteria_4__c',
      //       'Budy_Justification_4__c',
      //       'Budy_Lead_Score__c',
      //       'Budy_Lead_Score_Bucket__c',
      //     ],
      //     records: tableData,
      //   });
      //   apiCount++;
      // Helper function to split the array into chunks of 20
      function chunkArray(array: any[], chunkSize: number): any[][] {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
          chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
      }

      // Process tableData in chunks of 20
      const chunkSize = 20;
      const tableDataChunks = chunkArray(tableData, chunkSize);

      for (const chunk of tableDataChunks) {
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
          records: chunk,
        });
        apiCount++;
      }

      //  // Get status data for each SDR
      const statusQuery = `SELECT OwnerId, Owner.Name, Status, COUNT(Id) LeadCount
                            FROM Lead
                            WHERE CreatedDate = LAST_N_DAYS:${NDays}
                            GROUP BY OwnerId, Owner.Name, Status
                            ORDER BY OwnerId
                            `;

      const statusResults = await this.toolTestingService.runTest(
        serverUrl,
        queryToolId,
        { query: statusQuery },
      );
      apiCount++;
      const statusResponse = JSON.parse(statusResults.result.body);
      console.log('Status Data:', statusResponse.result.records[0]);

      // Get score data for each SDR
      const scoreQuery = `SELECT OwnerId, Budy_Lead_Score_Bucket__c, COUNT(Id) LeadCount
                    FROM Lead
                    WHERE CreatedDate = LAST_N_DAYS:${NDays}
                    GROUP BY OwnerId, Budy_Lead_Score_Bucket__c
                    ORDER BY OwnerId
                    `;
      const scoreResults = await this.toolTestingService.runTest(
        serverUrl,
        queryToolId,
        { query: scoreQuery },
      );
      apiCount++;
      const scoreResponse = JSON.parse(scoreResults.result.body);
      console.log('Sample Score Data:', scoreResponse.result.records[0]);

      const parseSDRReport = (response) => {
        const report = {};

        response.records.forEach((record) => {
          const { OwnerId, Name, Status, LeadCount } = record;

          // Initialize SDR report if not already present
          if (!report[OwnerId]) {
            report[OwnerId] = {
              Name: Name,
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
      const parseScoreReport = (response) => {
        const scoreReport = {};

        response.records.forEach((record) => {
          const { OwnerId, Budy_Lead_Score_Bucket__c, LeadCount } = record;
          const bucket = Budy_Lead_Score_Bucket__c;
          const leadCount = Number(LeadCount);

          // Determine bucket based on score
          let bucketNumber = 0;
          if (bucket === 'Red') {
            bucketNumber = 1;
          } else if (bucket === 'Yellow') {
            bucketNumber = 2;
          } else if (bucket === 'Blue') {
            bucketNumber = 3;
          } else if (bucket === 'Green') {
            bucketNumber = 4;
          } else {
            this.logger.warn(`Unknown bucket: ${bucket}`);
          }
          this.logger.debug(`Bucket: ${bucket}`);

          // Initialize SDR report if not already present
          if (!scoreReport[OwnerId]) {
            scoreReport[OwnerId] = {
              Bucket_1_Leads__c: 0,
              Bucket_2_Leads__c: 0,
              Bucket_3_Leads__c: 0,
              Bucket_4_Leads__c: 0,
            };
          }

          // Increment bucket count
          if (bucket >= 1 && bucket <= 4) {
            scoreReport[OwnerId][`Bucket_${bucketNumber}_Leads__c`] +=
              leadCount;
          }
        });

        return scoreReport;
      };
      function getYearAndWeek() {
        const now = new Date();

        // Calculate the start of the year
        const startOfYear = new Date(now.getFullYear(), 0, 1);

        // Get the number of days between the start of the year and now
        const dayOfYear = Math.ceil(
          (now.getTime() -
            startOfYear.getTime() +
            (startOfYear.getTimezoneOffset() - now.getTimezoneOffset()) *
              60 *
              1000) /
            (1000 * 60 * 60 * 24),
        );

        // Calculate the week number
        const weekNumber = Math.ceil(dayOfYear / 7);

        // Return in "YYYY_Week_X" format
        return `${now.getFullYear()}_Week_${weekNumber}`;
      }

      const currentYearWeek = getYearAndWeek();
      console.log('Current Year Week:', currentYearWeek);

      const transformToSnapshotRecords = (sdrReport, scoreReport) => {
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
            Year_Work_Week__c: currentYearWeek,
          });
        });

        return records;
      };

      // Example usage

      const sdrReport = parseSDRReport(statusResponse.result);
      //   this.logger.debug(`SDR Report: ${JSON.stringify(sdrReport)}`);
      const scoreReport = parseScoreReport(scoreResponse.result);
      //   this.logger.debug(`Score Report: ${JSON.stringify(scoreReport)}`);

      const snapshotRecords = transformToSnapshotRecords(
        sdrReport,
        scoreReport,
      );
      const snapshotRecordChunks = chunkArray(snapshotRecords, chunkSize);

      for (const chunk of snapshotRecordChunks) {
        await this.toolTestingService.runTest(serverUrl, createToolId, {
          object_name: 'Budy_SDR_Snapshot__c',
          records: chunk,
        });
        apiCount++;
      }

      //   await this.toolTestingService.runTest(serverUrl, createToolId, {
      //     object_name: 'Budy_SDR_Snapshot__c',
      //     records: snapshotRecords,
      //   });

      this.logger.debug(
        `Lead rating process completed successfully. Total API calls: ${apiCount}`,
      );

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
