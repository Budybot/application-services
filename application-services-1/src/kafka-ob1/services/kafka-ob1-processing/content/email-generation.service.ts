import { Injectable, Logger } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';
import { FormJsonService } from './form-json.service';

@Injectable()
export class EmailGenerationService {
  private readonly logger = new Logger(EmailGenerationService.name);

  constructor(
    private readonly agentServiceRequest: AgentServiceRequest,
    private readonly formJsonService: FormJsonService,
  ) {}
  async generateEmail(
    instanceName: string,
    userId: string,
    emailData: any,
  ): Promise<string> {
    const { pageName } = emailData;
    if (pageName.endsWith('filterPage1')) {
      // Extract fields from emailData
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
        meeting_slots,
        consultant_input,
      } = emailData;

      const emailDetails = {
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
        Please structure the email with titles as specified but exclude any numbering or labels like 'Body:', '1. Opening:', etc.
        Do not include section titles in the email.
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
        // this.logger.log(
        //   'Requesting email generation from AgentServiceRequest...',
        // );
        const response = await this.agentServiceRequest.sendAgentRequest(
          systemPrompt,
          'Only return the email and nothing else',
          config,
          instanceName,
          userId,
        );
        if (response?.messageContent?.content) {
          const generatedEmail = response.messageContent.content;
          // this.logger.debug(`Generated email: ${generatedEmail}`);
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
    } else if (pageName.endsWith('inputPage2')) {
      // Extract required fields
      const {
        consultant_name,
        consultant_role,
        client_name,
        client_role,
        transcript,
        action_items,
        meeting_slots,
        event_type,
      } = emailData;
      let consultant_input = emailData.consultant_input;

      // // Generate meeting summary and action items for inputPage2
      // const meetingSummary = await this.formJsonService.generateFormJson(
      //   transcript,
      //   consultant_input,
      //   'Project Description', // Include relevant description if needed
      //   userId,
      //   instanceName,
      // );

      const updatedActionItems = await this.formJsonService.generateActionItems(
        transcript,
        action_items,
        userId,
        instanceName,
      );
      consultant_input = `${consultant_input} This is the second meeting with the client about the project.`;

      // Define email structure for inputPage2
      const inputPage2Prompt = `
        You are acting as the consultant, drafting a follow-up email to the customer after a recent meeting. This is not the first meeting with the customer.
        
        Use the following details:
        - Consultant name: ${consultant_name}
        - Consultant role: ${consultant_role}
        - Primary user name: ${client_name}
        - Primary user role: ${client_role}

        Meeting Transcript: ${transcript}
        Action items: ${JSON.stringify(updatedActionItems)}
        Next meeting: ${meeting_slots}
        Consultant Input: ${consultant_input}
        Meeting type: ${event_type}
        
        Email Structure:
        1. Opening: Start with a warm, professional tone mentioning positive outcomes.
        2. Meeting Highlights: Summarize main points and insights from the recent meeting.
        3. Action Items: Present organized by:
            a. Consultant’s responsibilities
            b. Primary user's responsibilities
            c. Additional parties (if any)
        4. Closing: Express commitment, propose next meeting time from available slots.
        Please structure the email with titles as specified but exclude any numbering or labels like 'Body:', '1. Opening:', etc.
        Do not include section titles in the email.
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
        // this.logger.log('Requesting email generation for inputPage2...');
        const response = await this.agentServiceRequest.sendAgentRequest(
          inputPage2Prompt,
          'Only return the email and nothing else.',
          config,
          instanceName,
          userId,
        );

        if (response?.messageContent?.content) {
          const generatedEmail = response.messageContent.content;
          // this.logger.debug(
          //   `Generated email for inputPage2: ${generatedEmail}`,
          // );
          return generatedEmail;
        } else {
          throw new Error(`Invalid response: ${JSON.stringify(response)}`);
        }
      } catch (error) {
        this.logger.error(
          `Error generating email for inputPage2: ${error.message}`,
          error.stack,
        );
        throw new Error('Failed to generate email for inputPage2');
      }
    } else {
      throw new Error('Unsupported page type for email generation');
    }
  }
}
