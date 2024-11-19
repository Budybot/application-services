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
      const leadData = await this.toolTestingService.runTest(
        serverUrl,
        recordToolId,
        {
          recordId: recordId,
          objectName: 'Lead',
        },
      );
      this.logger.debug(`Lead data: ${JSON.stringify(leadData)}`);

      // Step 2: Run the describe tool twice (once with "Event" and once with "Task")
      const describeEvent = await this.toolTestingService.runTest(
        serverUrl,
        describeToolId,
        { objectName: 'Event' },
      );
      this.logger.debug(`Describe results: ${JSON.stringify(describeEvent)}`);
      const describeTask = await this.toolTestingService.runTest(
        serverUrl,
        describeToolId,
        { objectName: 'Task' },
      );
      this.logger.debug(`Describe results: ${JSON.stringify(describeTask)}`);

      // Step 3: Run the activity tool twice:
      // First with { event: true, recordId }
      const activityTask = await this.toolTestingService.runTest(
        serverUrl,
        activityToolId,
        {
          query: `
            SELECT Id, WhoId, WhatId, Subject, ActivityDate, Status, Priority, IsHighPriority, OwnerId, Description, IsDeleted, AccountId, IsClosed, CreatedDate, CreatedById, LastModifiedDate, LastModifiedById, SystemModstamp, IsArchived, CallDurationInSeconds, CallType, CallDisposition, CallObject, ReminderDateTime, IsReminderSet, RecurrenceActivityId, IsRecurrence, RecurrenceStartDateOnly, RecurrenceEndDateOnly, RecurrenceTimeZoneSidKey, RecurrenceType, RecurrenceInterval, RecurrenceDayOfWeekMask, RecurrenceDayOfMonth, RecurrenceInstance, RecurrenceMonthOfYear, RecurrenceRegeneratedType, TaskSubtype, CompletedDateTime, Meeting_Outcome__c FROM Task WHERE WhoId = '${recordId}'
            `,
        },
      );
      this.logger.debug(`Activity results: ${JSON.stringify(activityTask)}`);

      // Second with { event: false, recordId }
      const activityEvent = await this.toolTestingService.runTest(
        serverUrl,
        activityToolId,
        {
          query: `
            SELECT Id, WhoId, WhatId, WhoCount, WhatCount, Subject, Location, IsAllDayEvent, ActivityDateTime, ActivityDate, DurationInMinutes, StartDateTime, EndDateTime, EndDate, Description, AccountId, OwnerId, CurrencyIsoCode, Type, IsPrivate, ShowAs, IsDeleted, IsChild, IsGroupEvent, GroupEventType, CreatedDate, CreatedById, LastModifiedDate, LastModifiedById, SystemModstamp, IsArchived, RecurrenceActivityId, IsRecurrence, RecurrenceStartDateTime, RecurrenceEndDateOnly, RecurrenceTimeZoneSidKey, RecurrenceType, RecurrenceInterval, RecurrenceDayOfWeekMask, RecurrenceDayOfMonth, RecurrenceInstance, RecurrenceMonthOfYear, ReminderDateTime, IsReminderSet, EventSubtype, IsRecurrence2Exclusion, Recurrence2PatternText, Recurrence2PatternVersion, IsRecurrence2, IsRecurrence2Exception, Recurrence2PatternStartDate, Recurrence2PatternTimeZone, Interested_Product__c, Highest_Decision_Maker_Level_in_Meeting__c, UpdateExpected_Date_Task__c, Meeting_Duration__c, Calendly__InviteeUuid__c, Calendly__IsRescheduled__c, Customer_Total_Monthly_Content_Budgets_S__c, Content_Marketing_Objective__c, Retainer_Actionables__c, Content_Strategy_Actionables__c, Actionable_Sales__c, Actionable_Leadership__c, Overall_Sentiment__c, Meeting_Type__c, Unique_Code__c, Unique_Meeting__c, Other_Participants__c, Updated_Activity_Id__c, Account_Type__c, B__c, Quality_Sentiment__c, Delivery_Sentiment__c, Servicing_Sentiment__c, Meeting_Theme__c, Actionable_KAM__c, Team__c, Count__c, Meeting_Outcome__c, Call_Disposition__c, Call_Direction__c, Call_Notes__c, Call_Duration_seconds__c, Opportunity__c, Revenue_Type__c, Days_to_Opportunity__c, Amount__c, Unique__c, Call_Unique_Code__c, Meeting_Taker__c, Meeting_Status__c, Meeting_Sourced_by__c, First_Attempt__c, Call__c, Connected_Call__c, Updated_Duration_Minutes__c, Due_Date_Update_Check__c, MRR_AMount__c, Closure_Probability__c, Source_of_Meeting__c, Duration__c, Manager_Qualification__c, Opportunity_Owner__c, Sequence_Name__c, Extracted_Event_Id__c, Meeting_Funnel__c FROM Event WHERE WhoId = '${recordId}'
            `,
        },
      );
      this.logger.debug(`Activity results: ${JSON.stringify(activityEvent)}`);

      // Combine results into a single object
      return {
        leadData,
        describeResults: {
          event: describeEvent,
          task: describeTask,
        },
        activityResults: {
          event: activityEvent,
          task: activityTask,
        },
      };
    } catch (error) {
      throw new Error(`Error in rateLead: ${error.message}`);
    }
  }
}
