import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  OB1MessageValue,
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
    // @Inject('KAFKA_OB1_CLIENT') private readonly kafkaClient: ClientKafka, // Inject Kafka client
  ) {}

  async processRequest(message: OB1MessageValue, context: KafkaContext) {
    const messageHeaders = context.getMessage().headers;
    const userEmail = messageHeaders['userEmail'] as string;
    const instanceName = messageHeaders['instanceName'] as string;

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
              instanceName,
              userEmail,
            );
          response = { messageContent: { participants: participants } };
          break;
        case 'clean-transcript':
          const { transcript: transcriptToClean } = functionInput;
          const cleanedTranscript =
            await this.cleanTranscriptService.cleanTranscript(
              transcriptToClean,
              instanceName,
              userEmail,
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
            userEmail,
            instanceName,
          );
          break;
        case 'create-project-plan':
          const { projectName } = functionInput;
          // this.logger.log(`Creating project plan for ${projectName}`);
          const projectPlanId =
            await this.createProjectPlanService.createProjectPlan(
              projectName,
              instanceName,
              userEmail,
            );
          response = {
            messageContent: { projectPlanId: projectPlanId },
          };
          break;
        case 'completed-actions':
          const { transcript } = functionInput;
          const completedActionItems =
            await this.completedActionItemsService.extractCompletedActionItems(
              instanceName,
              userEmail,
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
            instanceName,
            userEmail,
          );
          response = {
            messageContent: { syncResult: syncResult },
          };
          break;
        case 'process-comment':
          response = { messageContent: { commentProcessed: true } };
          break;
        case 'test-tool':
          const { toolId, toolInput } = functionInput;
          this.logger.log(
            `Testing tool with ID ${toolId} and input: ${toolInput}`,
          );
          const toolTestResult = await this.testTool.runTest(
            '35.161.118.26',
            toolId,
            toolInput,
          );
          response = { messageContent: { toolTestResult: toolTestResult } };
          break;
        // case 'rate-lead':
        //   const { leadId, recordToolId, describeToolId, activityToolId } =
        //     functionInput;
        //   this.logger.log(
        //     `Rating lead with ID ${leadId} and record tool ID: ${recordToolId}, describe tool ID: ${describeToolId}, activity tool ID: ${activityToolId}`,
        //   );
        //   const leadRatingResult = await this.rateLead.rateLead(
        //     '35.161.118.26',
        //     recordToolId,
        //     activityToolId,
        //     [''],
        //     [''],
        //     [''],
        //     leadId,
        //     instanceName,
        //     userEmail,
        //   );
        //   response = { messageContent: { leadRatingResult: leadRatingResult } };
        //   break;
        // case 'rate-leads':
        //   const {
        //     // leadIds,
        //     criteriaRecordId,
        //     recordToolId,
        //     describeToolId,
        //     queryToolId,
        //     patchToolId,
        //     createToolId,

        //   } = functionInput;
        //   // this.logger.log(
        //   //   `Rating lead ids and record tool ID: ${recordToolId2}, describe tool ID: ${describeToolId2}, activity tool ID: ${activityToolId2}`,
        //   // );
        //   const ratingResult = await this.rateLead.rateLeads(
        //     '35.161.118.26',
        //     recordToolId,
        //     describeToolId,
        //     queryToolId,
        //     patchToolId,
        //     createToolId,
        //     // leadIds,
        //     criteriaRecordId,
        //     instanceName,
        //     userEmail,
        //   );
        //   response = { messageContent: { leadRatingResult: ratingResult } };
        //   break;
        case 'rate-leads':
          const {
            criteriaRecordId,
            recordToolId,
            describeToolId,
            queryToolId,
            patchToolId,
            createToolId,
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
              '35.161.118.26',
              recordToolId,
              describeToolId,
              queryToolId,
              patchToolId,
              createToolId,
              criteriaRecordId,
              instanceName,
              userEmail,
            )
            .then((result) => {
              this.logger.log(
                `Lead rating process completed: ${JSON.stringify(result)}`,
              );
            })
            .catch((error) => {
              this.logger.error(`Lead rating process failed: ${error.message}`);
            });

          break;

        default:
          this.logger.error(`Function ${functionName} not found`);
          return { errorMessage: `Function ${functionName} not found` };
      }
      return response;
    } catch (error) {
      this.logger.error(
        `Error processing message for user with email ${userEmail}: ${error.message}`,
        error.stack,
      );
      throw new Error('Failed to process request');
    }
  }
}
