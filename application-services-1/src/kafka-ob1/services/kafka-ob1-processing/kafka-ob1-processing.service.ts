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

      let response = {};

      switch (functionName) {
        case 'get-participants':
          const { transcript: transcriptForParticipants } = functionInput;
          const participants =
            await this.getParticipantsService.extractParticipants(
              transcriptForParticipants,
            );
          response = { messageContent: { participants: participants } };
          break;
        case 'clean-transcript':
          const { transcript: transcriptToClean } = functionInput;
          const cleanedTranscript =
            await this.cleanTranscriptService.cleanTranscript(
              transcriptToClean,
              instanceName,
            );
          response = {
            messageContent: { cleanedTranscript: cleanedTranscript },
          };
          break;
        case 'page-submitted':
          response = await this.pageSubmittedService.handlePageSubmitted(
            functionInput,
            userEmail,
            instanceName,
          );
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
