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
      // Step 1a: Generate Scope Analysis
      const scopeAnalysisPrompt = `
        You are collaborating with another consultant to assess the current state of an ongoing project following a recent client meeting. This is not the initial meeting, and the project is already underway. Analyze any shifts in project scope, challenges, and stakeholder alignment based on the provided details:
        • Meeting Transcript: ${pageContent.transcript}
        • Existing SOW: ${existingSowContent}
        • Action Items: ${pageContent.action_items}
        • Consultant’s Input: ${pageContent.consultant_input}
        • Meeting Type: ${pageContent.event_type}
        
        Address the following questions:
        1. Scope Changes:
           - Has the project scope changed? If yes, how?
           - Is the project focus or priority shifting?
           - Are there budgetary changes affecting feasibility?
           - What key challenges have emerged or evolved?
           - Have goals or deliverables been reprioritized?
           - Are there new stakeholders or shifts in support?
           - Are there new dependencies or bottlenecks affecting project completion?

        For each question, if there is no change, state “no change”; if not discussed, state "not discussed."
      `;
      this.logger.log(`Running scope analysis for SOW update on ${pageName}`);
      const scopeAnalysisResponse = await this.agentServiceRequest.sendAgentRequest(
        scopeAnalysisPrompt,
        'Return scope analysis based on the provided questions.',
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

      const scopeAnalysis = scopeAnalysisResponse.messageContent?.content;
      if (!scopeAnalysis) {
        this.logger.error(`Failed to generate scope analysis`);
        throw new Error('Error in generating scope analysis');
      }

      // Step 1b: Generate Timeline Analysis
      const timelineAnalysisPrompt = `
        As a follow-up to the recent meeting, analyze any changes or considerations affecting the project timeline. Use the details below to provide insights:
        • Meeting Transcript: ${pageContent.transcript}
        • Current Action Items: ${pageContent.action_items}
        • Completed Action Items from Previous Call: ${pageContent.completed_action_items}
        • Next Scheduled Meeting: ${pageContent.meeting_slot}
        
        Address the following questions:
        1. Timeline Changes:
           - Has the project end date changed?
           - Have any interim milestones been adjusted?
           - Are there contingency plans for newly identified risks?

        For each question, if there is no change, state “no change”; if not discussed, state "not discussed."
      `;
      this.logger.log(`Running timeline analysis for SOW update on ${pageName}`);
      const timelineAnalysisResponse = await this.agentServiceRequest.sendAgentRequest(
        timelineAnalysisPrompt,
        'Return timeline analysis based on the provided questions.',
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

      const timelineAnalysis = timelineAnalysisResponse.messageContent?.content;
      if (!timelineAnalysis) {
        this.logger.error(`Failed to generate timeline analysis`);
        throw new Error('Error in generating timeline analysis');
      }

      // Combine analyses for SOW update prompt
      const combinedMeetingAnalysis = `
        Scope Analysis:
        ${scopeAnalysis}

        Timeline Analysis:
        ${timelineAnalysis}
      `;

      // Step 2: Generate Updated SOW Document
      const sowUpdatePrompt = `
        You are updating an existing Statement of Work (SOW) based on recent project insights. Integrate any changes in scope, objectives, deliverables, or timeline using the details below:
        
        Meeting Summary: ${combinedMeetingAnalysis}
        Existing SOW: ${existingSowContent}
        
        Provide updates to the SOW using the structure below:
        
        SOW Structure:
          1. Project Overview
             Project Title: [Specify or confirm any changes in title]
             Project Background: [Update based on recent context]
          2. Project Objectives and Key Challenges
             Updated Objectives: Bullet points for each new or updated objective
             Key Challenges: Bullet points for any new or evolving challenges
          3. Project Scope
             Process Evaluation: [Updates based on recent findings]
             Co-Design with Client: [Modifications based on client feedback]
             Prototyping Iterations: [Updates on prototypes or changes]
          4. Desired Deliverables
             Deliverables List: [Add new deliverables or specifications for existing ones]
          5. Timeline and Milestones
             Project End Date: [Revised end date, if applicable]
             Phases & Milestones: [Updated list of milestones and phases]
        
        If there are relevant points from the meeting analysis that don’t directly fit into the categories, include them under a new section called Additional Insights. If sections have no changes, state “no change.”
      `;
      
      this.logger.log(`Generating updated SOW based on combined meeting analysis`);
      const sowResponse = await this.agentServiceRequest.sendAgentRequest(
        sowUpdatePrompt,
        'Return the updated SOW content based on the meeting summary.',
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
