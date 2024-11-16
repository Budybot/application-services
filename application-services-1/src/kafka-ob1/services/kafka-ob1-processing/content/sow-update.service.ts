import { Injectable, Logger } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';
// import { SowSectionService } from './sow-section.service';
import { ContentAssetsService } from './content-assets.service';
import { GoogleDocService } from '../../google/google-doc.service';

@Injectable()
export class SowUpdateService {
  private readonly logger = new Logger(SowUpdateService.name);

  constructor(
    private readonly agentServiceRequest: AgentServiceRequest,
    // private readonly sowSectionService: SowSectionService,
    private readonly contentAssetsService: ContentAssetsService,
    private readonly googleDocService: GoogleDocService,
  ) {}

  async updateSow(
    instanceName: string,
    userId: string,
    projectName: string,
    documentId: string, // Pass the Google Doc ID
    pageContent: any,
    pageName: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Received request to update SOW with document ID: ${documentId}`,
      );
      // Step 1: Retrieve SOW sections based on headers
      const sowSections =
        await this.googleDocService.getDocumentSections(documentId);
      this.logger.debug(
        `Retrieved SOW sections: ${JSON.stringify(sowSections)}`,
      );

      // Extract relevant sections
      const projectObjectives = sowSections['Project Objectives'];
      const projectScope = sowSections['Project Scope'];
      const desiredDeliverables = sowSections['Desired Deliverables'];
      const projectTimeline = sowSections['Timeline and Milestones'];
      const keyChallenges = sowSections['Key Challenges'];

      // Step 2a: Generate Scope Analysis
      const scopeAnalysisPrompt = `
        You are collaborating with another consultant to assess the current state of an ongoing project following a recent client meeting. Focus on any shifts in project objectives, challenges, and scope based on the details provided:

        • Meeting Transcript: ${pageContent.transcript}
        • Project Objectives and Key Challenges: ${projectObjectives} & ${keyChallenges}
        • Project Scope: ${projectScope}
        • Consultant’s Input: ${pageContent.consultant_input}

        Address the following questions:
        - Has the project scope changed? If yes, how?
        - What key challenges have emerged or evolved?
        - Are there new dependencies or bottlenecks affecting project completion?

        For each question, if there is no change, state “no change”; if not discussed, state "not discussed."
      `;

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
        throw new Error('Failed to generate scope analysis');
      }

      // Step 2b: Generate Timeline Analysis
      const timelineAnalysisPrompt = `
        Based on recent client discussions, assess any changes or updates affecting the project timeline:
        • Meeting Transcript: ${pageContent.transcript}
        • Consultant’s Input: ${pageContent.consultant_input}
        • Current Action Items: ${pageContent.action_items}
        • Completed Action Items from Previous Call: ${pageContent.action_items_completed}
        • Desired Deliverables: ${desiredDeliverables}
        Current Timeline: ${projectTimeline}

        Answer the following:
        - Has the project end date changed?
        - Have interim milestones been adjusted?
        - Are there contingency plans for new risks?

        If there is no change, state “no change”; if not discussed, state "not discussed."
      `;

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
        throw new Error('Failed to generate timeline analysis');
      }

      // Step 3: Generate Updates Based on Analyses
      const scopeUpdatePrompt = `
      Update relevant sections of the Statement of Work (SOW) based on the scope analysis. Only return sections that require changes.

      Scope Analysis: ${scopeAnalysis}
      Existing SOW: ${JSON.stringify(sowSections)}

      Return a JSON object with only the changes:

      {
        "sectionName": {"add": "new content only", "remove": "old content"},
        ...
      }
      Instructions:

      Do not repeat existing content: Only list under "add" content that is completely new and not already present in the SOW.
      Avoid duplicating bullet points: Verify that items listed under "add" are distinct from current content.
      Use bullet points (-) where possible.
      If only adding content, set "remove" to "". If only removing content, set "add" to "".
      Exclude sections with no changes.
      Generate a concise response, free of any redundant, duplicate, or conflicting entries.
      `;

      const scopeResponse = await this.agentServiceRequest.sendAgentRequest(
        scopeUpdatePrompt,
        'Return the scope-based SOW updates in JSON format.',
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

      const scopeUpdates = this.cleanAndParseJson(
        scopeResponse.messageContent?.content || '{}',
      );

      const timelineUpdatePrompt = `
        Update the relevant sections of the Statement of Work (SOW) based on the timeline analysis. Only return sections with changes.

        Timeline Analysis: ${timelineAnalysis}
        Existing SOW: ${JSON.stringify(sowSections)}

        Return a JSON object with only the changes:

        {
          "sectionName": {"add": "new content only", "remove": "old content"},
          ...
        }
        Instructions:

        Do not repeat existing content: Only list under "add" content that is completely new and not already present in the SOW.
        Avoid duplicating bullet points: Verify that items listed under "add" are distinct from current content.
        Use bullet points (-) where possible.
        If only adding content, set "remove" to "". If only removing content, set "add" to "".
        Exclude sections with no changes.
        Generate a concise response, free of any redundant, duplicate, or conflicting entries.
        If there is no Timeline and Milestones section in the SOW, add it with the new content.

      `;

      const timelineResponse = await this.agentServiceRequest.sendAgentRequest(
        timelineUpdatePrompt,
        'Return the timeline-based SOW updates in JSON format.',
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

      const timelineUpdates = this.cleanAndParseJson(
        timelineResponse.messageContent?.content || '{}',
      );

      // Step 4: Merge and Apply Updates
      const allUpdates = { ...scopeUpdates, ...timelineUpdates };

      // Optionally save the updates as an asset
      await this.contentAssetsService.saveDocumentAsset(
        'SOWDelta',
        'json',
        'SOWDelta',
        '',
        JSON.stringify(allUpdates),
        projectName,
        instanceName,
        userId,
      );

      // Step 5: Apply updates to the Google Doc
      await this.googleDocService.appendRecommendations(documentId, allUpdates);

      this.logger.log(`Successfully updated SOW for project ${pageName}`);
    } catch (error) {
      this.logger.error(`Error in updating SOW: ${error.message}`);
      throw new Error('Failed to update SOW');
    }
  }

  private cleanAndParseJson(output: string): any {
    try {
      const sanitizedOutput = output.replace(/```json|```/g, '').trim();
      return JSON.parse(sanitizedOutput);
    } catch (error) {
      this.logger.error(`Failed to parse JSON: ${error.message}`);
      throw new Error('Invalid JSON format received from LLM');
    }
  }
}
