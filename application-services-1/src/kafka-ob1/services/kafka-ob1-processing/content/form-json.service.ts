import { Injectable, Logger } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';

@Injectable()
export class FormJsonService {
  private readonly logger = new Logger(FormJsonService.name);

  constructor(private readonly agentServiceRequest: AgentServiceRequest) {}

  async generateFormJson(
    transcript: string,
    consultantInput: string,
    projectDescription: string,
    userId: string,
    projectName: string,
  ): Promise<any> {
    const formPrompt = `
      You are an AI consultant responsible for documenting and summarizing a recent customer meeting. This summary includes key sections on project objectives, challenges, and the project’s current status in structured JSON format, editable by the customer. Ensure each section is organized with headings, drop-downs, and editable fields, following this format:

      Project Objectives (PO)
      High-Level Desired Deliverables (DD)
      Key Challenges (KC1)
      Potential Root Causes (KC2)
      
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
      this.logger.log('Requesting form JSON generation from LLM...');
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
        this.logger.debug(`Generated form JSON: ${JSON.stringify(resultJson)}`);
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
      Based on the customer meeting transcript, generate JSON-formatted action items that align with the project goals. Use this structure:

      Action Items:
      - List of actionable steps with objectives, challenges, and expected outcomes.

      Input Details:
      Clean Transcript: ${transcript},
      Action Items: ${actionItems}
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
      this.logger.log('Requesting action items JSON generation from LLM...');
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
        this.logger.debug(
          `Generated action items JSON: ${JSON.stringify(actionResultJson)}`,
        );
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
      this.logger.log(
        `Processed JSON result: ${JSON.stringify(combinedOutput)}`,
      );
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
}
