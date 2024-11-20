import { Injectable, Logger } from '@nestjs/common';
import { ToolTestingService } from '../tool-tester.service';
import { AgentServiceRequest } from '../agent-service-request.service';

@Injectable()
export class LeadRatingService {
  private readonly logger = new Logger(LeadRatingService.name);
  constructor(
    private readonly toolTestingService: ToolTestingService,
    private readonly agentServiceRequest: AgentServiceRequest,
  ) {}

  async rateLead(
    serverUrl: string,
    recordToolId: string,
    describeToolId: string,
    activityToolId: string,
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

      // Step 4: Run LLM call
      const systemPrompt = `
      You are an expert Salesforce evaluator tasked with assessing an SDR's responsiveness and performance for a given lead. You will be provided with two data sets:

Lead Data: Detailed Salesforce information about the lead.
Activity Data: Records of interactions, activities, or communications associated with the lead.
Using this information, evaluate the following:

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
      // Clean the response: Remove backticks and whitespace
      const cleanedResponse = llmResponse
        .trim()
        .replace(/^```json/, '')
        .replace(/```$/, '')
        .trim();

      // Parse the cleaned response into JSON
      const jsonResponse = JSON.parse(cleanedResponse);

      return jsonResponse;
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
}
