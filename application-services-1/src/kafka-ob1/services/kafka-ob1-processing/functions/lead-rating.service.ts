import { Injectable, Logger } from '@nestjs/common';
import { ToolTestingService } from '../tool-tester.service';

@Injectable()
export class LeadRatingService {
  private readonly logger = new Logger(LeadRatingService.name);
  constructor(private readonly toolTestingService: ToolTestingService) {}

  async rateLead(
    serverUrl: string,
    recordToolId: string,
    describeToolId: string,
    activityToolId: string,
    recordId: string,
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
      this.logger.debug(`Raw Lead Data: ${JSON.stringify(leadDataRaw)}`);

      // Restructure the lead data to only contain field names and values
      const leadData = {
        success: leadDataRaw.success,
        executionTime: leadDataRaw.executionTime,
        result: JSON.parse(leadDataRaw.result.body)?.result.recordData || {},
      };
      this.logger.debug(`Restructured Lead Data: ${JSON.stringify(leadData)}`);

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
      // Combine results into a single object
      return {
        leadData,
        // describeResults: {
        //   event: describeEvent,
        //   task: describeTask,
        // },
        activityResults: activityResults,
      };
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
