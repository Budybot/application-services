import { Injectable, Logger } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';
// import { CrudOperationsService } from '../crud-operations.service';
import { GoogleDocService } from '../../google/google-doc.service';
import { GoogleSheetService } from '../../google/google-sheet.service';
import { ContentAssetsService } from '../content-assets.service';

@Injectable()
export class SowUpdateService {
  private readonly logger = new Logger(SowUpdateService.name);

  constructor(
    private readonly agentServiceRequest: AgentServiceRequest,
    // private readonly crudOperationsService: CrudOperationsService,
    private readonly googleDocService: GoogleDocService,
    private readonly googleSheetService: GoogleSheetService,
    private readonly contentAssetsService: ContentAssetsService,
  ) {}

  async updateSowWithPlanner(
    projectName: string,
    sowDocId: string,
    plannerSheetId: string,
    instanceName: string,
    userEmail: string,
  ): Promise<string> {
    try {
      // Step 2: Fetch SOW and Project Planner content
      const sowContent =
        await this.googleDocService.readDocumentContent(sowDocId);
      const projectPlannerData =
        await this.googleSheetService.readSheetData(plannerSheetId);

      // Step 3: Construct prompt with relevant SOW and Project Planner sections
      const systemPrompt = `
        Update the Desired Deliverables and Project Timeline sections of the SOW. Use:
        - SOW Sections: Project Overview, Key Challenges, Project Objectives, Project Scope.
        - Project Planner Discovery Phase tasks to guide the update.
        Original SOW: ${sowContent}
        Project Planner Discovery Phase: ${JSON.stringify(projectPlannerData)}
      `;
      const testPrompt = `Give me a bad dad joke.`;

      // Step 4: Make LLM call
      const llmConfig = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 20000,
        frequencyPenalty: 0,
        presencePenalty: 0,
      };
      const response = await this.agentServiceRequest.sendAgentRequest(
        systemPrompt,
        // testPrompt,
        'Return the full updated SOW content',
        llmConfig,
        instanceName,
        userEmail,
      );

      if (!response?.messageContent?.content) {
        this.logger.error(
          `Invalid response from LLM: ${JSON.stringify(response)}`,
        );
        throw new Error('Invalid response from LLM');
      }
      const updatedSowContent = response.messageContent.content;

      // Step 5: Write updated SOW content to Google Doc
      await this.googleDocService.writeToDocument(sowDocId, updatedSowContent);

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
