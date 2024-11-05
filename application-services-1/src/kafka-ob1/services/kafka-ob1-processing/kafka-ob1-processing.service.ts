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

            if (functionName === 'updatePage') {
                const { tableEntity, projectName } = functionInput;
                const fetchDataResponse = await this.crudOperationsService.fetchData(
                  tableEntity,
                  projectName,
                  instanceName,
                );
        
                // Check if the fetched page is "OB1-pages-inputPage1"
                if (tableEntity === 'OB1-pages-inputPage1' && fetchDataResponse.messageContent) {
                  const pageData = fetchDataResponse.messageContent[0];

                //   const { transcript, consultant_input, project_description, userRoles, action_items } = pageData;
                //   if (transcript === undefined) this.logger.warn('Transcript is missing');
                //   if (consultant_input === undefined) this.logger.warn('Consultant input is missing');
                //   if (project_description === undefined) this.logger.warn('Project description is missing');
                //   if (userRoles === undefined) this.logger.warn('User roles are missing');
                //   if (action_items === undefined) this.logger.warn('Action items are missing');
        
                  // Generate form JSON using LLM service, passing the entire pageData
                  const generatedFormJson = await this.llmFormGenerationService.generateFormJsonFromPageData(
                    pageData,
                    userEmail,
                    projectName,
                  );
        
                //   // Prepare the data to be posted to the next page
                //   const postData = {
                //     consultant_role: userRoles?.user1?.role || '',
                //     consultant_name: userRoles?.user1?.name || '',
                //     primary_client_name: userRoles?.user2?.name || '',
                //     primary_client_role: userRoles?.user2?.role || '',
                //     DD: generatedFormJson.DD || [],
                //     KC1: generatedFormJson.KC1 || [],
                //     KC2: generatedFormJson.KC2 || [],
                //     action_items: action_items || [],
                //     meeting_slots: '',
                //     consultant_input: consultant_input || '',
                //     project_type: 'Digital transformation Consulting',
                //     PO: generatedFormJson.PO || [],
                //     company_name: 'Biggest company',
                //   };
        
                  // Post the generated form JSON to the next page (e.g., "OB1-pages-outputPage2")
                  return await this.crudOperationsService.postData(
                    'OB1-pages-filterPage1',
                    projectName,
                    // postData,
                    generatedFormJson,
                    instanceName,
                  );
                } else {
                  return fetchDataResponse;
                }
              }  else {
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
