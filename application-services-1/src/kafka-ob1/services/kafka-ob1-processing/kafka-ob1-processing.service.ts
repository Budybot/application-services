import { Injectable, Logger } from '@nestjs/common';
import {
  OB1Global,
  OB1ApplicationService,
  //   OB1MessageHeader,
} from 'src/interfaces/ob1-message.interfaces';
// import { ClientKafka } from '@nestjs/microservices';
import { KafkaContext } from '@nestjs/microservices';
import { CleanTranscriptService } from './functions/clean-transcript.service';
import { GetParticipantsService } from './functions/get-participants.service';
import { PageSubmittedService } from './functions/page-submitted.service';
import { CreateProjectPlanService } from './functions/create-project-plan.service';
import { CompletedActionItemsService } from './functions/completed-action-items.service';
import { SyncAssetsService } from './functions/sync-assets.service';
import { ToolTestingService } from './tool-tester.service';
import { LeadRatingService } from './functions/lead-rating.service';
import { OpportunityRatingService } from './functions/opportunity-rating.service';
import { AgentServiceRequest } from './agent-service-request.service';
import { query } from 'express';
import { SalesforceAnalysisService } from './functions/sf-analysis.service';

@Injectable()
export class KafkaOb1ProcessingService {
  private readonly logger = new Logger(KafkaOb1ProcessingService.name);

  constructor(
    private readonly cleanTranscriptService: CleanTranscriptService,
    private readonly getParticipantsService: GetParticipantsService,
    private readonly pageSubmittedService: PageSubmittedService,
    private readonly createProjectPlanService: CreateProjectPlanService,
    private readonly completedActionItemsService: CompletedActionItemsService,
    private readonly syncAssetsService: SyncAssetsService,
    private readonly testTool: ToolTestingService,
    private readonly rateLead: LeadRatingService,
    private readonly rateOpportunity: OpportunityRatingService,
    private readonly agentServiceRequest: AgentServiceRequest,
    private readonly sfAnalysis: SalesforceAnalysisService,
    // @Inject('KAFKA_OB1_CLIENT') private readonly kafkaClient: ClientKafka, // Inject Kafka client
  ) {}

