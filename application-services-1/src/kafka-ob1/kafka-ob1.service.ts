import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { firstValueFrom, lastValueFrom } from 'rxjs';
import { filter, timeout, take } from 'rxjs/operators';
import {
  OB1Global,
  CURRENT_SCHEMA_VERSION,
} from 'src/interfaces/ob1-message.interfaces';

@Injectable()
export class KafkaOb1Service implements OnModuleInit {
  constructor(
    @Inject('KAFKA_OB1_CLIENT') private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    // Subscribe to topics that your service will consume
    this.kafkaClient.subscribeToResponseOf('budyos-ob1-databaseService');
    this.kafkaClient.subscribeToResponseOf('budyos-ob1-agentService');
    await this.kafkaClient.connect();
  }

  // Request-response message using built-in correlationID
  async sendMessage(content: string) {
    // Send the message and await the response, correlationID is managed by NestJS
    const response = await firstValueFrom(
      this.kafkaClient.send('budyos-ob1-databaseService', { content }),
    );
    return response;
  }

  // Fire-and-forget message using built-in correlationID
  async emitMessage(content: string) {
    // Emit the message, correlationID is automatically handled by NestJS
    this.kafkaClient.emit('budyos-ob1-databaseService', { content });
  }

  // Request-response with proper message headers and validation
  async sendRequest(
    messageInput: any,
    messageHeaders: OB1Global.MessageHeaderV2,
    topic: string,
  ) {
    console.log('Sending Kafka request with headers:', messageHeaders);
    console.log('Sending Kafka request with content:', messageInput);

    // Send the message and apply filters to the observable stream
    const response$ = this.kafkaClient
      .send(topic, {
        key: null, // Optional: Define key as needed, or leave null
        value: messageInput,
        headers: messageHeaders,
      })
      .pipe(
        filter((response) => response !== null && response !== undefined), // Filter out null/undefined responses
        take(1), // Take the first valid response
        timeout(30000), // Optional: Set a timeout to prevent waiting indefinitely
      );

    try {
      const validResponse = await lastValueFrom(response$);
      console.log('Received valid response:', validResponse);
      return validResponse;
    } catch (error) {
      console.error('Error or timeout waiting for a valid response:', error);
      return null; // Handle as needed, e.g., return null or throw an error
    }
  }

  // Helper method to construct message headers based on OB1Global.MessageHeaderV2
  constructHeaders(
    sourceFunction: string,
    destinationService: string,
    sourceType: string,
    additionalHeaders: Partial<OB1Global.MessageHeaderV2> = {},
  ): OB1Global.MessageHeaderV2 {
    return {
      sourceService: process.env.SERVICE_NAME || 'unknown-service',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      personId: additionalHeaders.personId || 'default-person-id', // Ensure personId is always included
      userOrgId: additionalHeaders.userOrgId || 'default-org-id', // Ensure userOrgId is always included
      sourceFunction: sourceFunction,
      sourceType: sourceType,
      destinationService: destinationService,
      requestId: `RQ-${sourceFunction}-${Date.now()}`,
      ...additionalHeaders,
    };
  }
}
