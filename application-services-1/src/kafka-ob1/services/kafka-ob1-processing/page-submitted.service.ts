import { Injectable, Logger, Inject } from '@nestjs/common';
import { CrudOperationsService } from './crud-operations.service';
import { LlmFormGenerationService } from './llm-services/llm-form-generation.service';
import { ClientKafka } from '@nestjs/microservices';

@Injectable()
export class PageSubmittedService {
  private readonly logger = new Logger(PageSubmittedService.name);

  constructor(
    private readonly crudOperationsService: CrudOperationsService,
    private readonly llmFormGenerationService: LlmFormGenerationService,
    @Inject('KAFKA_OB1_CLIENT') private readonly kafkaClient: ClientKafka,
  ) {}

  async handlePageSubmitted(
    functionInput: any,
    userEmail: string,
    instanceName: string,
  ) {
    const { tableEntity, projectName, transcript } = functionInput;

    try {
      if (tableEntity === 'OB1-pages-inputPage1') {
        // Fetch data from Postgres
        this.logger.log(
          `Fetching data from ${tableEntity} for project ${projectName}`,
        );
        const fetchDataResponse = await this.crudOperationsService.fetchData(
          tableEntity,
          projectName,
          instanceName,
        );

        this.logger.debug(fetchDataResponse);

        if (fetchDataResponse.messageContent) {
          const pageData = fetchDataResponse.messageContent[0];

          // Call LLM service to generate form JSON
          this.logger.log(
            `Generating form JSON using LLM for project ${projectName}`,
          );
          const generatedFormJson =
            await this.llmFormGenerationService.generateFormJsonFromPageData(
              pageData,
              userEmail,
              projectName,
            );

          // Post the generated form JSON to the next page
          this.logger.log(
            `Posting generated form JSON to OB1-pages-filterPage1 for project ${projectName}`,
          );
          return await this.crudOperationsService.postData(
            'OB1-pages-filterPage1',
            projectName,
            generatedFormJson,
            instanceName,
          );
        }
      } else if (tableEntity === 'OB1-pages-filterPage1') {
        // Emit Kafka message with the form content from input
        this.logger.log(
          `Emitting Kafka message for filter page for project ${projectName}`,
        );
        const message = {
          messageContent: functionInput,
          messageType: 'BROADCAST',
          projectId: projectName,
          assetId: null,
          conversationId: null,
        };
        this.emitMessage(message);
      } else {
        this.logger.warn(`Unrecognized table entity: ${tableEntity}`);
      }
    } catch (error) {
      this.logger.error(
        `Error handling page-submitted for project ${projectName}: ${error.message}`,
        error.stack,
      );
      throw new Error('Failed to handle page-submitted request');
    }
  }

  // Broadcasting function for Kafka message
  emitMessage(message: any): void {
    const topic = 'budyos-ob1-system';

    try {
      this.logger.log(
        `Emitting message to topic: ${topic}, with content: ${JSON.stringify(message)}`,
      );
      // Emit the message to Kafka topic without awaiting a response
      this.kafkaClient.emit(topic, message).subscribe({
        error: (err) =>
          this.logger.error(
            `Failed to emit Kafka message: ${err.message}`,
            err.stack,
          ),
      });

      this.logger.log('Kafka message emitted successfully');
    } catch (error) {
      this.logger.error(
        `Failed to emit Kafka message: ${error.message}`,
        error.stack,
      );
    }
  }
}
