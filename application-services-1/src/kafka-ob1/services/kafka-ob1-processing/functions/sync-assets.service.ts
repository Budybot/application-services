import { Injectable, Logger } from '@nestjs/common';
import { ContentAssetsService } from '../content/content-assets.service';
import { GoogleDocService } from '../../google/google-doc.service';
import { GoogleSheetService } from '../../google/google-sheet.service';
import { SowSectionService } from '../content/sow-section.service';
import { AgentServiceRequest } from '../agent-service-request.service';

@Injectable()
export class SyncAssetsService {
  private readonly logger = new Logger(SyncAssetsService.name);

  constructor(
    private readonly contentAssetsService: ContentAssetsService,
    private readonly googleDocService: GoogleDocService,
    private readonly googleSheetService: GoogleSheetService,
    private readonly sowSectionService: SowSectionService,
    private readonly agentServiceRequest: AgentServiceRequest,
  ) {}

  async syncAssets(
    syncTo: string,
    syncFrom: string,
    projectName: string,
    instanceName: string,
    userEmail: string,
  ): Promise<void> {
    this.logger.log(`Syncing assets from ${syncFrom} to ${syncTo}`);

    // Step 1: Fetch latest asset IDs for syncTo and syncFrom
    const syncFromAssetId = await this.contentAssetsService.getAssetId(
      syncFrom,
      projectName,
      instanceName,
      userEmail,
    );
    const syncToAssetId = await this.contentAssetsService.getAssetId(
      syncTo,
      projectName,
      instanceName,
      userEmail,
    );

    // Step 2: Read the content based on asset type
    const syncFromContent =
      syncFrom === 'SOW'
        ? await this.googleDocService.readDocumentContent(syncFromAssetId)
        : await this.googleSheetService.readSheetData(syncFromAssetId);

    const syncToContent =
      syncTo === 'SOW'
        ? await this.googleDocService.readDocumentContent(syncToAssetId)
        : await this.googleSheetService.readSheetData(syncToAssetId);

    // Step 3: If either asset is SOW, split into sections for that asset
    const sowSections =
      syncFrom === 'SOW'
        ? await this.sowSectionService.splitSowIntoSections(
            instanceName,
            userEmail,
            syncFromContent as string,
          )
        : syncTo === 'SOW'
          ? await this.sowSectionService.splitSowIntoSections(
              instanceName,
              userEmail,
              syncToContent as string,
            )
          : null;

    const sowDelta =
      syncFrom === 'SOW' || syncTo === 'SOW'
        ? await this.contentAssetsService.getAssetId(
            'SOWDelta',
            projectName,
            instanceName,
            userEmail,
          )
        : null;
    this.logger.debug(`SOW Delta: ${sowDelta}`);

    // Step 4: Fork for specific sync cases - Implement SOW to ProjectPlanner
    let updatedOutput;
    if (syncFrom === 'ProjectPlanner' && syncTo === 'SOW') {
      this.logger.log('Implementing sync from ProjectPlanner to SOW');
      // Placeholder for future implementation
    } else if (syncFrom === 'SOW' && syncTo === 'ProjectPlanner') {
      this.logger.log('Syncing from SOW to ProjectPlanner');

      // Step 5: Compare "Desired Deliverables" and "Timeline" in SOW sections with ProjectPlanner data
      const comparisonPrompt = `
        Analyze the differences between SOW Desired Deliverables and Timeline & Milestones with the Project Planner content.
        
        SOW - Desired Deliverables: ${sowSections['Desired Deliverables']}
        SOW - Timeline & Milestones: ${sowSections['Timeline and Milestones']}
        
        Project Planner Data: ${JSON.stringify(syncToContent)}
        
        Provide a very brief analysis that highlights only the key points, specifically indicating any items that need to be added, removed, or adjusted. Your response should focus on actionable changes, such as specific deliverables or timeline items that are missing, misaligned, or redundant, to guide a precise update of the Project Planner.
        Do not add any formatting or additional content to the response. Just provide a concise analysis of the differences using bullet points or short sentences.
      `;

      const comparisonResponse =
        await this.agentServiceRequest.sendAgentRequest(
          comparisonPrompt,
          'Identify and outline differences for synchronization.',
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

      const differenceAnalysis = comparisonResponse.messageContent?.content;
      if (!differenceAnalysis) {
        this.logger.error(`Failed to generate difference analysis`);
        throw new Error('Error in generating difference analysis');
      }

      // Step 6: LLM Call to Generate Updated Project Planner
      const projectPlannerUpdatePrompt = `
        Using the difference analysis provided, generate an updated Project Planner.
        Difference Analysis: ${differenceAnalysis}
        Existing Project Planner: ${JSON.stringify(syncToContent)}
        
        Ensure the output is structured in JSON format compatible with Google Sheets.
      `;

      const updatedPlannerResponse =
        await this.agentServiceRequest.sendAgentRequest(
          projectPlannerUpdatePrompt,
          'Only return the updated Project Planner in JSON format. No additional content is allowed.',
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

      updatedOutput = updatedPlannerResponse.messageContent?.content;
      if (!updatedOutput) {
        this.logger.error(`Failed to generate updated Project Planner content`);
        throw new Error('Error in generating updated Project Planner');
      }
      updatedOutput = updatedOutput.replace(/```json|```/g, '').trim();
      updatedOutput = JSON.parse(updatedOutput);
    }

    // Step 7: Rewrite syncTo asset with updatedOutput
    if (syncTo === 'ProjectPlanner') {
      await this.googleSheetService.writeToSheet(syncToAssetId, updatedOutput);
    } else if (syncTo === 'SOW') {
      await this.googleDocService.writeToDocument(syncToAssetId, updatedOutput);
    }

    // Step 8: Update database for syncTo asset
    await this.contentAssetsService.saveDocumentAsset(
      syncTo,
      syncTo === 'ProjectPlanner' ? 'google sheet' : 'google doc',
      syncToAssetId,
      `https://docs.google.com/${syncTo === 'ProjectPlanner' ? 'spreadsheets' : 'document'}/d/${syncToAssetId}`,
      `${syncTo} for project (Synced from ${syncFrom})`,
      projectName,
      instanceName,
      userEmail,
    );

    this.logger.log(`Successfully synchronized ${syncFrom} to ${syncTo}`);
  }
}
