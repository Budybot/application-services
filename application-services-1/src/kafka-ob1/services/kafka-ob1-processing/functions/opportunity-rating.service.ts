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
  private readonly defaultToolEnvVars = {
    sf_instance_url:
      process.env.SALESFORCE_INSTANCE_URL ||
      'https://my-salesforce-instance.salesforce.com',
    sf_access_token: process.env.SALESFORCE_TOKEN || 'default-sf-access-token',
  };

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
      {
        toolInputVariables: {
          objectName,
        },
        toolInputENVVariables: this.defaultToolEnvVars,
      },
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
        batchSize,
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
        {
          toolInputVariables: {
            query: finalQuery,
          },
          toolInputENVVariables: this.defaultToolEnvVars,
        },
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

      const batches = this.chunkArray(opportunityIds, batchSize);
      const allScores = [];

      for (const batch of batches) {
        // Query opportunity data
        const oppQuery = `SELECT ${opportunityFields.join(',')} FROM Opportunity WHERE Id IN ('${batch.join("','")}')`;
        const oppResponse = await this.agentServiceRequest.sendToolRequest(
          personId,
          userOrgId,
          queryToolId,
          {
            toolInputVariables: {
              query: oppQuery,
            },
            toolInputENVVariables: this.defaultToolEnvVars,
          },
        );
        apiCount++;

        // Query activities (events and tasks)
        const eventQuery = `SELECT ${eventFields.join(',')} FROM Event WHERE WhatId IN ('${batch.join("','")}') LIMIT 3`;
        const taskQuery = `SELECT ${taskFields.join(',')} FROM Task WHERE WhatId IN ('${batch.join("','")}') LIMIT 3`;

        const [eventResponse, taskResponse] = await Promise.all([
          this.agentServiceRequest.sendToolRequest(
            personId,
            userOrgId,
            queryToolId,
            {
              toolInputVariables: {
                query: eventQuery,
              },
              toolInputENVVariables: this.defaultToolEnvVars,
            },
          ),
          this.agentServiceRequest.sendToolRequest(
            personId,
            userOrgId,
            queryToolId,
            {
              toolInputVariables: {
                query: taskQuery,
              },
              toolInputENVVariables: this.defaultToolEnvVars,
            },
          ),
        ]);
        apiCount += 2; // Two activity queries

        // Process each opportunity
        for (const opp of oppResponse.messageContent.toolResult.result
          .records) {
          const events =
            eventResponse.messageContent.toolResult.result.records.filter(
              (e) => e.WhatId === opp.Id,
            );
          const tasks =
            taskResponse.messageContent.toolResult.result.records.filter(
              (t) => t.WhatId === opp.Id,
            );
          const activities = [...events, ...tasks];

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
            `Deal Risks: Budget Availability and Access to Decision Maker Risk
Definition: Does the Opportunity exhibit potential deal risks related to budget availability or access to decision-makers that could delay or prevent closure?
Key Metrics:
- Budget Availability Risk: Activity descriptions reference buyer concerns such as "budget freezes," "price concerns," or "budget constraints." No explicit mention of budget approval or readiness in meeting or demo outcomes.
- Access to Decision Maker Risk: Activities lack the presence of key decision-makers (e.g., Director, VP, or C-level) in meeting participants or communication threads. No verbal or written confirmation of decision-making readiness is logged in the Opportunity's activities.
Objective: Identify and flag Opportunities at risk due to budget issues or insufficient access to decision-makers. This allows the sales team to focus on resolving these blockers and improving deal confidence.`,

            `Timing Risks
Definition: Does the Opportunity exhibit risks related to timing that could delay its closure or impact its forecasted Close Date?
Key Metrics:
- Historical Slippage: The Opportunity's CloseDate has been changed more than once in the last 30 days. Frequent updates or unrealistic Close Dates (e.g., unusually early compared to historical trends).
- Opportunity Age: Opportunity Age (Post-Demo Stage) exceeds the median age for Opportunities that closed successfully in the same quarter last year.
- Time in Current Stage: The number of days in the current stage exceeds the median stage duration for closed Opportunities from the last year.
- Proximity to Deadlines: The CloseDate is within 30 days of the quarter-end but Opportunity stage or progress does not align with expected timelines.
Objective: Identify Opportunities with high timing risks to prioritize follow-up and recalibrate forecasts. Highlight deals with inconsistent timing patterns, slippage trends, or misaligned Close Dates that could disrupt sales predictability.`,

            `Product Fit Risks
Definition: Does the Opportunity exhibit risks related to product fit, where the customer's needs, use cases, or objections indicate potential misalignment with the offered solution?
Key Metrics:
- Demo Call Feedback: Gong demo call notes or Activity descriptions highlight concerns such as unmet requirements, feature gaps, or lack of clarity on product fit. No clear alignment between the customer's expressed use cases and the product's capabilities.
- Customer Use Cases: Use_Cases__c field is either empty or does not match standard product solutions provided.
- Stage-Appropriate Fit Assessment: For Opportunities in SQL or Due Diligence stages, there is no record of product fit validation (e.g., objections raised but not addressed, or no next steps logged).
Objective: Identify Opportunities where product fit risks could derail progress, ensuring timely resolution of concerns and alignment between the customer's needs and the solution offered.`,

            `Legal Risks
Definition: Does the Opportunity exhibit legal or due diligence risks that could delay closure or complicate the agreement process?
Key Metrics:
- Opportunity Amount Threshold: Only Opportunities with an Amount greater than $80,000 are evaluated for legal risks.
- Contentious Points in Communication: Legal-related Activity descriptions or email transcripts reference significant points of disagreement (e.g., SLA terms, data privacy concerns). Indications of rigidity from the customer's legal team on specific contractual language.
- Unusual Document Requests: Documents outside the standard pre-order process (e.g., SLA agreements, additional data privacy requirements) are flagged in Activities or email transcripts as under review or requiring extended discussion.
Objective: Identify Opportunities at risk of delay due to legal complexities, ensuring proper prioritization and mitigation strategies are in place to avoid last-minute disruptions to the sales process.`,
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

          // Step 5: Calculate score from LLM response and store evaluation
          const score = this.calculateScore(llmResponse.messageContent.content);
          const bucket = this.getScoreBucket(score);
          allScores.push({
            opportunityId: opp.Id,
            score,
            bucket,
            opportunityName: opp.Name,
            amount: opp.Amount,
            stage: opp.StageName,
            evaluation: llmResponse.messageContent.content.evaluation,
          });
        }
      }

      this.logger.debug('All scores', { scores: allScores, apiCount });

      // Create a new Google Sheet for the results
      const sheetTitle = `Opportunity Ratings - ${new Date().toISOString().split('T')[0]}`;
      const sheetId = await this.googleSheetService.createGoogleSheet(
        sheetTitle,
        undefined,
        'theo@budy.bot',
        'writer',
      );
      this.logger.log(
        `Created Google Sheet for opportunity ratings: ${sheetId}`,
      );

      // Prepare data for the sheet
      const headers = [
        'Opportunity ID',
        'Opportunity Name',
        'Amount',
        'Stage',
        'Risk Score',
        'Risk Bucket',
        'Deal Risks Outcome',
        'Deal Risks Justification',
        'Timing Risks Outcome',
        'Timing Risks Justification',
        'Product Fit Risks Outcome',
        'Product Fit Risks Justification',
        'Legal Risks Outcome',
        'Legal Risks Justification',
      ];

      const rows = allScores.map((score) => {
        const evaluationMap = score.evaluation.reduce((acc: any, e: any) => {
          // Extract the risk type from the question (e.g., "Deal Risks", "Timing Risks", etc.)
          const riskType = e.question.split(':')[0].trim();
          acc[riskType] = {
            outcome: e.outcome,
            justification: e.justification || 'No justification provided',
          };
          return acc;
        }, {});

        return [
          score.opportunityId,
          score.opportunityName,
          score.amount?.toString() || 'N/A',
          score.stage,
          score.score.toString(),
          score.bucket,
          evaluationMap['Deal Risks']?.outcome || 'N/A',
          evaluationMap['Deal Risks']?.justification || 'N/A',
          evaluationMap['Timing Risks']?.outcome || 'N/A',
          evaluationMap['Timing Risks']?.justification || 'N/A',
          evaluationMap['Product Fit Risks']?.outcome || 'N/A',
          evaluationMap['Product Fit Risks']?.justification || 'N/A',
          evaluationMap['Legal Risks']?.outcome || 'N/A',
          evaluationMap['Legal Risks']?.justification || 'N/A',
        ];
      });

      // Write data to the sheet
      await this.googleSheetService.writeToSheet(sheetId, [headers, ...rows]);
      this.logger.log(
        `Written ${rows.length} opportunities to sheet ${sheetId}`,
      );
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
    if (!llmResponse?.evaluation) {
      return 0;
    }

    const noCount = llmResponse.evaluation.filter(
      (entry: any) => entry.outcome === 'No',
    ).length;

    return (noCount / 4) * 100;
  }

  private getScoreBucket(score: number): string {
    if (score < 25) return 'Red';
    if (score < 50) return 'Yellow';
    if (score < 75) return 'Blue';
    return 'Green';
  }
}