  async processRequest(
    message: OB1ApplicationService.MessageIncomingValueV2,
    context: KafkaContext,
  ) {
    const messageHeaders = context.getMessage().headers;
    const personId =
      (messageHeaders['personId'] as string) || 'default-person-id';
    const userOrgId =
      (messageHeaders['userOrgId'] as string) || 'default-org-id';

    try {
      const functionName = message.messageContent.functionName;
      const functionInput = message.messageContent.functionInput;

      let response = {};

      switch (functionName) {
        case 'get-participants':
          const { transcript: transcriptForParticipants } = functionInput;
          const participants =
            await this.getParticipantsService.extractParticipants(
              transcriptForParticipants,
              userOrgId,
              personId,
            );
          response = { messageContent: { participants: participants } };
          break;
        case 'clean-transcript':
          const { transcript: transcriptToClean } = functionInput;
          const cleanedTranscript =
            await this.cleanTranscriptService.cleanTranscript(
              transcriptToClean,
              userOrgId,
              personId,
            );
          response = {
            messageContent: { cleanedTranscript: cleanedTranscript },
          };
          break;
        case 'page-submitted':
          // this.logger.log('Handling page submitted event');
          // this.logger.debug(`Function input: ${JSON.stringify(functionInput)}`);
          response = await this.pageSubmittedService.handlePageSubmitted(
            functionInput,
            userOrgId,
            personId,
          );
          break;
        case 'create-project-plan':
          const { projectName } = functionInput;
          // this.logger.log(`Creating project plan for ${projectName}`);
          const projectPlanId =
            await this.createProjectPlanService.createProjectPlan(
              projectName,
              userOrgId,
              personId,
            );
          response = {
            messageContent: { projectPlanId: projectPlanId },
          };
          break;
        case 'completed-actions':
          const { transcript } = functionInput;
          const completedActionItems =
            await this.completedActionItemsService.extractCompletedActionItems(
              userOrgId,
              personId,
              transcript,
            );
          response = {
            messageContent: { completedActions: completedActionItems },
          };
          break;
        case 'sync-assets':
          const { syncTo, syncFrom } = functionInput;
          const syncResult = await this.syncAssetsService.syncAssets(
            syncTo,
            syncFrom,
            functionInput.projectName,
            userOrgId,
            personId,
          );
          response = {
            messageContent: { syncResult: syncResult },
          };
          break;
        case 'process-comment':
          response = { messageContent: { commentProcessed: true } };
          break;
        case 'test-tool':
          const toolResponse = await this.agentServiceRequest.sendToolRequest(
            personId,
            userOrgId,
            functionInput.toolId,
            functionInput.toolInput,
          );
          response = { messageContent: { toolResponse: toolResponse } };
          break;
        case 'push-snapshots':
          const { queryToolId: queryToolId2, googleSheetId } = functionInput;
          await this.rateLead.pushSnapshotToGoogleSheet(
            queryToolId2,
            googleSheetId,
            personId,
            userOrgId,
          );
          response = { messageContent: { snapshotResponse: 'Success' } };
          break;
        case 'rate-leads':
          const {
            criteriaRecordId,
            recordToolId,
            describeToolId,
            queryToolId,
            patchToolId,
            createToolId,
            promptId,
            ndays,
            limit,
            makeSnapshots,
            customQuery,
            weekName,
          } = functionInput;

          // Step 1: Log that the process has started
          this.logger.log(
            'Received rate-leads request. Initiating processing...',
          );
          response = {
            messageContent: {
              status: 'Processing',
              message:
                'Lead rating process started. You will receive updates shortly.',
            },
          };

          // Step 2: Trigger the rating process asynchronously
          this.rateLead
            .rateLeads(
              '35.161.118.26', //'agent-services-1.orangebox-uswest-2.local',
              recordToolId,
              describeToolId,
              queryToolId,
              patchToolId,
              createToolId,
              criteriaRecordId,
              promptId,
              makeSnapshots,
              personId,
              userOrgId,
              ndays,
              limit,
              customQuery,
              weekName,
            )
            .then((result) => {
              this.logger.log(
                `Lead rating process completed: Total Count is ${result}`,
              );
            })
            .catch((error) => {
              this.logger.error(`Lead rating process failed: ${error.message}`);
            });

          break;

        case 'rate-opportunities':
          const {
            queryToolId: oppQueryToolId,
            describeToolId: oppDescribeToolId,
            promptId: oppPromptId,
            customQuery: oppCustomQuery,
            limit: oppLimit,
            batchSize,
            criteriaRecordId: oppCriteriaRecordId,
            patchToolId: oppPatchToolId,
            keyMetricsRecordId,
            activityPromptId: oppActivityPromptId,
          } = functionInput;

          // Log start of opportunity rating process
          this.logger.log(
            'Received rate-opportunities request. Initiating processing...',
          );
          response = {
            messageContent: {
              status: 'Processing',
              message:
                'Opportunity rating process started. You will receive updates shortly.',
            },
          };

          // Trigger opportunity rating process asynchronously
          this.rateOpportunity
            .processOpportunityRating({
              messageContent: {
                personId,
                userOrgId,
                queryToolId: oppQueryToolId,
                describeToolId: oppDescribeToolId,
                promptId: oppPromptId,
                customQuery: oppCustomQuery,
                limit: oppLimit,
                batchSize,
                criteriaRecordId: oppCriteriaRecordId,
                patchToolId: oppPatchToolId,
                keyMetricsRecordId,
                activityPromptId: oppActivityPromptId,
              },
            })
            .then(() => {
              this.logger.log(
                'Opportunity rating process completed successfully',
              );
            })
            .catch((error) => {
              this.logger.error(
                `Opportunity rating process failed: ${error.message}`,
              );
            });

          break;

        case 'sf-analysis':
          this.logger.log('Starting Salesforce metrics analysis');
          response = {
            messageContent: {
              status: 'Processing',
              message:
                'Salesforce metrics analysis started. You will receive updates shortly.',
            },
          };

          // Trigger the analysis process asynchronously
          this.sfAnalysis
            .processMetricsAnalysis({
              messageContent: {
                personId,
                userOrgId,
                queryToolId: functionInput.queryToolId,
                createToolId: functionInput.createToolId,
              },
            })
            .then(() => {
              this.logger.log(
                'Salesforce metrics analysis completed successfully',
              );
            })
            .catch((error) => {
              this.logger.error(
                `Salesforce metrics analysis failed: ${error.message}`,
              );
            });

          break;

        default:
          this.logger.error(`Function ${functionName} not found`);
          return { errorMessage: `Function ${functionName} not found` };
      }
      return response;
    } catch (error) {
      this.logger.error(
        `Error processing message for user with email ${personId}: ${error.message}`,
        error.stack,
      );
      throw new Error('Failed to process request');
    }
  }
}
