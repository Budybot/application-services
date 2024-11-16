import {
  Controller,
  OnModuleInit,
  Logger,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { GoogleDocService } from './services/google/google-doc.service';
import { GoogleDocMonitoringService } from './services/google/google-monitoring.service';
import {
  // EventPattern,
  MessagePattern,
  Payload,
  Ctx,
  KafkaContext,
} from '@nestjs/microservices';
import {
  OB1MessageValue,
  OB1MessageHeader,
  validateMessageFields,
  CURRENT_SCHEMA_VERSION,
} from 'src/interfaces/ob1-message.interfaces';
import { KafkaOb1ProcessingService } from './services/kafka-ob1-processing/kafka-ob1-processing.service';
import { ContentService } from './services/kafka-ob1-processing/content/content.service';

@Controller('kafka-ob1')
export class KafkaOb1Controller implements OnModuleInit {
  private readonly logger = new Logger(KafkaOb1Controller.name);

  constructor(
    private readonly kafkaOb1ProcessingService: KafkaOb1ProcessingService,
    private readonly contentService: ContentService,
    private readonly googleDocMonitoringService: GoogleDocMonitoringService,
    // private readonly kafkaOb1SystemService: KafkaOb1SystemService
  ) {}

  onModuleInit() {
    this.logger.log('Kafka consumer initialized and started');
    // Add any initialization logic if necessary
  }

  // // Saving the message
  // @EventPattern('budyos-ob1-usertopic.reply')
  // async handleUserReplyTopicLogging(@Payload() message: OB1MessageValue | null, @Ctx() context: KafkaContext) {
  //   // Check if the message value is null and ignore it if so
  //   if (!message || message.value === null) {
  //     this.logger.log('ignoring null message on usertopic.reply topic, skipping saving');
  //     return;
  //   }

  //   // Validate message schema; logs errors if necessary
  //   try {
  //     validateMessageFields(context);
  //   } catch (error) {
  //     this.logger.error(`Message schema validation failed: ${error.message}`, error.stack);
  //     return { messageStatus: 'error', errorMessage: `Invalid message schema: ${error.message}` };
  //   }

  //   try {
  //     await this.kafkaOb1SavingService.saveMessage(message, context);
  //     this.logger.log('Processed message successfully');
  //   } catch (error) {
  //     this.logger.error('Error processing message', error.stack);
  //   }
  // }

  // @UseInterceptors(KafkaResponseInterceptor)
  @MessagePattern('budyos-ob1-applicationService')
  async handleSystemMessages(
    @Payload() message: OB1MessageValue,
    @Ctx() context: KafkaContext,
  ) {
    const messageKey = context.getMessage().key?.toString();
    // Cast headers from IHeaders to OB1MessageHeader by using 'unknown' first
    const messageHeaders = context.getMessage()
      .headers as unknown as OB1MessageHeader;
    const userEmail = messageHeaders.userEmail;
    const SERVICE_NAME = process.env.SERVICE_NAME;
    const messageType = message.messageType;

    this.logger.debug(
      `Received message with key: ${messageKey} for user ${userEmail}`,
    );
    this.logger.debug(`Headers: ${JSON.stringify(messageHeaders)}`);
    this.logger.debug(`Payload: ${JSON.stringify(message)}`);

    // Validate message schema; logs errors if necessary
    try {
      validateMessageFields(context);
    } catch (error) {
      this.logger.error(
        `Message schema validation failed: ${error.message}`,
        error.stack,
      );
      return {
        messageStatus: 'error',
        errorMessage: `Invalid message schema: ${error.message}`,
      };
    }

    // Check if the message is intended for this service
    if (messageHeaders.destinationService !== SERVICE_NAME) {
      this.logger.log(
        `Message not intended for this service (${SERVICE_NAME}) but instead for ${messageHeaders.destinationService}. Ignoring.`,
      );
      return null; // Explicitly return `null` to prevent any response
    }

    // Process message if intended for this service
    this.logger.log(`Processing message intended for ${SERVICE_NAME}`);

    // Route based on messageType
    if (messageType === 'BROADCAST') {
      // Handle BROADCAST messages as content generation
      await this.handleBroadcastContent(message, messageHeaders, context);
    } else if (messageType === 'REQUEST') {
      // Handle REQUEST messages as application requests
      return await this.processApplicationRequest(
        message,
        messageHeaders,
        context,
      );
    } else {
      this.logger.warn(`Unknown message type: ${messageType}`);
      return { messageStatus: 'error', errorMessage: 'Unknown message type' };
    }
  }
  // Process application requests that expect a response
  private async processApplicationRequest(
    message: OB1MessageValue,
    headers: OB1MessageHeader,
    context: KafkaContext,
  ) {
    try {
      const result: { messageContent?: string; [key: string]: any } =
        await this.kafkaOb1ProcessingService.processRequest(message, context);

      const responseHeaders: OB1MessageHeader = {
        instanceName: headers.instanceName,
        userEmail: headers.userEmail,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        sourceService: process.env.SERVICE_NAME,
        destinationService: headers.sourceService,
        sourceType: 'service',
        requestId: headers.requestId || `Not-Sent-${Date.now()}`,
        responseId: `RE-${process.env.SERVICE_NAME}-${Date.now()}`,
      };

      const responseValue: OB1MessageValue = {
        ...result,
        messageType: 'RESPONSE',
        conversationId: message.conversationId || null,
        projectId: message.projectId || null,
        assetId: message.assetId || null,
        messageContent:
          typeof result.messageContent === 'object'
            ? result.messageContent
            : {},
      };

      this.logger.debug(
        `Returning response with headers: ${JSON.stringify(responseHeaders)}`,
      );
      return {
        key: '',
        value: responseValue,
        headers: responseHeaders,
      };
    } catch (error) {
      this.logger.error(
        `Error processing request: ${error.message}`,
        error.stack,
      );
      return {
        messageStatus: 'error',
        errorMessage: `Failed to process request`,
      };
    }
  }

  // Process broadcast content messages without expecting a response
  private async handleBroadcastContent(
    message: OB1MessageValue,
    headers: OB1MessageHeader,
    context: KafkaContext,
  ) {
    try {
      this.logger.log(`Handling content emission: ${JSON.stringify(message)}`);
      const { pageName, projectName } = message.messageContent;
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
            { sowData: message.messageContent, pageName },
            userEmail,
            contentType,
          );
          this.logger.log(
            `Successfully generated ${contentType} content with document ID: ${documentId}`,
          );
          this.googleDocMonitoringService
            .startMonitoring(documentId, instanceName, userEmail)
            .then(() => {
              this.logger.log(
                `Started monitoring for document ID: ${documentId}`,
              );
            })
            .catch((error) => {
              this.logger.error(`Failed to start monitoring: ${error.message}`);
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
            { sowData: message.messageContent, pageName },
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
    } catch (error) {
      this.logger.error(
        `Error processing broadcast content: ${error.message}`,
        error.stack,
      );
    }
  }
}

@Controller('google-auth')
export class GoogleAuthController {
  constructor(private readonly googleDocService: GoogleDocService) {}

  // Route to start the OAuth flow by redirecting to Google’s authorization URL
  @Get('authorize')
  async authorize(@Res() res: Response) {
    const authUrl = this.googleDocService.getAuthorizationUrl();
    return res.redirect(authUrl);
  }

  // Callback route to handle Google’s redirect and capture the authorization code
  @Get('oauth2callback')
  async oauth2callback(@Query('code') code: string, @Res() res: Response) {
    if (code) {
      await this.googleDocService.handleOAuthCallback(code);
      return res.send('Authentication successful! You can close this window.');
    }
    return res.status(400).send('Authorization code is missing.');
  }
}
