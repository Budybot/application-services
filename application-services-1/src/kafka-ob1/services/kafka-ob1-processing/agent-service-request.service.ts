import { Injectable, Logger } from '@nestjs/common';
import { KafkaOb1Service } from 'src/kafka-ob1/kafka-ob1.service';
import { validateAgentServiceRequestBody } from 'src/interfaces/agent-service.interfaces';

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
    const topic = 'budyos-ob1-agentService';
    const tokenThreshold = 2000;
    if (systemPrompt.length > tokenThreshold) {
      this.logger.warn(
        `System prompt exceeds token limit of ${tokenThreshold} tokens`,
      );
      config.model = 'gpt-4o';
      config.maxTokens = 16384;
    }

    const messageInput = {
      messageContent: {
        functionName: 'LLMgenerateResponse',
        functionInput: {
          systemPrompt,
          userPrompt,
          config,
        },
      },
      messageType: 'REQUEST',
    };
    this.logger.log(`Config: ${JSON.stringify(config)}`);

    try {
      validateAgentServiceRequestBody(
        messageInput.messageContent.functionInput,
      );
    } catch (validationError) {
      this.logger.error(`Validation failed: ${validationError.message}`);
      throw new Error('Invalid request data; please check your input');
    }
    try {
      const response = await this.kafkaOb1Service.sendRequest(
        messageKey,
        instanceName,
        'agent-services',
        'sendAgentRequest',
        'system',
        messageInput,
        'system',
        messageKey,
        topic,
      );
      // this.logger.log(
      //   `Agent request sent for instance ${instanceName} with user prompt: ${userPrompt}`,
      // );
      this.logger.debug(response);
      return response;
    } catch (error) {
      this.logger.error(`Error sending agent request: ${error.message}`);
      throw new Error('Failed to send agent request');
    }
  }
}
