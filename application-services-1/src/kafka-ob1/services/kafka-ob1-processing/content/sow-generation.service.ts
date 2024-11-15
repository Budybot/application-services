import { Injectable, Logger } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';

@Injectable()
export class SowGenerationService {
  private readonly logger = new Logger(SowGenerationService.name);

  constructor(private readonly agentServiceRequest: AgentServiceRequest) {}
  async generateSow(
    instanceName: string,
    userId: string,
    sowData: any, // Receive sowData instead of sowDetails
  ): Promise<{ [section: string]: string }> {
    // Extract fields from sowData
    const {
      consultant_name,
      consultant_role,
      project_type,
      company_name,
      primary_client_name,
      primary_client_role,
      KC1,
      KC2,
      PO,
      DD,
      action_items,
      consultant_input,
    } = sowData;
    // this.logger.debug(`Extracted sowData: ${JSON.stringify(sowData)}`);

    const sowDetails = {
      consultantName: consultant_name,
      consultantRole: consultant_role,
      projectType: project_type,
      companyName: company_name,
      clientName: primary_client_name,
      clientRole: primary_client_role,
      keyTakeaway1: KC1.join(', '),
      keyTakeaway2: KC2.join(', '),
      projectObjectives: PO.join(', '),
      desiredDeliverables: DD.join(', '),
      actionItems: Object.values(action_items).join(', '),
      currentPhase: 'Phase 1',
      consultantInput: consultant_input
    };
    this.logger.debug(`Mapped sowDetails: ${JSON.stringify(sowDetails)}`);

    const systemPrompt = `
      You are a consultant drafting a Statement of Work (SOW) for a client. Please generate an SOW structured as a JSON object with the following format:

      {
        "Project Overview": "Content for project overview, including goals and background.",
        "Project Objectives": ["Objective 1", "Objective 2" ...],
        "Key Challenges": ["Challenge 1", "Challenge 2" ...],
        "Project Scope": "Describe the project scope, with specific stages or processes if known.",
        "Roles and Responsibilities": {
          "Consultant Team": "Responsibilities...",
          "Client Team": "Responsibilities..."
        },
        "Desired Deliverables": ["Deliverable 1", "Deliverable 2" ...]
      }
      **Context**: This project, led by ${sowDetails.consultantName}, ${sowDetails.consultantRole}, focuses on a ${sowDetails.projectType} solution for ${sowDetails.companyName}. The primary client contact is ${sowDetails.clientName}, ${sowDetails.clientRole}. Key takeaways include ${sowDetails.keyTakeaway1} and ${sowDetails.keyTakeaway2}. Objectives are ${sowDetails.projectObjectives}, with desired deliverables as ${sowDetails.desiredDeliverables}. Action items include ${sowDetails.actionItems}.
      Consultant input: ${sowDetails.consultantInput}
      Feel free to expand on the structure if needed, but ensure all sections are present.
      Feel free to add as many bullet points as needed for each section. But keep the total content within each section brief, using summaries where possible.
      Use bullet points where lists are appropriate (e.g., objectives, challenges, deliverables). Return only the JSON object and ensure it's properly formatted.
      `;

    const config = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 4096,
      frequencyPenalty: 0,
      presencePenalty: 0,
    };

    try {
      // this.logger.log('Requesting SOW generation from AgentServiceRequest...');
      const response = await this.agentServiceRequest.sendAgentRequest(
        systemPrompt,
        'Only return the SOW and nothing else',
        config,
        instanceName,
        userId,
      );
      const cleanJsonContent = response?.messageContent?.content
        .replace(/```\s*json/, '') // Remove code block syntax if present
        .replace(/```/, ''); // Remove ending code block syntax

      const sowJson = JSON.parse(cleanJsonContent);
      if (!sowJson || typeof sowJson !== 'object') {
        throw new Error('Invalid JSON format from LLM response');
      }
      return sowJson;
      // if (response?.messageContent?.content) {
      //   const generatedSow = response.messageContent.content;
      //   // this.logger.debug(`Generated SOW: ${generatedSow}`);
      //   return generatedSow;
      // } else {
      //   throw new Error(`Invalid response: ${JSON.stringify(response)}`);
      // }
    } catch (error) {
      this.logger.error(`Error generating SOW: ${error.message}`, error.stack);
      throw new Error('Failed to generate SOW');
    }
  }
}
