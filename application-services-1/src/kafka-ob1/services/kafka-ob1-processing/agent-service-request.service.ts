import { Injectable, Logger } from '@nestjs/common';
import { KafkaOb1Service } from 'src/kafka-ob1/kafka-ob1.service';
import { validateExecutePromptRequestBody } from 'src/interfaces/agent-service.interfaces';
import {
  OB1Global,
  CURRENT_SCHEMA_VERSION,
} from 'src/interfaces/ob1-message.interfaces';

@Injectable()
export class AgentServiceRequest {
  private readonly logger = new Logger(AgentServiceRequest.name);

  constructor(private readonly kafkaOb1Service: KafkaOb1Service) {}

  async sendAgentRequest(
    systemPrompt: string,
    userPrompt: string,
    config: {
      provider: string;
      model: string;
      temperature: number;
      maxTokens: number;
      frequencyPenalty: number;
      presencePenalty: number;
    },
    instanceName: string,
    messageKey: string,
  ): Promise<any> {
    this.logger.debug(
      'Sending agent request function currently not implemented',
    );
    return null;
  }

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
        `User prompt exceeds token limit of ${tokenThreshold} tokens. Increase max token.`,
      );
      // config.model = 'gpt-4o';
      config.maxTokens = 12000;
    }

    // Construct the functionInput for CRUDRoutes
    const functionInput = {
      CRUDOperationName: 'POST',
      CRUDRoute: 'prompts/:promptId/executeWithUserPrompt',
      CRUDBody: {
        promptId,
        userPrompt,
        llmConfig: config,
        systemPromptVariables,
      },
      routeParams: {
        promptId,
      },
      queryParams: {},
      tracing: {
        traceId: `REQ-sendPromptExecutionRequest-${Date.now()}`,
      },
      requestMetadata: {
        _user: personId,
        personId,
        userOrgId,
        sourceService: process.env.SERVICE_NAME || 'unknown-service',
      },
    };

    // Validate the functionInput
    try {
      validateExecutePromptRequestBody(functionInput.CRUDBody);
    } catch (validationError) {
      this.logger.error(`Validation failed: ${validationError.message}`);
      throw new Error('Invalid request data; please check your input');
    }

    // Prepare the Kafka message payload
    const messageInput = {
      messageContent: {
        functionName: 'promptCRUD-V1',
        functionInput,
      },
      messageType: 'REQUEST',
    };

    // Construct headers
    const headers: OB1Global.MessageHeaderV2 = {
      sourceService: process.env.SERVICE_NAME || 'unknown-service',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      sourceFunction: 'sendPromptExecutionRequest',
      sourceType: 'service',
      destinationService: 'agent-services',
      requestId: `REQ-sendPromptExecutionRequest-${Date.now()}`,
      personId,
      userOrgId,
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

  async sendToolRequest(
    personId: string,
    userOrgId: string,
    toolId: string,
    toolInput: any,
  ): Promise<any> {
    const topic = 'budyos-ob1-agentService';

    // Construct the functionInput for CRUDRoutes
    const functionInput = {
      CRUDOperationName: 'POST',
      CRUDRoute: 'tools/:toolId/execute',
      CRUDBody: toolInput,
      routeParams: {
        toolId,
      },
      queryParams: {},
      tracing: {
        traceId: `REQ-sendToolRequest-${Date.now()}`,
      },
      requestMetadata: {
        _user: personId,
        personId,
        userOrgId,
        sourceService: process.env.SERVICE_NAME || 'unknown-service',
      },
    };

    // Prepare the Kafka message payload
    const messageInput = {
      messageContent: {
        functionName: 'CRUDToolRoutes',
        functionInput,
      },
      messageType: 'REQUEST',
    };

    // Construct headers
    const headers: OB1Global.MessageHeaderV2 = {
      sourceService: process.env.SERVICE_NAME || 'unknown-service',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      sourceFunction: 'sendToolRequest',
      sourceType: 'service',
      destinationService: 'agent-services',
      requestId: `REQ-sendToolRequest-${Date.now()}`,
      personId,
      userOrgId,
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
      this.logger.error(`Error sending tool request: ${error.message}`);
      throw new Error('Failed to send tool request');
    }
  }
}
