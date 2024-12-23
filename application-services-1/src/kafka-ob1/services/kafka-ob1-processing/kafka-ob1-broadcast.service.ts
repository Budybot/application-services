import { Injectable, Logger } from '@nestjs/common';
import {
  OB1Global,
  OB1ApplicationService,
} from 'src/interfaces/ob1-message.interfaces';
// import { ClientKafka } from '@nestjs/microservices';
import { KafkaContext } from '@nestjs/microservices';
import { ContentService } from 'src/kafka-ob1/services/kafka-ob1-processing/content/content.service';
import { GoogleDocMonitoringService } from '../google/google-monitoring.service';
import { SowCommentProcessingService } from './content/sow-comment-processing.service';
@Injectable()
export class KafkaOb1BroadcastService {
  private readonly logger = new Logger(KafkaOb1BroadcastService.name);

  constructor(
    private readonly contentService: ContentService,
    private readonly googleDocMonitoringService: GoogleDocMonitoringService,
    private readonly sowCommentProcessingService: SowCommentProcessingService,
  ) {} // @Inject('KAFKA_OB1_CLIENT') private readonly kafkaClient: ClientKafka, // Inject Kafka client

  async processBroadcast(
    message: OB1ApplicationService.MessageIncomingValueV2,
    headers: OB1Global.MessageHeaderV2,
    context: KafkaContext,
  ) {
    // const messageHeaders = context.getMessage().headers;
    // const userEmail = messageHeaders['userEmail'] as string;
    // const instanceName = messageHeaders['instanceName'] as string;

    try {
      const functionName = message.messageContent.functionName;
      const functionInput = message.messageContent.functionInput;

      switch (functionName) {
        case 'process-comment':
          this.logger.log('Processing comment...');
          const { commentData } = functionInput;
          const budyReply = this.sowCommentProcessingService.generateBudyReply(
            headers.userOrgId,
            headers.personId,
            commentData,
          );
          this.logger.log(`Generated Budy reply: ${budyReply}`);
          break;
        case 'generate-assets':
          // const { pageName, projectName } = functionInput;
          const pageName =
            functionInput.pageName || functionInput.pageData.pageName;
          const projectName =
            functionInput.projectName || functionInput.pageData.projectName;
          const userOrgId = headers.userOrgId;
          const personId = headers.personId;
          if (!projectName || !pageName) {
            throw new Error(
              "Required fields 'projectName' or 'pageName' are missing in messageContent.",
            );
          }
          // Define content generation rules for different page names
          const contentGenerationRules = {
            'OB1-pages-filterPage1': ['SOW', 'Email'],
            'OB1-pages-inputPage2': ['Email'],
            // Add other pageNames and content types as needed
          };
          const contentTypesToGenerate = contentGenerationRules[pageName] || [];
          // Iterate over content types for this page and generate each
          for (const contentType of contentTypesToGenerate) {
            try {
              const documentId = await this.contentService.generateContent(
                projectName,
                userOrgId,
                { sowData: functionInput, pageName },
                personId,
                contentType,
              );
              this.logger.log(
                `Successfully generated ${contentType} content with document ID: ${documentId}`,
              );
              this.googleDocMonitoringService
                .startMonitoring(documentId, projectName, userOrgId, personId)
                .then(() => {
                  this.logger.log(
                    `Started monitoring for document ID: ${documentId}`,
                  );
                })
                .catch((error) => {
                  this.logger.error(
                    `Failed to start monitoring: ${error.message}`,
                  );
                });
            } catch (error) {
              this.logger.error(
                `Error generating ${contentType} for page ${pageName}: ${error.message}`,
              );
            }
          }
          // SAME FOR CONTENT UPDATES
          const contentUpdateRules = {
            'OB1-pages-filterPage1': [],
            'OB1-pages-inputPage2': ['SOW'],
            // Add other pageNames and content types as needed
          };
          const contentTypesToUpdate = contentUpdateRules[pageName] || [];
          // Iterate over content types for this page and generate each
          for (const contentType of contentTypesToUpdate) {
            try {
              const documentId = await this.contentService.updateContent(
                projectName,
                userOrgId,
                { sowData: functionInput, pageName },
                personId,
                contentType,
              );
              this.logger.log(
                `Successfully updated ${contentType} content with document ID: ${documentId}`,
              );
            } catch (error) {
              this.logger.error(
                `Error updating ${contentType} for page ${pageName}: ${error.message}`,
              );
            }
          }
          break;
        default:
          this.logger.error(`Function ${functionName} not found`);
          return { errorMessage: `Function ${functionName} not found` };
      }
    } catch (error) {
      this.logger.error(
        `Error processing message for user: ${error.message}`,
        error.stack,
      );
      throw new Error('Failed to process request');
    }
  }
}
