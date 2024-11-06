import { Injectable, Logger } from '@nestjs/common';
import { SowGenerationService } from './sow-generation.service';
import { ContentAssetsService } from '../content-assets.service';

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    private readonly sowGenerationService: SowGenerationService,
    private readonly contentAssetsService: ContentAssetsService,
  ) {}

  async generateContent(
    projectName: string,
    instanceName: string,
    contentData: { sowContent?: any; pageName: string },
    userEmail: string,
  ): Promise<string> {
    const { pageName, sowContent } = contentData;

    try {
      // Route generation based on page name (e.g., for SOW generation)
      this.logger.debug(
        `Generating content for page ${pageName} with data: ${sowContent}`,
      );
      if (pageName === 'OB1-pages-filterPage1' && sowContent) {
        this.logger.log(`Generating SOW content for page ${pageName}`);

        // Use SowGenerationService for SOW content
        const documentId = await this.sowGenerationService.generateSow(
          instanceName,
          userEmail,
          sowContent,
        );

        // Record the generated asset in ContentAssetsService
        await this.contentAssetsService.saveDocumentAsset(
          'SOW',
          'google doc',
          documentId,
          `https://docs.google.com/document/d/${documentId}`,
          `Statement of Work document for project ${projectName}`,
          projectName,
          instanceName,
          userEmail,
        );

        this.logger.log(`Generated SOW document with ID: ${documentId}`);
        return documentId;
      }

      // Extend with additional pageName conditions as needed
      throw new Error('No matching content generation found for the page');
    } catch (error) {
      this.logger.error(`Failed to generate content: ${error.message}`);
      throw new Error('Content generation failed');
    }
  }
}
