// src/kafka-ob1/services/kafka-ob1-processing/kafka-ob1-processing.service.ts
import { Injectable, Logger } from '@nestjs/common';
import {
  OB1MessageValue,
  OB1MessageHeader,
} from 'src/interfaces/ob1-message.interfaces';
import { KafkaContext } from '@nestjs/microservices';
import { sayHello } from './functions/sayHello.function';
import { fetchDataFromPage } from 'src/kafka-ob1/services/kafka-ob1-processing/functions/fetchDataFromPage';

// @Injectable()
// export class KafkaOb1ProcessingService {
//     private readonly logger = new Logger(KafkaOb1ProcessingService.name);

//     constructor(

//     ) { }

//     async processRequest(message: OB1MessageValue, context: KafkaContext) {
//         const messageHeaders = context.getMessage().headers;
//         const userEmail = messageHeaders['userEmail'] as string;
//         const instanceName = messageHeaders['instanceName'] as string
//         const sourceService = messageHeaders['sourceService'] as string;

//         try {
//             const functionName = message.messageContent.functionName;
//             const functionInput = message.messageContent.functionInput;

//             // Check if the function exists and call it
//             // Check if the function is CRUDUserfunction and handle accordingly
//             if (functionName === 'CRUDUserfunction') {
//                 return;
//                 // return await this.crudUserFunctionsService.handleUserCRUD(functionInput, instanceName, userEmail);
//             }
//             else if (functionName === 'CRUDInstancesfunction') {
//                 return;
//                 // return await this.crudInstanceFunctionsService.handleInstanceCRUD(functionInput, instanceName, userEmail);
//             } else if (typeof this[functionName] === 'function') {
//                 return await this[functionName](functionInput, instanceName, userEmail);
//             }
//             else {
//                 this.logger.error(`Function ${functionName} not found`);
//                 return { errorMessage: `Function ${functionName} not found` };
//             }
//         } catch (error) {
//             this.logger.error(`Error processing message for user with email ${userEmail}: ${error.message}`, error.stack);
//             throw new Error('Failed to process request');
//         }
//     }

// }
@Injectable()
export class KafkaOb1ProcessingService {
  private readonly logger = new Logger(KafkaOb1ProcessingService.name);

  constructor() {}

  async processRequest(message: OB1MessageValue, context: KafkaContext) {
        const messageHeaders = context.getMessage().headers;
        const userEmail = messageHeaders['userEmail'] as string;
        const instanceName = messageHeaders['instanceName'] as string;

        try {
            const functionName = message.messageContent.functionName;
            const functionInput = message.messageContent.functionInput;

            switch (functionName) {
                case 'sayHello':
                  return await sayHello(functionInput, instanceName, userEmail);
                case 'fetchDataFromPage':
                  const { tableEntity, projectName } = functionInput;
                  return await fetchDataFromPage(tableEntity, projectName, instanceName);
                default:
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
