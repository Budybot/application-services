// import { Injectable, Logger } from '@nestjs/common';
// import { KafkaOb1Service } from 'src/kafka-ob1/kafka-ob1.service';
// import { validateAgentServiceRequestBody } from 'src/interfaces/agent-service.interfaces';
// @Injectable()
// export class AgentServiceRequest {
//   private readonly logger = new Logger(AgentServiceRequest.name);

//   constructor(private readonly kafkaOb1Service: KafkaOb1Service) {}

//   async sendAgentRequest(
//     systemPrompt: string,
//     userPrompt: string,
//     config: {
//       provider: string;
//       model: string;
//       temperature: number;
//       maxTokens: number;
//       frequencyPenalty: number;
//       presencePenalty: number;
//     },
//     instanceName: string,
//     messageKey: string,
//   ): Promise<any> {
//     const topic = 'budyos-ob1-agentService';
//     const tokenThreshold = 2000;
//     if (systemPrompt.length > tokenThreshold) {
//       this.logger.warn(
//         `System prompt exceeds token limit of ${tokenThreshold} tokens`,
//       );
//       config.model = 'gpt-4o';
//       config.maxTokens = 12000;
//     }

//     const messageInput = {
//       messageContent: {
//         functionName: 'LLMgenerateResponse-V1',
//         functionInput: {
//           systemPrompt,
//           userPrompt,
//           config,
//         },
//       },
//       messageType: 'REQUEST',
//     };
//     this.logger.log(`Config: ${JSON.stringify(config)}`);

//     try {
//       validateAgentServiceRequestBody(
//         messageInput.messageContent.functionInput,
//       );
//     } catch (validationError) {
//       this.logger.error(`Validation failed: ${validationError.message}`);
//       throw new Error('Invalid request data; please check your input');
//     }
//     try {
//       const response = await this.kafkaOb1Service.sendRequest(
//         messageKey,
//         instanceName,
//         'agent-services',
//         'sendAgentRequest',
//         'system',
//         messageInput,
//         'system',
//         messageKey,
//         topic,
//       );
//       // this.logger.log(
//       //   `Agent request sent for instance ${instanceName} with user prompt: ${userPrompt}`,
//       // );
//       this.logger.debug(response);
//       return response;
//     } catch (error) {
//       this.logger.error(`Error sending agent request: ${error.message}`);
//       throw new Error('Failed to send agent request');
//     }
//   }

// }
import { Injectable, Logger } from '@nestjs/common';
import { KafkaOb1Service } from 'src/kafka-ob1/kafka-ob1.service';
import {
  validateExecutePromptRequestBody,
  ExecutePromptRequestDto,
} from 'src/interfaces/agent-service.interfaces';
import {
  OB1Global,
  CURRENT_SCHEMA_VERSION,
} from 'src/interfaces/ob1-message.interfaces';

@Injectable()
export class AgentServiceRequest {
  private readonly logger = new Logger(AgentServiceRequest.name);

  constructor(private readonly kafkaOb1Service: KafkaOb1Service) {}

  async sendPromptExecutionRequest(
    personId: string,
    userOrgId: string,
    promptId: string,
    userPrompt: string,
    config: {
      provider: string;
      model: string;
      temperature?: number;
      maxTokens?: number;
    },
    systemPromptVariables?: { [key: string]: any },
  ): Promise<any> {
    const topic = 'budyos-ob1-agentService';
    const tokenThreshold = 1000;

    // Adjust config for long prompts
    if (userPrompt.length > tokenThreshold) {
      this.logger.warn(
        `User prompt exceeds token limit of ${tokenThreshold} tokens. Switching model to gpt-4o.`,
      );
      config.model = 'gpt-4o';
      config.maxTokens = 12000;
    }

    const requestBody: ExecutePromptRequestDto = {
      promptId,
      userPrompt,
      systemPromptVariables,
      llmConfig: config,
    };

    // Validate the request body
    try {
      validateExecutePromptRequestBody(requestBody);
    } catch (validationError) {
      this.logger.error(`Validation failed: ${validationError.message}`);
      throw new Error('Invalid request data; please check your input');
    }

    // Prepare the Kafka message payload
    const messageInput = {
      messageContent: {
        functionName: 'ExecutePromptWithUserPrompt',
        functionInput: requestBody,
      },
      messageType: 'REQUEST',
    };
    const headers: OB1Global.MessageHeaderV2 = {
      sourceService: process.env.SERVICE_NAME || 'unknown-service',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      sourceFunction: 'sendPromptExecutionRequest',
      sourceType: 'service',
      destinationService: 'agent-service',
      requestId: `REQ-sendPromptExecutionRequest-${Date.now()}`,
      personId: personId,
      userOrgId: userOrgId,
    };
    try {
      // Send the message to the Kafka topic
      const response = await this.kafkaOb1Service.sendRequest(
        messageInput,
        headers,
        topic,
      );
      this.logger.debug(`Response: ${JSON.stringify(response)}`);
      return response;
    } catch (error) {
      this.logger.error(
        `Error sending prompt execution request: ${error.message}`,
      );
      throw new Error('Failed to send prompt execution request');
    }
  }
}
