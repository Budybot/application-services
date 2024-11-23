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
import {
  // EventPattern,
  MessagePattern,
  Payload,
  Ctx,
  KafkaContext,
} from '@nestjs/microservices';
import {
  OB1Global,
  OB1AgentService,
  validateIncomingKafkaMessageFields,
  validateOutgoingMessageHeader,
  CURRENT_SCHEMA_VERSION,
} from 'src/interfaces/ob1-message.interfaces';
import { KafkaOb1ProcessingService } from './services/kafka-ob1-processing/kafka-ob1-processing.service';
import { KafkaOb1BroadcastService } from './services/kafka-ob1-processing/kafka-ob1-broadcast.service';
// import { ContentService } from './services/kafka-ob1-processing/content/content.service';

@Controller('kafka-ob1')
export class KafkaOb1Controller implements OnModuleInit {
  private readonly logger = new Logger(KafkaOb1Controller.name);

  constructor(
    private readonly kafkaOb1ProcessingService: KafkaOb1ProcessingService,
    private readonly kafkaOb1BroadcastService: KafkaOb1BroadcastService,
  ) {}

  onModuleInit() {
    this.logger.log('Kafka consumer initialized and started');
  }

  // @MessagePattern('budyos-ob1-applicationService')
  // async handleSystemMessages(
  //   @Payload() message: OB1MessageValue,
  //   @Ctx() context: KafkaContext,
  // ) {
  //   const messageKey = context.getMessage().key?.toString();
  //   // Cast headers from IHeaders to OB1MessageHeader by using 'unknown' first
  //   const messageHeaders = context.getMessage()
  //     .headers as unknown as OB1MessageHeader;
  //   const userEmail = messageHeaders.userEmail;
  //   const SERVICE_NAME = process.env.SERVICE_NAME;
  //   const messageType = message.messageType;

  //   this.logger.debug(
  //     `Received message with key: ${messageKey} for user ${userEmail}`,
  //   );
  //   this.logger.debug(`Headers: ${JSON.stringify(messageHeaders)}`);
  //   this.logger.debug(`Payload: ${JSON.stringify(message)}`);

  //   // Validate message schema; logs errors if necessary
  //   try {
  //     validateMessageFields(context);
  //   } catch (error) {
  //     this.logger.error(
  //       `Message schema validation failed: ${error.message}`,
  //       error.stack,
  //     );
  //     return {
  //       messageStatus: 'error',
  //       errorMessage: `Invalid message schema: ${error.message}`,
  //     };
  //   }

  //   // Check if the message is intended for this service
  //   if (messageHeaders.destinationService !== SERVICE_NAME) {
  //     this.logger.log(
  //       `Message not intended for this service (${SERVICE_NAME}) but instead for ${messageHeaders.destinationService}. Ignoring.`,
  //     );
  //     return null; // Explicitly return `null` to prevent any response
  //   }

  //   // Process message if intended for this service
  //   this.logger.log(`Processing message intended for ${SERVICE_NAME}`);

