import { Injectable, Logger } from '@nestjs/common';
import { SowGenerationService } from './sow-generation.service';
import { EmailGenerationService } from './email-generation.service';
import { ContentAssetsService } from '../content-assets.service';
import { GoogleDocService } from '../../google/google-doc.service';

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    private readonly sowGenerationService: SowGenerationService,
    private readonly emailGenerationService: EmailGenerationService,
    private readonly contentAssetsService: ContentAssetsService,
    private readonly googleDocService: GoogleDocService,
  ) {}

  async generateContent(
    projectName: string,
    instanceName: string,
    contentData: {
      contentType: 'SOW' | 'Email';
      sowData?: any;
      emailData?: any;
      pageName: string;
    },
    userEmail: string,
  ): Promise<string> {
    const { pageName, contentType, sowData, emailData } = contentData;
    this.logger.debug(
      `Generating content of type ${contentType} for page ${pageName} with data: ${JSON.stringify(contentData)}`,
    );

    try {
      let generatedContent: string;
      let documentTitle: string;

      // Route generation based on content type
      if (contentType === 'SOW' && sowData) {
        this.logger.log(`Generating SOW content for page ${pageName}`);

        // Step 1: Generate the SOW content
        generatedContent = await this.sowGenerationService.generateSow(
          instanceName,
          userEmail,
          sowData,
        );
        documentTitle = `SOW for ${projectName}`;
      } else if (contentType === 'Email' && emailData) {
        this.logger.log(`Generating Email content for page ${pageName}`);

        // Step 1: Generate the email content
        generatedContent = await this.emailGenerationService.generateEmail(
          instanceName,
          userEmail,
          emailData,
        );
        documentTitle = `Follow-Up Email for ${projectName}`;
      } else {
        throw new Error(
          'Invalid content type or missing data for content generation',
        );
      }

      // Step 2: Create a Google Doc with the generated content
      const folderId =
        await this.googleDocService.createGoogleDriveFolder(projectName);
      const documentId = await this.googleDocService.createGoogleDoc(
        documentTitle,
        folderId,
        userEmail,
      );

      // Step 3: Write the generated content to the Google Doc
      await this.googleDocService.writeToDocument(documentId, generatedContent);

      // Step 4: Save the document info in the assets database
      await this.contentAssetsService.saveDocumentAsset(
        contentType,
        'google doc',
        documentId,
        `https://docs.google.com/document/d/${documentId}`,
        `${contentType} document for project ${projectName}`,
        projectName,
        instanceName,
        userEmail,
      );

      this.logger.log(
        `Generated ${contentType} document with ID: ${documentId}`,
      );
      return documentId;
    } catch (error) {
      this.logger.error(
        `Failed to generate ${contentType} content: ${error.message}`,
      );
      throw new Error(`${contentType} content generation failed`);
    }
  }
  // async generateContent(
  //   projectName: string,
  //   instanceName: string,
  //   contentData: { sowData?: any; pageName: string },
  //   userEmail: string,
  // ): Promise<string> {
  //   const { pageName, sowData } = contentData;
  //   this.logger.debug(
  //     `Generating content for page ${pageName} with data: ${JSON.stringify(sowData)}`,
  //   );
  //   try {
  //     // Route generation based on page name (e.g., for SOW generation)
  //     if (pageName === 'OB1-pages-filterPage1' && sowData) {
  //       this.logger.log(`Generating SOW content for page ${pageName}`);

  //       // Step 1: Generate the SOW content
  //       const sowContent = await this.sowGenerationService.generateSow(
  //         instanceName,
  //         userEmail,
  //         sowData,
  //       );

  //       // Step 2: Create a Google Doc with the generated content
  //       const folderId =
  //         await this.googleDocService.createGoogleDriveFolder(projectName);
  //       const documentId = await this.googleDocService.createGoogleDoc(
  //         `SOW for ${projectName}`,
  //         folderId,
  //         userEmail,
  //       );

  //       // Step 3: Write the generated content to the Google Doc
  //       await this.googleDocService.writeToDocument(documentId, sowContent);

  //       // Step 4: Save the document info in the assets database
  //       await this.contentAssetsService.saveDocumentAsset(
  //         'SOW',
  //         'google doc',
  //         documentId,
  //         `https://docs.google.com/document/d/${documentId}`,
  //         `Statement of Work document for project ${projectName}`,
  //         projectName,
  //         instanceName,
  //         userEmail,
  //       );

  //       this.logger.log(`Generated SOW document with ID: ${documentId}`);
  //       return documentId;
  //     }

  //     // Extend with additional pageName conditions as needed
  //     throw new Error('No matching content generation found for the page');
  //   } catch (error) {
  //     this.logger.error(`Failed to generate content: ${error.message}`);
  //     throw new Error('Content generation failed');
  //   }
  // }
}
