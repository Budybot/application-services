import { Injectable, Logger } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';
import { GoogleDocService } from '../../google/google-doc.service';
import { GoogleSheetService } from '../../google/google-sheet.service';
import { ContentAssetsService } from '../content-assets.service';
import { SummarizationService } from './summarization.service';

@Injectable()
export class SowUpdateService {
  private readonly logger = new Logger(SowUpdateService.name);

  constructor(
    private readonly agentServiceRequest: AgentServiceRequest,
    private readonly googleDocService: GoogleDocService,
    private readonly googleSheetService: GoogleSheetService,
    private readonly contentAssetsService: ContentAssetsService,
    private readonly summarizationService: SummarizationService,
  ) {}

  async updateSowWithPlanner(
    projectName: string,
    sowDocId: string,
    plannerSheetId: string,
    instanceName: string,
    userEmail: string,
  ): Promise<string> {
    try {
      // Step 1: Fetch SOW and Project Planner content
      const sowContent =
        await this.googleDocService.readDocumentContent(sowDocId);
      const projectPlannerData =
        await this.googleSheetService.readSheetData(plannerSheetId);

      // Step 2: Summarize SOW sections
      const projectOverviewSummary =
        await this.summarizationService.summarizeFromDocument(
          instanceName,
          userEmail,
          sowContent,
          'Project Overview',
        );
      const keyChallengesSummary =
        await this.summarizationService.summarizeFromDocument(
          instanceName,
          userEmail,
          sowContent,
          'Key Challenges',
        );
      const projectObjectivesSummary =
        await this.summarizationService.summarizeFromDocument(
          instanceName,
          userEmail,
          sowContent,
          'Project Objectives',
        );
      const projectScopeSummary =
        await this.summarizationService.summarizeFromDocument(
          instanceName,
          userEmail,
          sowContent,
          'Project Scope',
        );

      // Step 3: Summarize Project Planner Discovery Phase
      const discoverySummary =
        await this.summarizationService.summarizeFromSheet(
          instanceName,
          userEmail,
          projectPlannerData,
          'Discovery',
        );

      // Step 4: Update Desired Deliverables in SOW based on summaries
      const desiredDeliverablesPrompt = `
      Based on the following summaries, update the "Desired Deliverables" section of the SOW:
      - Project Overview: ${projectOverviewSummary}
      - Key Challenges: ${keyChallengesSummary}
      - Project Objectives: ${projectObjectivesSummary}
      - Project Scope: ${projectScopeSummary}
      - Discovery Phase Summary: ${discoverySummary}
      Current SOW: ${sowContent}
    `;
      const desiredDeliverablesResponse =
        await this.agentServiceRequest.sendAgentRequest(
          desiredDeliverablesPrompt,
          'Return only the updated Desired Deliverables content.',
          {
            provider: 'openai',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            maxTokens: 4096,
            frequencyPenalty: 0,
            presencePenalty: 0,
          },
          instanceName,
          userEmail,
        );

      if (!desiredDeliverablesResponse?.messageContent?.content) {
        throw new Error('Failed to update Desired Deliverables');
      }
      const updatedDesiredDeliverables =
        desiredDeliverablesResponse.messageContent.content;

      // Step 5: Update Project Timeline in SOW based on summaries
      const timelinePrompt = `
        Using the summaries below, update the "Project Timeline" section of the SOW:
        - Project Overview: ${projectOverviewSummary}
        - Key Challenges: ${keyChallengesSummary}
        - Project Objectives: ${projectObjectivesSummary}
        - Project Scope: ${projectScopeSummary}
        - Discovery Phase Summary: ${discoverySummary}
      `;

      const timelineResponse = await this.agentServiceRequest.sendAgentRequest(
        timelinePrompt,
        'Return only the updated Project Timeline content.',
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          maxTokens: 4096,
          frequencyPenalty: 0,
          presencePenalty: 0,
        },
        instanceName,
        userEmail,
      );

      if (!timelineResponse?.messageContent?.content) {
        throw new Error('Failed to update Project Timeline');
      }
      const updatedProjectTimeline = timelineResponse.messageContent.content;

      // Step 6: Write updated sections to SOW document in Google Docs
    //   const finalUpdatedSow = `${sowContent}\n\n**Desired Deliverables:**\n${updatedDesiredDeliverables}\n\n**Project Timeline:**\n${updatedProjectTimeline}`;
      const finalUpdatedSow = `${updatedDesiredDeliverables}\n\n${updatedProjectTimeline}`;
      await this.googleDocService.writeToDocument(sowDocId, finalUpdatedSow);

    //   // Step 3: Construct prompt with relevant SOW and Project Planner sections
    //   const systemPrompt = `
    //     Update the Desired Deliverables and Project Timeline sections of the SOW. Use:
    //     - SOW Sections: Project Overview, Key Challenges, Project Objectives, Project Scope.
    //     - Project Planner Discovery Phase tasks to guide the update.
    //     Original SOW: ${sowContent}
    //     Project Planner Discovery Phase: ${JSON.stringify(projectPlannerData)}
    //   `;
    //   const testPrompt = `Give me a bad dad joke.`;

    //   // Step 4: Make LLM call
    //   const llmConfig = {
    //     provider: 'openai',
    //     model: 'gpt-4o-2024-08-06',
    //     temperature: 0.7,
    //     maxTokens: 8192,
    //     frequencyPenalty: 0,
    //     presencePenalty: 0,
    //   };
    //   const response = await this.agentServiceRequest.sendAgentRequest(
    //     systemPrompt,
    //     // testPrompt,
    //     // 'Make sure it is funny as well.',
    //     'Return the full updated SOW content',
    //     llmConfig,
    //     instanceName,
    //     userEmail,
    //   );

    //   if (!response?.messageContent?.content) {
    //     this.logger.error(
    //       `Invalid response from LLM: ${JSON.stringify(response)}`,
    //     );
    //     throw new Error('Invalid response from LLM');
    //   }
    //   const updatedSowContent = response.messageContent.content;

    //   // Step 5: Write updated SOW content to Google Doc
    //   await this.googleDocService.writeToDocument(sowDocId, updatedSowContent);

      // Step 6: Update SOW in database with new description
      await this.contentAssetsService.saveDocumentAsset(
        'SOW',
        'google doc',
        sowDocId,
        `https://docs.google.com/document/d/${sowDocId}`,
        `Statement of Work document for project ${projectName} (Updated with Project Planner)`,
        projectName,
        instanceName,
        userEmail,
      );

      this.logger.log(`Successfully updated SOW for project ${projectName}`);
      return `SOW updated successfully for project: ${projectName}`;
    } catch (error) {
      this.logger.error(`Error updating SOW: ${error.message}`);
      throw new Error('Failed to update SOW');
    }
  }
}
