import { Injectable, Logger, Inject } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';
import { ClientKafka } from '@nestjs/microservices';
import {
  OB1Global,
  CURRENT_SCHEMA_VERSION,
} from 'src/interfaces/ob1-message.interfaces';
import { GoogleSheetService } from '../../google/google-sheet.service';

@Injectable()
export class OpportunityRatingService {
  private readonly logger = new Logger(OpportunityRatingService.name);

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
      !describeResult.messageContent?.toolResult?.result?.fieldNames
    ) {
      throw new Error(
        `Failed to describe object fields: ${
          describeResult.messageContent?.toolError?.message ||
          describeResult.messageContent?.toolResult?.message ||
          'Unknown error'
        }`,
      );
    }

    const fields = describeResult.messageContent.toolResult.result.fieldNames;

    const fieldsToExclude = [];
    return fields.filter(
      (field) => !field.startsWith('Budy_') && !fieldsToExclude.includes(field),
    );
  }

  async processOpportunityRating(message: Record<string, any>): Promise<void> {
    let apiCount = 0;
    try {
      if (!message?.messageContent) {
        throw new Error('Invalid message format');
      }

      const {
        personId,
        userOrgId,
        queryToolId,
        describeToolId,
        promptId,
        customQuery,
        limit,
      } = message.messageContent;

      // Step 1: Query opportunity IDs
      let opportunityIds: string[] = [];
      const query =
        customQuery ||
        'SELECT Id FROM Opportunity WHERE CreatedDate = LAST_N_DAYS:14';
      const finalQuery = limit ? `${query} LIMIT ${limit}` : query;

      const queryResponse = await this.agentServiceRequest.sendToolRequest(
        personId,
        userOrgId,
        queryToolId,
        { query: finalQuery },
      );
      apiCount++;

      if (!queryResponse.messageContent?.toolSuccess) {
        throw new Error('Failed to query opportunities');
      }

      opportunityIds =
        queryResponse.messageContent.toolResult.result.records.map((r) => r.Id);

      // Step 2: Describe objects and get fields
      const [opportunityFields, eventFields, taskFields] = await Promise.all([
        this.describeObjectFields(
          describeToolId,
          'Opportunity',
          personId,
          userOrgId,
        ),
        this.describeObjectFields(describeToolId, 'Event', personId, userOrgId),
        this.describeObjectFields(describeToolId, 'Task', personId, userOrgId),
      ]);
      apiCount += 3; // Three describe requests

      // Step 3: Process opportunities in batches
      const batchSize = 20;
      const batches = this.chunkArray(opportunityIds, batchSize);
      const allScores = [];

      for (const batch of batches) {
        // Query opportunity data
        const oppQuery = `SELECT ${opportunityFields.join(',')} FROM Opportunity WHERE Id IN ('${batch.join("','")}')`;
        const oppResponse = await this.agentServiceRequest.sendToolRequest(
          personId,
          userOrgId,
          queryToolId,
          { query: oppQuery },
        );
        apiCount++;

        // Query activities (events and tasks)
        const eventQuery = `SELECT ${eventFields.join(',')} FROM Event WHERE WhatId IN ('${batch.join("','")}')`;
        const taskQuery = `SELECT ${taskFields.join(',')} FROM Task WHERE WhatId IN ('${batch.join("','")}')`;

        const [eventResponse, taskResponse] = await Promise.all([
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
        apiCount += 2; // Two activity queries

        // Process each opportunity
        for (const opp of oppResponse.messageContent.toolResult.result
          .records) {
          const activities = [
            ...eventResponse.messageContent.toolResult.result.records.filter(
              (e) => e.WhatId === opp.Id,
            ),
            ...taskResponse.messageContent.toolResult.result.records.filter(
              (t) => t.WhatId === opp.Id,
            ),
          ];

          // Step 4: Execute prompt with combined data

          const currentTime = new Date().toISOString();
          const userPrompt = `Time at the start of analysis: ${currentTime}.\nOpportunity Data: ${JSON.stringify(
            opp,
          )}\nActivity Results: ${JSON.stringify(activities)}`;

          const config = {
            provider: 'openai',
            model: 'gpt-4o-mini',
            temperature: 0.2,
            maxTokens: 4096,
          };

          const criteriaQuestions = [
            'Has there been recent, meaningful activity on this Opportunity within the last two weeks? (Look for events, tasks, or other interactions that show active engagement)',
            'Is there a known contact on this Opportunity who holds a decision-making title or a key buying role? (Check contact titles and roles for indicators of decision-making authority)',
            "Does the Opportunity's current stage logically align with its projected close date? (Evaluate if the stage progression matches typical sales cycle timing)",
            "Has the Opportunity's close date remained relatively stable over its recent history? (Check for frequent pushouts or changes to the close date)",
          ];

          const llmResponse =
            await this.agentServiceRequest.sendPromptExecutionRequest(
              personId,
              userOrgId,
              promptId,
              userPrompt,
              config,
              { criteriaQuestions: criteriaQuestions },
            );

          // Step 5: Calculate score from LLM response
          const score = this.calculateScore(llmResponse.messageContent.content);
          allScores.push({
            opportunityId: opp.Id,
            score,
            opportunityName: opp.Name,
            amount: opp.Amount,
            stage: opp.StageName,
          });
        }
      }

      this.logger.debug('All scores', { scores: allScores, apiCount });
    } catch (error) {
      this.logger.error('Error processing opportunity ratings', {
        error: error.message,
        stack: error.stack,
        apiCount,
      });
      throw error;
    }
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private calculateScore(llmResponse: any): number {
    // Implement score calculation based on LLM response
    // This is a placeholder - actual implementation will depend on LLM response format
    return Math.floor(Math.random() * 100); // Temporary random score
  }
}
