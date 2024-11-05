// src/kafka-ob1/services/kafka-ob1-processing/kafka-ob1-processing.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { CrudOperationsService } from './crud-operations.service';
import {
  OB1MessageValue,
  OB1MessageHeader,
} from 'src/interfaces/ob1-message.interfaces';
import { KafkaContext } from '@nestjs/microservices';
import { LlmFormGenerationService } from './llm-services/llm-form-generation.service';

@Injectable()
export class KafkaOb1ProcessingService {
    private readonly logger = new Logger(KafkaOb1ProcessingService.name);

    constructor(
        private readonly crudOperationsService: CrudOperationsService,
        private readonly llmFormGenerationService: LlmFormGenerationService,
      ) {}

    async processRequest(message: OB1MessageValue, context: KafkaContext) {
        const messageHeaders = context.getMessage().headers;
        const userEmail = messageHeaders['userEmail'] as string;
        const instanceName = messageHeaders['instanceName'] as string;

        try {
            const functionName = message.messageContent.functionName;
            const functionInput = message.messageContent.functionInput;

            if (functionName === 'fetchDataFromPage') {
                const { tableEntity, projectName } = functionInput;
                const fetchDataResponse = await this.crudOperationsService.fetchData(
                  tableEntity,
                  projectName,
                  instanceName,
                );
        
                // Check if the fetched page is "OB1-pages-inputPage1"
                if (tableEntity === 'OB1-pages-inputPage1' && fetchDataResponse.messageContent) {
                  const pageData = fetchDataResponse.messageContent[0];
        
                  // Generate form JSON using LLM service, passing the entire pageData
                  return await this.llmFormGenerationService.generateFormJsonFromPageData(
                    pageData,
                    userEmail,
                    projectName,
                  );
                } else {
                  return fetchDataResponse;
                }
              } else if (functionName === 'postDataToPage') {
                const { tableEntity, projectName, data } = functionInput;
                return await this.crudOperationsService.postData(
                  tableEntity,
                  projectName,
                  data,
                  instanceName,
                );
              } else {
                this.logger.error(`Function ${functionName} not found`);
                return { errorMessage: `Function ${functionName} not found` };
              }
        } catch (error) {
            this.logger.error(
                `Error processing message for user with email ${userEmail}: ${error.message}`,
                error.stack
            );
            throw new Error('Failed to process request');
        }
    }
}
