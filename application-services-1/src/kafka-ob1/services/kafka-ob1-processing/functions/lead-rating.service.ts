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
      //   this.logger.debug(`Raw Lead Data: ${JSON.stringify(leadDataRaw)}`);

      // Restructure the lead data to only contain field names and values
      const leadData = {
        success: leadDataRaw.success,
        executionTime: leadDataRaw.executionTime,
        result: JSON.parse(leadDataRaw.result.body)?.result.recordData || {},
      };
      //   this.logger.debug(`Restructured Lead Data: ${JSON.stringify(leadData)}`);

      //   // Step 2: Run the describe tool twice (once with "Event" and once with "Task")
      //   const describeEvent = await this.toolTestingService.runTest(
      //     serverUrl,
      //     describeToolId,
      //     { objectName: 'Event' },
      //   );
      //   //   this.logger.debug(`Describe results: ${JSON.stringify(describeEvent)}`);
      //   const describeTask = await this.toolTestingService.runTest(
      //     serverUrl,
      //     describeToolId,
      //     { objectName: 'Task' },
      //   );
      //   //   this.logger.debug(`Describe results: ${JSON.stringify(describeTask)}`);

      //   const eventFields =
      //     JSON.parse(describeEvent.result.body)?.result.fieldNames || [];
      //   const taskFields =
      //     JSON.parse(describeTask.result.body)?.result.fieldNames || [];

      // Build queries dynamically
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

      const activityTaskRaw = await this.toolTestingService.runTest(
        serverUrl,
        activityToolId,
        {
          query: taskQuery,
        },
      );

      // Transform activity results
      const activityResults = {
        event: this.transformActivityResult(activityEventRaw),
        task: this.transformActivityResult(activityTaskRaw),
      };

      // put questions inside prompt
      // Step 4: Run LLM call
      const systemPrompt = `
      You are an expert Salesforce evaluator tasked with assessing an SDR's responsiveness and performance for a given lead. You will be provided with two data sets:

Lead Data: Detailed Salesforce information about the lead.
Activity Data: Records of interactions, activities, or communications associated with the lead.
Using this information, evaluate the following:

${criteriaQuestions.join('\n')}

Was the SDR responsive to the lead?
Did the SDR follow proper Salesforce protocols?
Was the lead outcome successful?
Did the SDR demonstrate strong sales skills?
For each question, provide a response of either 'Yes,' 'No,' or 'NA.' Justify your answer in one sentence, referencing the provided data. If the available data is insufficient to answer a question, respond with 'NA' and note that there is not enough information to make a determination.
Provide your response only as a structured JSON object in the following format, without any additional text or explanation:
    {
  "evaluation": [
    {
      "question": "Was the SDR responsive to the lead?",
      "outcome": "Yes/No/NA",
      "justification": "Provide justification here."
    },
    {
      "question": "Did the SDR follow proper Salesforce protocols?",
      "outcome": "Yes/No/NA",
      "justification": "Provide justification here."
    },
    {
      "question": "Was the lead outcome successful?",
      "outcome": "Yes/No/NA",
      "justification": "Provide justification here."
    },
    {
      "question": "Did the SDR demonstrate strong sales skills?",
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
    recordIds: string[], // List of record IDs
    instanceName: string,
    userId: string,
  ): Promise<any[]> {
    try {
      this.logger.debug(
        `Rating leads: ${recordIds} with tools: ${recordToolId}, ${describeToolId}, ${activityToolId}`,
      );
      // Prepare an array to hold the processed results
      const tableData: any[] = [];

      // Initialize the column names (header row for the table)
      //   const columns = [
      //     'LeadId',
      //     'Lead Name',
      //     'Status',
      //     'Owner ID',
      //     'Created Date',
      //     'Country',
      //     'Was the SDR responsive to the lead?',
      //     'Justification',
      //     'Did the SDR follow proper Salesforce protocols?',
      //     'Justification',
      //     'Was the lead outcome successful?',
      //     'Justification',
      //     'Did the SDR demonstrate strong sales skills?',
      //     'Justification',
      //   ];
      //   tableData.push(columns); // Add the header row to the table

      // Step 2: Run the describe tool twice (once with "Event" and once with "Task")
      const describeEvent = await this.toolTestingService.runTest(
        serverUrl,
        describeToolId,
        { objectName: 'Event' },
      );
      //   this.logger.debug(`Describe results: ${JSON.stringify(describeEvent)}`);
      const describeTask = await this.toolTestingService.runTest(
        serverUrl,
        describeToolId,
        { objectName: 'Task' },
      );
      //   this.logger.debug(`Describe results: ${JSON.stringify(describeTask)}`);

      const eventFields =
        JSON.parse(describeEvent.result.body)?.result.fieldNames || [];
      const taskFields =
        JSON.parse(describeTask.result.body)?.result.fieldNames || [];

      // Get criteria record data
      const criteriaRecordData = await this.toolTestingService.runTest(
        serverUrl,
        recordToolId,
        {
          recordId: 'PLACEHOLDER',
          objectName: 'Budy_Lead_Criteria__c',
        },
      );
      const criteriaQuestions = criteriaRecordData.result?.recordData || []; // get questions from criteria objects

      // Process each lead
      for (const recordId of recordIds) {
        try {
          // Call rateLead for each record ID
          const leadEvaluation = await this.rateLead(
            serverUrl,
            recordToolId,
            activityToolId,
            eventFields,
            taskFields,
            criteriaQuestions,
            recordId,
            instanceName,
            userId,
          );

          // Extract evaluation data
          const evaluation = leadEvaluation?.evaluation || [];
          const row: any[] = [
            recordId,
            // leadEvaluation.leadName,
            // leadEvaluation.status,
            // leadEvaluation.ownerId,
            // leadEvaluation.createdDate,
            // leadEvaluation.country,
          ]; // Start the row with the LeadId

          // Append evaluation results to the row
          for (const entry of evaluation) {
            row.push(entry.outcome); // Add outcome
            row.push(entry.justification); // Add justification
          }
          const leadScore = this.computeLeadScore(evaluation);
          row.push(leadScore); // Add the lead score to the row

          // Add the row to the table data
          tableData.push(row);
        } catch (error) {
          this.logger.error(
            `Error processing LeadId ${recordId}: ${error.message}`,
          );
        }
      }

    //   await this.toolTestingService.runTest(serverUrl, patchToolId, {
    //     objectName: 'Lead',
    //     fieldNames: [
    //       'id',
    //       'Budy_Criteria_1__c',
    //       'Budy_Jusitification_1__c',
    //       'Budy_Criteria_2__c',
    //       'Budy_Jusitification_2__c',
    //       'Budy_Criteria_3__c',
    //       'Budy_Jusitification_3__c',
    //       'Budy_Criteria_4__c',
    //       'Budy_Jusitification_4__c',
    //       'Budy_Lead_Score__c',
    //     ],
    //     records: tableData,
    //   });

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
      this.logger.debug(`Table Data: ${JSON.stringify(tableData)}`);
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
