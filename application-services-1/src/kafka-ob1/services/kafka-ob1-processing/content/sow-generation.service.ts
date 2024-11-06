import { Injectable, Logger } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';

@Injectable()
export class SowGenerationService {
  private readonly logger = new Logger(SowGenerationService.name);

  constructor(private readonly agentServiceRequest: AgentServiceRequest) {}

  async generateSow(
    instanceName: string,
    userId: string,
    sowDetails: {
      consultantName: string;
      consultantRole: string;
      projectType: string;
      companyName: string;
      clientName: string;
      clientRole: string;
      keyTakeaway1: string;
      keyTakeaway2: string;
      projectObjectives: string;
      desiredDeliverables: string;
      actionItems: string;
      currentPhase: string;
    },
  ): Promise<string> {
    const systemPrompt = `
      You are acting as a consultant, drafting a Statement of Work (SOW) after a recent meeting with a client. Please generate an SOW that follows the structure outlined below, using the provided details to fill in the necessary information.

      This project, led by ${sowDetails.consultantName}, ${sowDetails.consultantRole}, is focused on delivering a ${sowDetails.projectType} solution for ${sowDetails.companyName}. During discussions with ${sowDetails.clientName}, ${sowDetails.clientRole}, key takeaways included ${sowDetails.keyTakeaway1} and ${sowDetails.keyTakeaway2}. The primary objectives are defined as ${sowDetails.projectObjectives}, with desired deliverables encompassing ${sowDetails.desiredDeliverables}. Action items identified include ${sowDetails.actionItems}. Each section in this SOW should reflect the insights gathered during these initial conversations, tailored to meet the specific needs of the client.

      Project Phases:

      Phase 1: Discovery – Learning about the project and challenges; defining preliminary requirements (before purchase order).
      Phase 2: Definition – Detailing the problem, specifying deliverables, and planning.
      Phase 3: Implementation – Executing the plan and delivering solutions.
      Current Phase: ${sowDetails.currentPhase}
      If the current phase is Phase 1, omit sections 6-9.

      SOW Structure:

      Project Overview:

      Project Title
      Project Background
      Project Objectives and Key Challenges:

      Bullet points for each objective/challenge identified
      Project Scope:

      Current process evaluation
      Process co-design with client
      Iteration on solution prototypes
      Desired Deliverables:

      Bullet point list with elements from one or more of the following categories:
      Software system implementation
      Dashboards creation
      Training & documentation
      Roles and Responsibilities:

      Consultant Team: Paragraph detailing responsibilities
      Client Team: Paragraph detailing responsibilities
      Collaboration: Paragraph defining how communication and collaboration will work
      Project Timeline and Milestones:

      Phased timeline breaking the project into stages
      Key milestones and expected completion dates
      Review points for progress assessment
      Assumptions and Constraints:

      Assumptions: Outline assumptions such as client resource availability, access to systems, and the accuracy of current documentation
      Constraints: List any limitations or dependencies like budget restrictions, technical limitations, or third-party systems
      Cost and Payment Terms:

      Project Cost: Define the total cost of the project, broken down by phase if necessary
      Billing Schedule: Specify whether payment is due at milestones, monthly, or at project completion
      Expense Reimbursement: Note any additional costs for travel, software, or equipment
    `;

    const config = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 1500,
      frequencyPenalty: 0,
      presencePenalty: 0,
    };

    try {
      this.logger.log('Requesting SOW generation from AgentServiceRequest...');
      const response = await this.agentServiceRequest.sendAgentRequest(
        systemPrompt,
        '', // No user prompt needed since SOW details are in systemPrompt
        config,
        instanceName,
        userId,
      );

      const generatedSow = response.messageContent;
      this.logger.debug(generatedSow);
      this.logger.log('SOW generated successfully');
      return generatedSow;
    } catch (error) {
      this.logger.error(`Error generating SOW: ${error.message}`, error.stack);
      throw new Error('Failed to generate SOW');
    }
  }
}
