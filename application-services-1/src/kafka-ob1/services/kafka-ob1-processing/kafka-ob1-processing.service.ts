import { Injectable, Logger, Inject } from '@nestjs/common';
// import { CrudOperationsService } from './crud-operations.service';
import {
  OB1MessageValue,
//   OB1MessageHeader,
} from 'src/interfaces/ob1-message.interfaces';
// import { ClientKafka } from '@nestjs/microservices';
import { KafkaContext } from '@nestjs/microservices';
// import { LlmFormGenerationService } from './llm-services/llm-form-generation.service';
import { CleanTranscriptService } from './clean-transcript.service';
import { GetParticipantsService } from './get-participants.service';
import { PageSubmittedService } from './page-submitted.service';

@Injectable()
export class KafkaOb1ProcessingService {
  private readonly logger = new Logger(KafkaOb1ProcessingService.name);

  constructor(
    // private readonly crudOperationsService: CrudOperationsService,
    // private readonly llmFormGenerationService: LlmFormGenerationService,
    private readonly cleanTranscriptService: CleanTranscriptService,
    private readonly getParticipantsService: GetParticipantsService,
    private readonly pageSubmittedService: PageSubmittedService,
    // @Inject('KAFKA_OB1_CLIENT') private readonly kafkaClient: ClientKafka, // Inject Kafka client
  ) {}

  async processRequest(message: OB1MessageValue, context: KafkaContext) {
    const messageHeaders = context.getMessage().headers;
    const userEmail = messageHeaders['userEmail'] as string;
    const instanceName = messageHeaders['instanceName'] as string;

    try {
      const functionName = message.messageContent.functionName;
      const functionInput = message.messageContent.functionInput;

      switch (functionName) {
        case 'get-participants':
          const { transcript: transcriptForParticipants } = functionInput;
          return await this.getParticipantsService.extractParticipants(
            transcriptForParticipants,
          );
        case 'clean-transcript':
          const { transcript: transcriptToClean } = functionInput;
          return await this.cleanTranscriptService.cleanTranscript(
            transcriptToClean,
          );
        case 'page-submitted':
          return await this.pageSubmittedService.handlePageSubmitted(
            functionInput,
            userEmail,
            instanceName,
          );
        default:
          this.logger.error(`Function ${functionName} not found`);
          return { errorMessage: `Function ${functionName} not found` };
      }
    } catch (error) {
      this.logger.error(
        `Error processing message for user with email ${userEmail}: ${error.message}`,
        error.stack,
      );
      throw new Error('Failed to process request');
    }
  }
}
