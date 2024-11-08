import { Injectable, Logger } from '@nestjs/common';
import { AgentServiceRequest } from './agent-service-request.service';

@Injectable()
export class CompletedActionItemsService {
  private readonly logger = new Logger(CompletedActionItemsService.name);

  constructor(private readonly agentServiceRequest: AgentServiceRequest) {}

  async extractCompletedActionItems(
    instanceName: string,
    userEmail: string,
    transcript: string,
  ): Promise<string> {
    const systemPrompt = `
      You are analyzing a transcript from a follow-up (second) meeting with a client for a project. 
      Identify any action items that the consultant has marked as completed. 
      Format the output as a bullet-point list, summarizing only the completed items.

      Transcript:
      ${transcript}

      Return the completed action items as a bullet-point list.
    `;

    const config = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.5,
      maxTokens: 4096,
      frequencyPenalty: 0,
      presencePenalty: 0,
    };

    try {
      this.logger.log(
        `Extracting completed action items for instance ${instanceName}`,
      );
      const response = await this.agentServiceRequest.sendAgentRequest(
        systemPrompt,
        'Return only the completed action items as a bullet-point list.',
        config,
        instanceName,
        userEmail,
      );

      if (response?.messageContent?.content) {
        const completedItems = response.messageContent.content;
        this.logger.debug(
          `Extracted completed action items: ${completedItems}`,
        );
        return `Completed Action Items:\n${completedItems}`;
      } else {
        throw new Error(`Invalid response: ${JSON.stringify(response)}`);
      }
    } catch (error) {
      this.logger.error(
        `Error extracting completed action items: ${error.message}`,
      );
      throw new Error('Failed to extract completed action items');
    }
  }
}
