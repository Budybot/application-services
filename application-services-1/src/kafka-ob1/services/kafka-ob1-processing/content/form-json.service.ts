import { Injectable, Logger } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';
import {
  validateActionItemsJson,
  validateFormJson,
} from 'src/interfaces/form-json.interfaces';

@Injectable()
export class FormJsonService {
  private readonly logger = new Logger(FormJsonService.name);
  private readonly maxTranscriptLength = 5000;

  constructor(private readonly agentServiceRequest: AgentServiceRequest) {}

  async generateFormJson(
    transcript: string,
    consultantInput: string,
    projectDescription: string,
    userId: string,
    projectName: string,
  ): Promise<any> {
    if (transcript.length > this.maxTranscriptLength) {
      transcript = await this.summarizeTranscript(
        transcript,
        projectName,
        userId,
      );
    }

    const formPrompt = `
      You are an AI consultant responsible for documenting and summarizing a recent customer meeting. This summary should be structured in JSON format, using the following exact fields:
      
      "consultant_role": "primary",
      "consultant_name": "",
      "primary_client_name": "",
      "primary_client_role": "",
      "DD": ["desired deliverable item 1", "desired deliverable item 2", "desired deliverable item 3"],
      "KC1": ["key challenge item 1", "key challenge item 2", "key challenge item 3"],
      "KC2": ["key problem item 1", "key problem item 2", "key problem item 3"],
      "PO": ["objective item 1", "objective item 2", "objective item 3"],
      "company_name": "Biggest company"
      
      Input Details:
      Clean Transcript: ${transcript},
      Consultant Input: ${consultantInput},
      Project Description: ${projectDescription}
    `;

    const config = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.25,
      maxTokens: 2048,
      frequencyPenalty: 0,
      presencePenalty: 0,
    };

    try {
      // this.logger.log('Requesting form JSON generation from LLM...');
      const llmOutput = await this.agentServiceRequest.sendAgentRequest(
        formPrompt,
        'Ensure the output of this call is only JSON.',
        config,
        projectName,
        userId,
      );

      if (llmOutput?.messageContent?.content) {
        const resultJson = this.cleanAndParseJson(
          llmOutput.messageContent.content,
        );
        validateFormJson(resultJson);
        // this.logger.debug(`Generated form JSON: ${JSON.stringify(resultJson)}`);
        return resultJson;
      } else {
        throw new Error(`Invalid response: ${JSON.stringify(llmOutput)}`);
      }
    } catch (error) {
      this.logger.error(
        `Error generating form JSON: ${error.message}`,
        error.stack,
      );
      throw new Error('Failed to generate form JSON');
    }
  }

  async generateActionItems(
    transcript: string,
    actionItems: string,
    userId: string,
    projectName: string,
  ): Promise<any> {
    const actionPrompt = `
      Based on the customer meeting transcript, generate JSON-formatted action items that align with the project goals.

      Output must be a JSON object with an "action_items" array containing strings of action items.

      Input Details:
      Clean Transcript: ${transcript},
      Cosultant Recorded Action Items: ${actionItems}
    `;

    const config = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.25,
      maxTokens: 4096,
      frequencyPenalty: 0,
      presencePenalty: 0,
    };

    try {
      // this.logger.log('Requesting action items JSON generation from LLM...');
      const actionLlmOutput = await this.agentServiceRequest.sendAgentRequest(
        actionPrompt,
        'Ensure the output of this call is only JSON.',
        config,
        projectName,
        userId,
      );

      if (actionLlmOutput?.messageContent?.content) {
        const actionResultJson = this.cleanAndParseJson(
          actionLlmOutput.messageContent.content,
        );
        validateActionItemsJson(actionResultJson);
        // this.logger.debug(
        //   `Generated action items JSON: ${JSON.stringify(actionResultJson)}`,
        // );
        return actionResultJson;
      } else {
        throw new Error(`Invalid response: ${JSON.stringify(actionLlmOutput)}`);
      }
    } catch (error) {
      this.logger.error(
        `Error generating action items JSON: ${error.message}`,
        error.stack,
      );
      throw new Error('Failed to generate action items JSON');
    }
  }

  async generateCombinedJson(
    transcript: string,
    consultantInput: string,
    projectDescription: string,
    actionItems: any,
    userEmail: string,
    projectName: string,
  ): Promise<any> {
    // this.logger.debug(`Action Items: ${JSON.stringify(actionItems)}`);
    // this.logger.debug(`Transcript: ${transcript}`);
    // this.logger.debug(`Consultant Input: ${consultantInput}`);
    // this.logger.debug(`Project Description: ${projectDescription}`);
    // this.logger.debug(`User Email: ${userEmail}`);
    try {
      // Call your LLM function here
      const llmOutput = await this.generateFormJson(
        transcript,
        consultantInput,
        projectDescription,
        userEmail,
        projectName,
      );

      const actionLlmOutput = await this.generateActionItems(
        transcript,
        actionItems,
        userEmail,
        projectName,
      );

      const combinedOutput = { ...llmOutput, ...actionLlmOutput };
      // this.logger.log(
      //   `Processed JSON result: ${JSON.stringify(combinedOutput)}`,
      // );
      return combinedOutput;
    } catch (error) {
      this.logger.error(
        `Error generating form JSON: ${error.message}`,
        error.stack,
      );
      throw new Error('Failed to generate form JSON');
    }
  }
  // Cleans up and parses the LLM JSON output
  private cleanAndParseJson(output: string): any {
    try {
      // Remove any backticks or code block delimiters
      const sanitizedOutput = output.replace(/```json|```/g, '').trim();

      // Parse the JSON
      return JSON.parse(sanitizedOutput);
    } catch (error) {
      this.logger.error(`Failed to parse JSON: ${error.message}`);
      throw new Error('Invalid JSON format received from LLM');
    }
  }
  private async summarizeTranscript(
    transcript: string,
    projectName: string,
    userId: string,
  ): Promise<string> {
    const summaryPrompt = `
      You are an AI assistant tasked with summarizing a lengthy meeting transcript. Focus on actionable items, key decisions, and any details directly relevant to the project goals and action items.
      
      Transcript:
      ${transcript}
      
      Please return a concise summary that highlights only the actionable and relevant details.
    `;

    const config = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.5,
      maxTokens: 1500,
      frequencyPenalty: 0,
      presencePenalty: 0,
    };

    try {
      this.logger.log(
        'Summarizing long transcript for manageable processing...',
      );
      const response = await this.agentServiceRequest.sendAgentRequest(
        summaryPrompt,
        'Return only the summary text.',
        config,
        projectName,
        userId,
      );

      if (response?.messageContent?.content) {
        const summarizedTranscript = response.messageContent.content.trim();
        this.logger.debug(`Summarized transcript: ${summarizedTranscript}`);
        return summarizedTranscript;
      } else {
        throw new Error(`Invalid response: ${JSON.stringify(response)}`);
      }
    } catch (error) {
      this.logger.error(
        `Error summarizing transcript: ${error.message}`,
        error.stack,
      );
      throw new Error('Failed to summarize transcript');
    }
  }
}
