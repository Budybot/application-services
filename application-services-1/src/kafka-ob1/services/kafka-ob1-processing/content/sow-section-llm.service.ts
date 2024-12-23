import { Injectable, Logger } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';

@Injectable()
export class SowSectionServiceLLM {
  private readonly logger = new Logger(SowSectionServiceLLM.name);

  constructor(private readonly agentServiceRequest: AgentServiceRequest) {}

  // Function to split SOW document into sections
  async splitSowIntoSections(
    instanceName: string,
    userId: string,
    sowContent: string,
  ): Promise<Record<string, string>> {
    try {
      // Define the prompt to split the SOW content by sections
      const splitSowPrompt = `
        You are assisting in analyzing a Statement of Work (SOW) document. The document provided has multiple sections, and your task is to extract each section individually. 

        The document structure typically includes:
        - **Project Overview**
        - **Project Objectives**
        - **Key Challenges**
        - **Project Scope**
        - **Roles and Responsibilities**
        - **Desired Deliverables**
        - **Timeline and Milestones**

        Please parse the document below into these sections and return each as a map in JSON format where the keys are the section titles and the values are the corresponding section contents. If any section is missing, please leave it empty.

        Document Content:
        ${sowContent}

        Return format:
        {
          "Project Overview": "Content here...",
          "Project Objectives": "Content here...",
          "Key Challenges": "Content here...",
          "Project Scope": "Content here...",
          "Roles and Responsibilities": "Content here...",
          "Desired Deliverables": "Content here..."
          "Timeline and Milestones": "Content here..."
        }
      `;

      // this.logger.log(
      //   `Requesting SOW split into sections for instance ${instanceName}`,
      // );

      const response = await this.agentServiceRequest.sendAgentRequest(
        splitSowPrompt,
        'Return the SOW sections as a JSON map.',
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.5,
          maxTokens: 4096,
          frequencyPenalty: 0,
          presencePenalty: 0,
        },
        instanceName,
        userId,
      );

      // Clean and parse the response
      let cleanedContent = response.messageContent?.content || '';

      // Remove ```json and ``` if they exist
      cleanedContent = cleanedContent.replace(/```json|```/g, '').trim();

      const sectionsMap = JSON.parse(cleanedContent);

      if (!sectionsMap) {
        this.logger.error('Failed to retrieve SOW sections map.');
        throw new Error('Error parsing SOW into sections');
      }

      this.logger.log('Successfully split SOW into sections');
      return sectionsMap;
    } catch (error) {
      this.logger.error(`Error splitting SOW into sections: ${error.message}`);
      throw new Error('Failed to split SOW into sections');
    }
  }
}
