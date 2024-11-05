import { Injectable, Logger } from '@nestjs/common';
import { KafkaOb1Service } from 'src/kafka-ob1/kafka-ob1.service';
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

    try {
      const response = await this.kafkaOb1Service.sendRequest(
        messageKey,
        instanceName,
        'agent-services',
        'sendAgentRequest',
        'system',
        messageInput,
        'system',
        'system@budy.bot',
        topic,
      );
      this.logger.log(
        `Agent request sent for instance ${instanceName} with user prompt: ${userPrompt}`,
      );
      this.logger.debug(response);
      return response;
    } catch (error) {
      this.logger.error(`Error sending agent request: ${error.message}`);
      throw new Error('Failed to send agent request');
    }
  }
}
