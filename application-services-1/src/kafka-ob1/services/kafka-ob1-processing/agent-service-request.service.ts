import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class AgentServiceRequest {
  private readonly logger = new Logger(AgentServiceRequest.name);

  constructor(private readonly httpService: HttpService) {}

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
  ): Promise<any> {
    const baseUrl =
      process.env.ENV === 'PROD'
        ? 'https://os.budy.bot'
        : 'https://app.budy.bot';
    const topic = 'budyos-ob1-agentService';
    const url = `${baseUrl}/services/kafka/ob1-v2/send-topicRequest/${topic}/${instanceName}`;

    const requestBody = {
      destinationService: 'agent-services',
      sourceFunction: 'sendAgentRequest',
      sourceType: 'system',
      messageInput: {
        messageContent: {
          functionName: 'LLMgenerateResponse',
          functionInput: {
            systemPrompt,
            userPrompt,
            config,
          },
        },
      },
    };

    try {
      const response = await lastValueFrom(
        this.httpService.post(url, requestBody),
      );
      this.logger.log(
        `Agent request sent for instance ${instanceName} with user prompt: ${userPrompt}`,
      );
      this.logger.debug(response.data);
      return response.data;
    } catch (error) {
      this.logger.error(`Error sending agent request: ${error.message}`);
      throw new Error('Failed to send agent request');
    }
  }
}
