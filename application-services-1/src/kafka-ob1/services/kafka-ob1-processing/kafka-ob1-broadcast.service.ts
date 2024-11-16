import { Injectable, Logger, Inject } from '@nestjs/common';
import {
  OB1MessageValue,
  OB1MessageHeader,
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
    message: OB1MessageValue,
    headers: OB1MessageHeader,
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
            headers.instanceName,
            headers.userId,
            commentData,
          );
          this.logger.log(`Generated Budy reply: ${budyReply}`);
          break;
        case 'generate-assets':
          const { pageName, projectName } = functionInput;
          const instanceName = headers.instanceName;
          const userEmail = headers.userEmail;
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
                instanceName,
                { sowData: functionInput, pageName },
                userEmail,
                contentType,
              );
              this.logger.log(
                `Successfully generated ${contentType} content with document ID: ${documentId}`,
              );
              this.googleDocMonitoringService
                .startMonitoring(
                  documentId,
                  projectName,
                  instanceName,
                  userEmail,
                )
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
                instanceName,
                { sowData: functionInput, pageName },
                userEmail,
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
