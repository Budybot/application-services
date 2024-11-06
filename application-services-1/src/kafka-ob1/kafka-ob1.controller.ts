// src/kafka-ob1/kafka-ob1.controller.ts
import { Controller, OnModuleInit, Logger, Post, Body } from '@nestjs/common';
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

@Controller('kafka-ob1')
export class KafkaOb1Controller implements OnModuleInit {
  private readonly logger = new Logger(KafkaOb1Controller.name);

  constructor(
    private readonly kafkaOb1ProcessingService: KafkaOb1ProcessingService,
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
      await this.handleBroadcastContent(message, messageHeaders);
    } else if (messageType === 'REQUEST') {
      // Handle REQUEST messages as application requests
      return await this.processApplicationRequest(message, messageHeaders);
    } else {
      this.logger.warn(`Unknown message type: ${messageType}`);
      return { messageStatus: 'error', errorMessage: 'Unknown message type' };
    }
  }
  // Process application requests that expect a response
  private async processApplicationRequest(
    message: OB1MessageValue,
    headers: OB1MessageHeader,
  ) {
    try {
      const result: { messageContent?: string; [key: string]: any } =
        await this.kafkaOb1ProcessingService.processRequest(message, headers);

      const responseHeaders: OB1MessageHeader = {
        instanceName: headers.instanceName,
        userEmail: headers.userEmail,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        sourceService: process.env.SERVICE_NAME,
        destinationService: headers.sourceService,
        sourceType: 'system',
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
  ) {
    try {
      // Content-specific handling for BROADCAST messages
      this.logger.log(`Handling content emission: ${JSON.stringify(message)}`);
      // Add logic for content processing, such as saving or triggering events

    } catch (error) {
      this.logger.error(
        `Error processing broadcast content: ${error.message}`,
        error.stack,
      );
    }
  }
  //   try {
  //     const result: { messageContent?: string; [key: string]: any } =
  //       await this.kafkaOb1ProcessingService.processRequest(message, context);

  //     const responseHeaders: OB1MessageHeader = {
  //       instanceName: messageHeaders.instanceName,
  //       userEmail,
  //       schemaVersion: CURRENT_SCHEMA_VERSION,
  //       sourceService: SERVICE_NAME,
  //       destinationService: messageHeaders.sourceService,
  //       sourceType: 'system',
  //       requestId: messageHeaders.requestId || `Not-Sent-${Date.now()}`,
  //       responseId: `RE-${SERVICE_NAME}-${Date.now()}`, // Unique response Id
  //     };

  //     const responseValue: OB1MessageValue = {
  //       ...result,
  //       messageType: 'RESPONSE',
  //       conversationId: message.conversationId || null,
  //       projectId: message.projectId || null,
  //       assetId: message.assetId || null,
  //       messageContent:
  //         typeof result.messageContent === 'object'
  //           ? result.messageContent
  //           : {}, // Ensure messageContent is included
  //     };

  //     this.logger.debug(
  //       `Returning response with headers: ${JSON.stringify(responseHeaders)}`,
  //     );
  //     return {
  //       key: '',
  //       value: responseValue,
  //       headers: responseHeaders,
  //     };
  //   } catch (error) {
  //     this.logger.error(
  //       `Error processing message for ${userEmail}: ${error.message}`,
  //       error.stack,
  //     );
  //     return {
  //       messageStatus: 'error',
  //       errorMessage: `Failed to process message for ${userEmail}`,
  //     };
  //   }
  // }
}
