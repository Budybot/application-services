import { Injectable, Logger } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';

@Injectable()
export class SummarizationService {
  private readonly logger = new Logger(SummarizationService.name);

  constructor(private readonly agentServiceRequest: AgentServiceRequest) {}

  // Summarize content from a document (e.g., SOW or other text-based content)
  async summarizeFromDocument(
    instanceName: string,
    userEmail: string,
    documentContent: string,
    sectionName: string,
  ): Promise<string> {
    const systemPrompt = `
      Summarize the "${sectionName}" section from the following document content:
      ${documentContent}
      Return a focused, concise summary for the "${sectionName}" section only.
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
        `Summarizing ${sectionName} from document for instance ${instanceName}`,
      );
      const response = await this.agentServiceRequest.sendAgentRequest(
        systemPrompt,
        `Return only the ${sectionName} summary.`,
        config,
        instanceName,
        userEmail,
      );

      if (response?.messageContent?.content) {
        const summary = response.messageContent.content;
        this.logger.debug(`Generated ${sectionName} summary: ${summary}`);
        return summary;
      } else {
        throw new Error(`Invalid response: ${JSON.stringify(response)}`);
      }
    } catch (error) {
      this.logger.error(
        `Error summarizing ${sectionName} from document: ${error.message}`,
      );
      throw new Error(`Failed to summarize ${sectionName} from document`);
    }
  }

  // Summarize a specific section from a project planner sheet (e.g., Discovery Phase)
  async summarizeFromSheet(
    instanceName: string,
    userEmail: string,
    sheetData: any[][],
    sectionName: string
  ): Promise<string> {
    const sheetContent = JSON.stringify(sheetData);
    const systemPrompt = `
      Summarize the "${sectionName}" tasks and outcomes from the following project planner data:
      ${sheetContent}
      Focus on the "${sectionName}" section only and provide a concise, high-level summary.
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
        `Summarizing ${sectionName} from sheet for instance ${instanceName}`,
      );
      const response = await this.agentServiceRequest.sendAgentRequest(
        systemPrompt,
        `Return only the ${sectionName} summary.`,
        config,
        instanceName,
        userEmail,
      );

      if (response?.messageContent?.content) {
        const summary = response.messageContent.content;
        this.logger.debug(
          `Generated ${sectionName} summary from sheet: ${summary}`,
        );
        return summary;
      } else {
        throw new Error(`Invalid response: ${JSON.stringify(response)}`);
      }
    } catch (error) {
      this.logger.error(
        `Error summarizing ${sectionName} from sheet: ${error.message}`,
      );
      throw new Error(`Failed to summarize ${sectionName} from sheet`);
    }
  }
}
