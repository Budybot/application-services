import { Injectable, Logger, Inject } from '@nestjs/common';
import { CrudOperationsService } from './crud-operations.service';
import { LlmFormGenerationService } from './llm-services/llm-form-generation.service';
import { ClientKafka } from '@nestjs/microservices';
import {
    OB1MessageValue,
    OB1MessageHeader,
    CURRENT_SCHEMA_VERSION,
  } from 'src/interfaces/ob1-message.interfaces';  

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
      // Fetch data from Postgres
      this.logger.log(
        `Fetching data from ${tableEntity} for project ${projectName}`,
      );
      const fetchDataResponse = await this.crudOperationsService.fetchData(
        tableEntity,
        projectName,
        instanceName,
      );

      // Ensure fetchDataResponse is valid and contains data
      if (!fetchDataResponse || !fetchDataResponse.messageContent) {
        this.logger.error('No data fetched or invalid data format received.');
        throw new Error('No data fetched or invalid data format');
      }

      const pageData = fetchDataResponse.messageContent[0];

      // Decide action based on tableEntity
      if (tableEntity === 'OB1-pages-inputPage1') {
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
      } else if (tableEntity === 'OB1-pages-filterPage1') {
        // Emit Kafka message with the form content from input
        this.logger.log(
          `Emitting Kafka message for filter page for project ${projectName}`,
        );
        const messageValue: OB1MessageValue = {
          messageContent: pageData,
          messageType: 'BROADCAST', // Ensure this is the correct type based on the interfaces
          projectId: projectName,
          assetId: null,
          conversationId: null,
        };
        const messageHeaders: OB1MessageHeader = {
          instanceName: instanceName,
          userEmail: userEmail,
          sourceService: process.env.SERVICE_NAME || 'unknown-service', // Replace with the actual service name
          schemaVersion: CURRENT_SCHEMA_VERSION,
        //   destinationService: 'application-service',
        };
        this.emitMessage(messageValue, messageHeaders);
        return {
          messageContent: pageData,
          messageStatus: 'success',
        };
      } else {
        // Unrecognized tableEntity
        this.logger.warn(`Unrecognized table entity: ${tableEntity}`);
        throw new Error(`Unrecognized table entity: ${tableEntity}`);
      }
    } catch (error) {
      this.logger.error(
        `Error handling page-submitted for project ${projectName}: ${error.message}`,
        error.stack,
      );
      throw new Error('Failed to handle page-submitted request');
    }
  }

// Broadcasting function for Kafka message with proper headers and value
  emitMessage(
    messageValue: OB1MessageValue,
    messageHeaders: OB1MessageHeader,
  ): void {
    const topic = 'budyos-ob1-applicationService';

    try {
      this.logger.log(
        `Emitting message to topic: ${topic}, with content: ${JSON.stringify(messageValue)}`,
      );
      // Emit the message to Kafka topic without awaiting a response
      this.kafkaClient
        .emit(topic, {
          value: messageValue,
          headers: messageHeaders,
        })
        .subscribe({
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