  //   // Route based on messageType
  //   if (messageType === 'BROADCAST') {
  //     // Handle BROADCAST messages as content generation
  //     await this.handleBroadcastContent(message, messageHeaders, context);
  //   } else if (messageType === 'REQUEST') {
  //     // Handle REQUEST messages as application requests
  //     return await this.processApplicationRequest(
  //       message,
  //       messageHeaders,
  //       context,
  //     );
  //   } else {
  //     this.logger.warn(`Unknown message type: ${messageType}`);
  //     return { messageStatus: 'error', errorMessage: 'Unknown message type' };
  //   }
  // }
  @MessagePattern('budyos-ob1-applicationService')
  async handleSystemMessages(
    @Payload() message: OB1AgentService.MessageIncomingValueV2,
    @Ctx() context: KafkaContext,
  ) {
    const messageKey = context.getMessage().key?.toString();
    const messageHeaders = context.getMessage()
      .headers as unknown as OB1Global.MessageHeaderV2;
    const SERVICE_NAME = process.env.SERVICE_NAME;
    const messageType = message.messageType;

    this.logger.debug(`Received message with key: ${messageKey}`);
    this.logger.debug(`Headers: ${JSON.stringify(messageHeaders)}`);
    this.logger.debug(`Payload: ${JSON.stringify(message)}`);

    // Validate message schema
    try {
      validateIncomingKafkaMessageFields(context);
    } catch (error) {
      this.logger.error(`Message schema validation failed: ${error.message}`);
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
      return null;
    }

    // Process message if intended for this service
    this.logger.log(`Processing message intended for ${SERVICE_NAME}`);

    if (messageType === 'BROADCAST') {
      // Handle BROADCAST messages
      await this.handleBroadcastContent(message, messageHeaders, context);
    } else if (messageType === 'REQUEST') {
      // Route specific REQUEST message types
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
  // private async processApplicationRequest(
  //   message: OB1MessageValue,
  //   headers: OB1MessageHeader,
  //   context: KafkaContext,
  // ) {
  //   try {
  //     const result: { messageContent?: string; [key: string]: any } =
  //       await this.kafkaOb1ProcessingService.processRequest(message, context);

  //     const responseHeaders: OB1MessageHeader = {
  //       instanceName: headers.instanceName,
  //       userEmail: headers.userEmail,
  //       schemaVersion: CURRENT_SCHEMA_VERSION,
  //       sourceService: process.env.SERVICE_NAME,
  //       destinationService: headers.sourceService,
  //       sourceType: 'service',
  //       requestId: headers.requestId || `Not-Sent-${Date.now()}`,
  //       responseId: `RE-${process.env.SERVICE_NAME}-${Date.now()}`,
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
  //           : {},
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
  //       `Error processing request: ${error.message}`,
  //       error.stack,
  //     );
  //     return {
  //       messageStatus: 'error',
  //       errorMessage: `Failed to process request`,
  //     };
  //   }
  // }
  private async processApplicationRequest(
    message: OB1AgentService.MessageIncomingValueV2,
    headers: OB1Global.MessageHeaderV2,
    context: KafkaContext,
  ) {
    try {
      const result: { messageContent?: string; [key: string]: any } =
        await this.kafkaOb1ProcessingService.processRequest(message, context);

      const responseHeaders: OB1Global.MessageHeaderV2 = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        sourceService: process.env.SERVICE_NAME,
        destinationService: headers.sourceService,
        sourceType: 'service',
        requestId: headers.requestId || `Not-Sent-${Date.now()}`,
        responseId: `RE-${process.env.SERVICE_NAME}-${Date.now()}`,
        personId: headers.personId || 'Unknown personId',
        userOrgId: headers.userOrgId || 'Unknown userOrgId',
      };

      const responseValue: OB1Global.MessageResponseValueV2 = {
        ...result,
        messageType: 'RESPONSE',
        conversationId: message.conversationId || null,
        projectId: message.projectId || null,
        assetId: message.assetId || null,
        messageContent:
          typeof result.messageContent === 'object'
            ? result.messageContent
            : {},
        error: false,
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
  // private async handleBroadcastContent(
  //   message: OB1MessageValue,
  //   headers: OB1MessageHeader,
  //   context: KafkaContext,
  // ) {
  //   this.logger.log(`Handling content emission: ${JSON.stringify(message)}`);
  //   await this.kafkaOb1BroadcastService.processBroadcast(
  //     message,
  //     headers,
  //     context,
  //   );
  // }
  private async handleBroadcastContent(
    message: OB1AgentService.MessageIncomingValueV2,
    headers: OB1Global.MessageHeaderV2,
    context: KafkaContext,
  ) {
    this.logger.log(`Handling content emission: ${JSON.stringify(message)}`);
    await this.kafkaOb1BroadcastService.processBroadcast(
      message,
      headers,
      context,
    );
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
