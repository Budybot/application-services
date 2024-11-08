import { Injectable, Logger } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';
import { SowSectionService } from './sow-section.service';

@Injectable()
export class SowUpdateService {
  private readonly logger = new Logger(SowUpdateService.name);

  constructor(
    private readonly agentServiceRequest: AgentServiceRequest,
    private readonly sowSectionService: SowSectionService,
  ) {}

  async updateSow(
    instanceName: string,
    userId: string,
    existingSowContent: string,
    pageContent: any,
    pageName: string,
  ): Promise<string> {
    try {
      // Step 1: Split the SOW into sections
      const sowSections = await this.sowSectionService.splitSowIntoSections(
        instanceName,
        userId,
        existingSowContent,
      );

      // Extract relevant sections
      const objectivesChallenges =
        sowSections['Project Objectives and Key Challenges'];
      const projectScope = sowSections['Project Scope'];

      // Step 2a: Generate Scope Analysis
      const scopeAnalysisPrompt = `
        You are collaborating with another consultant to assess the current state of an ongoing project following a recent client meeting. Focus on any shifts in project objectives, challenges, and scope based on the details provided:
        
        • Meeting Transcript: ${pageContent.transcript}
        • Project Objectives and Key Challenges: ${objectivesChallenges}
        • Project Scope: ${projectScope}
        • Consultant’s Input: ${pageContent.consultant_input}
        
        Address the following questions:
        - Has the project scope changed? If yes, how?
        - What key challenges have emerged or evolved?
        - Are there new dependencies or bottlenecks affecting project completion?
        
        For each question, if there is no change, state “no change”; if not discussed, state "not discussed."
      `;

      this.logger.log(`Running scope analysis for SOW update on ${pageName}`);
      const scopeAnalysisResponse =
        await this.agentServiceRequest.sendAgentRequest(
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

      // Step 2b: Generate Timeline Analysis
      const desiredDeliverables = sowSections['Desired Deliverables'];
      const timelineAnalysisPrompt = `
        Based on recent client discussions, assess any changes or updates affecting the project timeline:
        • Meeting Transcript: ${pageContent.transcript}
        • Current Action Items: ${pageContent.action_items}
        • Completed Action Items from Previous Call: ${pageContent.completed_action_items}
        • Desired Deliverables: ${desiredDeliverables}
        
        Answer the following:
        - Has the project end date changed?
        - Have interim milestones been adjusted?
        - Are there contingency plans for new risks?

        If there is no change, state “no change”; if not discussed, state "not discussed."
      `;

      this.logger.log(
        `Running timeline analysis for SOW update on ${pageName}`,
      );
      const timelineAnalysisResponse =
        await this.agentServiceRequest.sendAgentRequest(
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

      // Step 3: Generate Updated SOW Document
      const combinedMeetingAnalysis = `
        Scope Analysis:
        ${scopeAnalysis}

        Timeline Analysis:
        ${timelineAnalysis}
      `;

      const sowUpdatePrompt = `
        Update the Statement of Work (SOW) based on recent project insights. Integrate any changes in scope, objectives, and timeline using the following:
        
        Meeting Summary: ${combinedMeetingAnalysis}
        Project Objectives and Key Challenges: ${objectivesChallenges}
        Project Scope: ${projectScope}
        
        SOW Structure:
        1. Project Overview
        2. Project Objectives and Key Challenges
        3. Project Scope
        4. Desired Deliverables
        5. Timeline and Milestones

        If sections have no changes, state “no change.”
      `;

      this.logger.log(`Generating updated SOW based on meeting analysis`);
      const sowResponse = await this.agentServiceRequest.sendAgentRequest(
        sowUpdatePrompt,
        'Return the updated SOW content.',
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
