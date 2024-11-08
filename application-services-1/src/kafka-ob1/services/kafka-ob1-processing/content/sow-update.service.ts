import { Injectable, Logger } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';

@Injectable()
export class SowUpdateService {
  private readonly logger = new Logger(SowUpdateService.name);

  constructor(private readonly agentServiceRequest: AgentServiceRequest) {}

  // Update SOW with insights from meeting analysis
  async updateSow(
    instanceName: string,
    userId: string,
    existingSowContent: string,
    pageContent: any,
    pageName: string,
  ): Promise<string> {
    try {
      // Step 1: Generate Meeting Analysis
      const meetingAnalysisPrompt = `
        You are acting as a consultant collaborating with another consultant to analyze a recent follow-up meeting with an existing customer. This is not the initial meeting; the project is already underway, and your goal is to assess progress, challenges, and any shifts in scope or timeline, using the details provided below:
        • Meeting Transcript: ${pageContent.transcript}
        • Existing Statement of Work (SOW): ${existingSowContent}
        • Current Action Items: ${pageContent.action_items}
        • Next Scheduled Meeting: ${pageContent.meeting_slot}
        • Consultant’s Input: ${pageContent.consultant_input}
        • Meeting Type: ${pageContent.event_type}
        • Completed Action Items from Previous Call: ${pageContent.completed_action_items}
        
        Please address the following questions in your analysis:
        
        1. Scope of Project: Did the scope of the project change, and if so, how?
           1.1 What is the current business case for doing the project? Has it shifted in focus or priority?
           1.2 Are there any budgetary changes affecting the project’s feasibility or scope?
           1.3 What key challenges have emerged or evolved since the last meeting?
           1.4 Has there been a scope change in key deliverables or in how the problem is addressed?
           1.5 Are there any notable reprioritizations in project goals or deliverables?
           1.6 Are there any new stakeholders involved, or have any existing stakeholders shifted their priorities or support for the project?
           1.7 Are there any new dependencies or resource bottlenecks that could impact project completion?
        
        2. Project Timeline: Did the project timeline change, and if so, how?
           2.1 Has the overall project end date changed (extended, shortened, or stayed the same)?
           2.2 Have any interim milestones or phases been adjusted in length or scheduling?
           2.3 Are there any mitigations or contingency plans in place for newly identified risks that might affect the timeline?
        
        If there are additional relevant factors not covered above, please include them in your analysis. For each point, if there is no change, simply state “no change,” and if it was not discussed, simply state "not discussed."
      `;

      this.logger.log(`Running meeting analysis for SOW update on ${pageName}`);
      const analysisResponse = await this.agentServiceRequest.sendAgentRequest(
        meetingAnalysisPrompt,
        'Return meeting analysis with answers to the outlined questions.',
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          maxTokens: 4096,
          frequencyPenalty: 0,
          presencePenalty: 0,
        },
        pageContent.instanceName,
        pageContent.userEmail,
      );

      const meetingAnalysis = analysisResponse.messageContent?.content;
      if (!meetingAnalysis) {
        this.logger.error(`Failed to generate meeting analysis`);
        throw new Error('Error in generating meeting analysis');
      }

      // Step 2: Generate Updated SOW Document
      const sowUpdatePrompt = `
        You are acting as a consultant collaborating with another consultant to update an existing Statement of Work (SOW) based on the recent follow-up meeting with an existing customer. The project is already underway, and your goal is to integrate the latest insights to reflect any changes in scope, objectives, deliverables, or timeline. Please use the inputs below to create an updated version of the SOW:
        Meeting Summary: ${meetingAnalysis}
        Existing Statement of Work (SOW): ${existingSowContent}
        
        Please provide the updates to be added to the SOW in the following structure:
        
        SOW Structure:
          1. Project Overview
             Project Title: [Specify or confirm any changes in the project title, if applicable]
             Project Background: [Include any adjustments to context or motivation based on the meeting]
          2. Project Objectives and Key Challenges
             Updated Objectives: Bullet points summarizing each objective identified in the meeting
             Key Challenges: Bullet points listing any challenges discussed or updated, with any relevant context
          3. Project Scope
             Current Process Evaluation: [Any updates to the process evaluation based on recent findings]
             Process Co-Design with Client: [Modifications or additions based on client feedback or new requirements]
             Iteration on Solution Prototypes: [Updates regarding prototype development or changes in approach]
          4. Desired Deliverables
             Deliverables List: [List any new deliverables discussed or updated specifications for existing ones]
          5. Timeline and Milestones
             Project End Date: [Adjustments to the end date if applicable]
             Phases and Interim Milestones: [List of updated milestones or changes in phases based on the latest meeting]
        
        If there are any points from the meeting analysis that don’t directly fit into the categories above but are relevant to the SOW update, please include them under a new section called Additional Insights. If any sections have no changes, simply state “no change.”
      `;

      this.logger.log(`Generating updated SOW based on meeting analysis`);
      const sowResponse = await this.agentServiceRequest.sendAgentRequest(
        sowUpdatePrompt,
        'Return the full updated SOW content.',
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          maxTokens: 4096,
          frequencyPenalty: 0,
          presencePenalty: 0,
        },
        instanceName,
        userId,
      );

      const updatedSowContent = sowResponse.messageContent?.content;
      if (!updatedSowContent) {
        this.logger.error(`Failed to generate updated SOW content`);
        throw new Error('Error in generating updated SOW content');
      }

      this.logger.log(
        `Successfully generated updated SOW for project ${pageName}`,
      );
      return updatedSowContent;
    } catch (error) {
      this.logger.error(`Error in updating SOW: ${error.message}`);
      throw new Error('Failed to update SOW');
    }
  }
}
