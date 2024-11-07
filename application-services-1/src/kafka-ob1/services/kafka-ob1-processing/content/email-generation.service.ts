import { Injectable, Logger } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';

@Injectable()
export class EmailGenerationService {
  private readonly logger = new Logger(EmailGenerationService.name);

  constructor(private readonly agentServiceRequest: AgentServiceRequest) {}

  async generateEmail(
    instanceName: string,
    userId: string,
    emailData: any,
  ): Promise<string> {
    // Extract fields from emailData
    const {
      consultant_name,
      consultant_role,
      client_name,
      client_role,
      key_takeaway_1,
      key_takeaway_2,
      project_objectives,
      desired_deliverables,
      action_items,
      meeting_slots,
      consultant_input,
    } = emailData;

    const emailDetails = {
      consultantName: consultant_name,
      consultantRole: consultant_role,
      clientName: client_name,
      clientRole: client_role,
      keyTakeaway1: key_takeaway_1,
      keyTakeaway2: key_takeaway_2,
      projectObjectives: project_objectives,
      desiredDeliverables: desired_deliverables,
      actionItems: action_items,
      meetingSlots: meeting_slots,
      consultantInput: consultant_input,
    };

    const systemPrompt = `
      You are acting as the consultant, drafting a follow-up email to the customer after a recent meeting. 
      Please use the following details:

      Consultant name : ${emailDetails.consultantName}
      Consultant role : ${emailDetails.consultantRole}
      Primary User name : ${emailDetails.clientName}
      Primary User role : ${emailDetails.clientRole}

      Meeting highlights: Key takeaways include ${emailDetails.keyTakeaway1} & ${emailDetails.keyTakeaway2}
      Project objectives : ${emailDetails.projectObjectives}
      Desired deliverables : ${emailDetails.desiredDeliverables}
      Action items : ${emailDetails.actionItems}
      Next meeting : ${emailDetails.meetingSlots}
      User Input : ${emailDetails.consultantInput}
      
      The email should be structured in the following way and break it into sections with titles as defined below:
      Subject : 
      Body:

      1. Opening: Begin with a warm and professional introduction, mentioning the positive outcomes of the recent conversation.
      2. Meeting Highlights: Share as my notes and insights from the discussion, emphasizing the main points covered.
      3. Action Items: Present the action items in this order:
          3a Actions for the consultant
          3b Actions for the primary user
          3c Actions for any additional parties
      4. Closing: End with a thank you, reiterating your commitment to supporting their needs, and propose a time for the next meeting based on the available slots.
    `;

    const config = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 1000,
      frequencyPenalty: 0,
      presencePenalty: 0,
    };

    try {
      this.logger.log(
        'Requesting email generation from AgentServiceRequest...',
      );
      const response = await this.agentServiceRequest.sendAgentRequest(
        systemPrompt,
        'Only return the email and nothing else',
        config,
        instanceName,
        userId,
      );
      if (response?.messageContent?.content) {
        const generatedEmail = response.messageContent.content;
        this.logger.debug(`Generated email: ${generatedEmail}`);
        return generatedEmail;
      } else {
        throw new Error(`Invalid response: ${JSON.stringify(response)}`);
      }
    } catch (error) {
      this.logger.error(
        `Error generating email: ${error.message}`,
        error.stack,
      );
      throw new Error('Failed to generate email');
    }
  }
}
