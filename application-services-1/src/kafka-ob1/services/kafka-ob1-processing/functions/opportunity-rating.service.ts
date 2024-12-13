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
      process.env.SF_SANDBOX_INSTANCE_URL ||
      'https://my-salesforce-instance.salesforce.com',
    sf_access_token: process.env.SF_SANDBOX_TOKEN || 'default-sf-access-token',
  };
  private readonly prodToolEnvVars = {
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
        toolInputENVVariables: this.prodToolEnvVars,
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
        activityPromptId,
        customQuery,
        limit,
        batchSize,
        criteriaRecordId,
        patchToolId,
        keyMetricsRecordId,
      } = message.messageContent;

      // Fetch criteria from Salesforce
      const criteriaQuery = `SELECT Name, Budy_Criteria_1__c, Budy_Criteria_2__c, Budy_Criteria_3__c, Budy_Criteria_4__c FROM Budy_Opportunity_Criteria__c WHERE Id = '${criteriaRecordId}'`;
      const criteriaResponse = await this.agentServiceRequest.sendToolRequest(
        personId,
        userOrgId,
        queryToolId,
        {
          toolInputVariables: {
            query: criteriaQuery,
          },
          toolInputENVVariables: this.defaultToolEnvVars,
        },
      );
      apiCount++;

      if (
        !criteriaResponse.messageContent?.toolSuccess ||
        !criteriaResponse.messageContent?.toolResult?.result?.records?.[0]
      ) {
        throw new Error('Failed to fetch criteria or criteria not found');
      }

      const criteriaRecord =
        criteriaResponse.messageContent.toolResult.result.records[0];
      const criteriaQuestions = [
        criteriaRecord.Budy_Criteria_1__c,
        criteriaRecord.Budy_Criteria_2__c,
        criteriaRecord.Budy_Criteria_3__c,
        criteriaRecord.Budy_Criteria_4__c,
      ].filter(Boolean); // Remove any null/undefined criteria

      if (criteriaQuestions.length === 0) {
        throw new Error('No criteria questions found in the criteria record');
      }

      // Format criteria questions for the input variable
      const formattedCriteriaQuestions = criteriaQuestions
        .map((question, index) => `${index + 1}) ${question}`)
        .join('\n');

      // Fetch key metrics
      const metricsQuery = `
        SELECT Budy_Key_Metric_1_Name__c, Budy_Key_Metric_1_Value__c,
               Budy_Key_Metric_2_Name__c, Budy_Key_Metric_2_Value__c,
               Budy_Key_Metric_3_Name__c, Budy_Key_Metric_3_Value__c,
               Budy_Key_Metric_4_Name__c, Budy_Key_Metric_4_Value__c,
               Budy_Key_Metric_5_Name__c, Budy_Key_Metric_5_Value__c,
               Budy_Key_Metric_6_Name__c, Budy_Key_Metric_6_Value__c
        FROM Budy_Opportunity_Key_Metrics__c 
        WHERE Id = '${keyMetricsRecordId}'`;

      const metricsResponse = await this.agentServiceRequest.sendToolRequest(
        personId,
        userOrgId,
        queryToolId,
        {
          toolInputVariables: { query: metricsQuery },
          toolInputENVVariables: this.defaultToolEnvVars,
        },
      );
      apiCount++;

      if (!metricsResponse.messageContent?.toolSuccess) {
        throw new Error('Failed to fetch key metrics');
      }

      const metricsRecord =
        metricsResponse.messageContent.toolResult.result.records[0];
      const validMetrics = Object.entries(metricsRecord)
        .filter(
          ([key, value]) =>
            key.includes('Metric') &&
            value !== null &&
            value !== undefined &&
            value !== 'N/A',
        )
        .reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {});

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
      const [opportunityFields, eventFields, taskFields, gongFields] =
        await Promise.all([
          this.describeObjectFields(
            describeToolId,
            'Opportunity',
            personId,
            userOrgId,
          ),
          this.describeObjectFields(
            describeToolId,
            'Event',
            personId,
            userOrgId,
          ),
          this.describeObjectFields(
            describeToolId,
            'Task',
            personId,
            userOrgId,
          ),
          this.describeObjectFields(
            describeToolId,
            'Gong__Gong_Call__c',
            personId,
            userOrgId,
          ),
        ]);
      apiCount += 4; // Four describe requests

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
            toolInputENVVariables: this.prodToolEnvVars,
          },
        );
        apiCount++;

        // Query close date history
        const closeDateHistoryQuery = `SELECT OpportunityId, CreatedById, CreatedDate, OldValue, NewValue, Field 
          FROM OpportunityFieldHistory 
          WHERE Field = 'CloseDate' AND OpportunityId IN ('${batch.join("','")}')`;
        const closeDateHistoryResponse =
          await this.agentServiceRequest.sendToolRequest(
            personId,
            userOrgId,
            queryToolId,
            {
              toolInputVariables: {
                query: closeDateHistoryQuery,
              },
              toolInputENVVariables: this.prodToolEnvVars,
            },
          );
        apiCount++;

        // Query stage history
        const stageHistoryQuery = `SELECT OpportunityId, CreatedById, CreatedDate, OldValue, NewValue, Field 
          FROM OpportunityFieldHistory 
          WHERE Field = 'StageName' AND OpportunityId IN ('${batch.join("','")}')`;
        const stageHistoryResponse =
          await this.agentServiceRequest.sendToolRequest(
            personId,
            userOrgId,
            queryToolId,
            {
              toolInputVariables: {
                query: stageHistoryQuery,
              },
              toolInputENVVariables: this.prodToolEnvVars,
            },
          );
        apiCount++;

        // Add Gong calls query alongside events and tasks queries
        const eventsQuery = `SELECT ${eventFields.join(',')} FROM Event WHERE WhatId IN ('${batch.join("','")}') LIMIT 3`;
        const tasksQuery = `SELECT ${taskFields.join(',')} FROM Task WHERE WhatId IN ('${batch.join("','")}') LIMIT 3`;
        const gongQuery = `SELECT ${gongFields.join(',')} FROM Gong__Gong_Call__c WHERE Gong__Primary_Opportunity__c IN ('${batch.join("','")}') LIMIT 3`;

        const [eventsResponse, tasksResponse, gongResponse] = await Promise.all(
          [
            this.agentServiceRequest.sendToolRequest(
              personId,
              userOrgId,
              queryToolId,
              {
                toolInputVariables: { query: eventsQuery },
                toolInputENVVariables: this.prodToolEnvVars,
              },
            ),
            this.agentServiceRequest.sendToolRequest(
              personId,
              userOrgId,
              queryToolId,
              {
                toolInputVariables: { query: tasksQuery },
                toolInputENVVariables: this.prodToolEnvVars,
              },
            ),
            this.agentServiceRequest.sendToolRequest(
              personId,
              userOrgId,
              queryToolId,
              {
                toolInputVariables: { query: gongQuery },
                toolInputENVVariables: this.prodToolEnvVars,
              },
            ),
          ],
        );
        apiCount += 3;

        // Modify the prompt construction
        for (const opp of oppResponse.messageContent.toolResult.result
          .records) {
          const currentTime = new Date().toISOString();
          const closeDateHistory =
            closeDateHistoryResponse.messageContent.toolResult.result.records.filter(
              (h) => h.OpportunityId === opp.Id,
            );
          const stageHistory =
            stageHistoryResponse.messageContent.toolResult.result.records.filter(
              (h) => h.OpportunityId === opp.Id,
            );

          // Filter out null values and format opportunity data
          const formattedOppData = Object.entries(opp)
            .filter(([_, value]) => value !== null)
            .map(([key, value]) => `- ${key}: ${value}`)
            .join('\n');

          // Format histories and metrics
          const formattedCloseDateHistory = closeDateHistory
            .map(
              (h) =>
                `- ${h.CreatedDate}: Changed from ${h.OldValue} to ${h.NewValue}`,
            )
            .join('\n');

          const formattedStageHistory = stageHistory
            .map(
              (h) =>
                `- ${h.CreatedDate}: Changed from ${h.OldValue} to ${h.NewValue}`,
            )
            .join('\n');

          const formattedKeyMetrics = Object.entries(validMetrics)
            .map(([key, value]) => `- ${key}: ${value}`)
            .join('\n');

          const userPrompt = `Time at the start of analysis: ${currentTime}.

**Opportunity Data:**
${formattedOppData}

**Close Date History:**
${formattedCloseDateHistory}

**Stage History:**
${formattedStageHistory}

**Key Metrics:**
${formattedKeyMetrics}`;

          const config = {
            provider: 'openai',
            model: 'gpt-4o-mini',
            temperature: 0.2,
            maxTokens: 4096,
          };

          // Format activity data
          const oppEvents =
            eventsResponse.messageContent.toolResult.result.records
              .filter((e) => e.WhatId === opp.Id)
              .map((e) =>
                Object.entries(e)
                  .filter(([_, value]) => value !== null)
                  .map(([key, value]) => `- ${key}: ${value}`)
                  .join('\n'),
              )
              .join('\n');

          const oppTasks =
            tasksResponse.messageContent.toolResult.result.records
              .filter((t) => t.WhatId === opp.Id)
              .map((t) =>
                Object.entries(t)
                  .filter(([_, value]) => value !== null)
                  .map(([key, value]) => `- ${key}: ${value}`)
                  .join('\n'),
              )
              .join('\n');

          const activityPrompt = `
**Events:**
${oppEvents}

**Tasks:**
${oppTasks}`;

          // Format Gong calls data
          const oppGongCalls =
            gongResponse.messageContent.toolResult.result.records
              .filter((g) => g.Gong__Primary_Opportunity__c === opp.Id)
              .map((g) =>
                Object.entries(g)
                  .filter(([_, value]) => value !== null)
                  .map(([key, value]) => `- ${key}: ${value}`)
                  .join('\n'),
              )
              .join('\n');

          const gongPrompt = `
**Gong Calls:**
${oppGongCalls}`;

          // Make all LLM calls in parallel
          const [oppEvaluation, activityEvaluation, gongEvaluation] =
            await Promise.all([
              this.agentServiceRequest.sendPromptExecutionRequest(
                personId,
                userOrgId,
                promptId,
                userPrompt,
                config,
                { criteriaQuestions: formattedCriteriaQuestions },
              ),
              this.agentServiceRequest.sendPromptExecutionRequest(
                personId,
                userOrgId,
                activityPromptId,
                activityPrompt,
                config,
                { criteriaQuestions: formattedCriteriaQuestions },
              ),
              this.agentServiceRequest.sendPromptExecutionRequest(
                personId,
                userOrgId,
                activityPromptId,
                gongPrompt,
                config,
                { criteriaQuestions: formattedCriteriaQuestions },
              ),
            ]);

        //   console.log('RAW RESPONSES:', {
        //     oppEvaluation: oppEvaluation,
        //     activityEvaluation: activityEvaluation,
        //   });

          // Merge only opportunity and Gong evaluations
          const mergedEvaluation = this.mergeEvaluations(
            oppEvaluation.messageContent.content.evaluation,
            activityEvaluation.messageContent.content.evaluation,
            // gongEvaluation.messageContent.content.evaluation,
          );
          console.log('mergedEvaluation', mergedEvaluation);

          // Calculate score using merged evaluation
          const score = this.calculateScore({ evaluation: mergedEvaluation });
          const bucket = this.getScoreBucket(score);
          allScores.push({
            opportunityId: opp.Id,
            score,
            bucket,
            opportunityName: opp.Name,
            amount: opp.Amount,
            stage: opp.StageName,
            evaluation: mergedEvaluation,
          });
        }
      }

      this.logger.debug('All scores', { scores: allScores, apiCount });

      // Prepare records for patching
      const recordsToUpdate = allScores.map((score) => {
        const evaluationMap = score.evaluation.reduce(
          (acc: any, e: any, index: number) => {
            const criteriaKey = `Budy_Criteria_Outcome_${index + 1}__c`;
            const justificationKey = `Budy_Criteria_Justification_${index + 1}__c`;
            acc[criteriaKey] = e.outcome;
            acc[justificationKey] = e.justification;
            return acc;
          },
          {},
        );

        return {
          id: score.opportunityId,
          ...evaluationMap,
          Budy_Opportunity_Score__c: score.score,
          Budy_Opportunity_Score_Bucket__c: score.bucket,
        };
      });

      // Patch the opportunities with their evaluations
      const patchResponse = await this.agentServiceRequest.sendToolRequest(
        personId,
        userOrgId,
        patchToolId,
        {
          toolInputVariables: {
            record_type: 'Opportunity',
            field_names: [
              'Budy_Criteria_Outcome_1__c',
              'Budy_Criteria_Justification_1__c',
              'Budy_Criteria_Outcome_2__c',
              'Budy_Criteria_Justification_2__c',
              'Budy_Criteria_Outcome_3__c',
              'Budy_Criteria_Justification_3__c',
              'Budy_Criteria_Outcome_4__c',
              'Budy_Criteria_Justification_4__c',
              'Budy_Opportunity_Score__c',
              'Budy_Opportunity_Score_Bucket__c',
            ],
            records: recordsToUpdate,
          },
          toolInputENVVariables: this.defaultToolEnvVars,
        },
      );
      apiCount++;

      if (!patchResponse.messageContent?.toolSuccess) {
        throw new Error(
          `Failed to update opportunities: ${
            patchResponse.messageContent?.toolError?.message || 'Unknown error'
          }`,
        );
      }

      this.logger.log(
        `Successfully updated ${recordsToUpdate.length} opportunities`,
      );

      // Create a new Google Sheet for the results
      const sheetTitle = `Opportunity Ratings - ${criteriaRecord.Name} - ${new Date().toISOString().split('T')[0]}`;
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
        'Timing Risks Outcome',
        'Timing Risks Justification',
        'Deal Risks Outcome',
        'Deal Risks Justification',
        'Product Fit Risks Outcome',
        'Product Fit Risks Justification',
        'Legal Risks Outcome',
        'Legal Risks Justification',
      ];

      const rows = allScores.map((score) => {
        return [
          score.opportunityId,
          score.opportunityName,
          score.amount?.toString() || 'N/A',
          score.stage,
          score.score.toString(),
          score.bucket,
          score.evaluation[0]?.outcome || 'N/A',
          score.evaluation[0]?.justification || 'N/A',
          score.evaluation[1]?.outcome || 'N/A',
          score.evaluation[1]?.justification || 'N/A',
          score.evaluation[2]?.outcome || 'N/A',
          score.evaluation[2]?.justification || 'N/A',
          score.evaluation[3]?.outcome || 'N/A',
          score.evaluation[3]?.justification || 'N/A',
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

  private mergeEvaluations(oppEvaluation: any, activityEvaluation: any): any[] {
    console.log('MERGE INPUTS:', {
      oppEvaluation,
      activityEvaluation,
    });

    // Handle both array and response object cases
    const oppEvals = Array.isArray(oppEvaluation)
      ? oppEvaluation
      : oppEvaluation?.messageContent?.content?.evaluation;

    const activityEvals = Array.isArray(activityEvaluation)
      ? activityEvaluation
      : activityEvaluation?.messageContent?.content?.evaluation;

    console.log('EXTRACTED ARRAYS:', {
      oppEvals,
      activityEvals,
    });

    // Merge evaluations using the correct logic
    const result = oppEvals.map((oppEval: any, index: number) => {
      const activityEval = activityEvals[index];

      // If both outcomes are the same, combine justifications with a period
      if (oppEval.outcome === activityEval?.outcome) {
        return {
          question: oppEval.question,
          outcome: oppEval.outcome,
          justification: `${oppEval.justification} ${activityEval.justification}`,
        };
      }

      // If either is Yes, use that one with its justification
      if (oppEval.outcome === 'Yes') {
        return {
          question: oppEval.question,
          outcome: 'Yes',
          justification: oppEval.justification,
        };
      }
      if (activityEval?.outcome === 'Yes') {
        return {
          question: oppEval.question,
          outcome: 'Yes',
          justification: activityEval.justification,
        };
      }

      // If either is No, use that one with its justification
      if (oppEval.outcome === 'No') {
        return {
          question: oppEval.question,
          outcome: 'No',
          justification: oppEval.justification,
        };
      }
      if (activityEval?.outcome === 'No') {
        return {
          question: oppEval.question,
          outcome: 'No',
          justification: activityEval.justification,
        };
      }

      // Default to the first evaluation if both are N/A
      return {
        question: oppEval.question,
        outcome: oppEval.outcome,
        justification: oppEval.justification,
      };
    });

    console.log('MERGE RESULT:', result);
    return result;
  }
}
