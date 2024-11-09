import { Injectable, Logger } from '@nestjs/common';
import { SowGenerationService } from './sow-generation.service';
import { EmailGenerationService } from './email-generation.service';
import { ProjectPlannerService } from './project-planner.service';
import { ContentAssetsService } from './content-assets.service';
import { GoogleDocService } from '../../google/google-doc.service';
import { GoogleSheetService } from '../../google/google-sheet.service';
import { SowUpdateService } from './sow-update.service';

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(
    private readonly sowGenerationService: SowGenerationService,
    private readonly emailGenerationService: EmailGenerationService,
    private readonly projectPlannerService: ProjectPlannerService,
    private readonly contentAssetsService: ContentAssetsService,
    private readonly googleDocService: GoogleDocService,
    private readonly googleSheetService: GoogleSheetService,
    private readonly sowUpdateService: SowUpdateService,
  ) {}

  async generateContent(
    projectName: string,
    instanceName: string,
    contentData: { sowData?: any; pageName: string },
    userEmail: string,
    contentType: 'SOW' | 'Email' | 'ProjectPlanner',
  ): Promise<string> {
    const { sowData } = contentData;

    try {
      if (contentType === 'SOW') {
        this.logger.log(`Generating SOW content for project ${projectName}`);
        const sowContent = await this.sowGenerationService.generateSow(
          instanceName,
          userEmail,
          sowData,
        );

        const folderId =
          await this.googleDocService.createGoogleDriveFolder(projectName);
        const documentId = await this.googleDocService.createGoogleDoc(
          `SOW for ${projectName}`,
          folderId,
          userEmail,
        );

        await this.googleDocService.writeToDocument(documentId, sowContent);
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
      } else if (contentType === 'Email') {
        this.logger.log(`Generating Email content for project ${projectName}`);
        const emailContent = await this.emailGenerationService.generateEmail(
          instanceName,
          userEmail,
          sowData,
        );

        const folderId =
          await this.googleDocService.createGoogleDriveFolder(projectName);
        const documentId = await this.googleDocService.createGoogleDoc(
          `Follow-up Email for ${projectName}`,
          folderId,
          userEmail,
        );

        await this.googleDocService.writeToDocument(documentId, emailContent);
        await this.contentAssetsService.saveDocumentAsset(
          'Email',
          'google doc',
          documentId,
          `https://docs.google.com/document/d/${documentId}`,
          `Follow-up email document for project ${projectName}`,
          projectName,
          instanceName,
          userEmail,
        );
        this.logger.log(`Generated Email document with ID: ${documentId}`);
        return documentId;
      } else if (contentType === 'ProjectPlanner') {
        this.logger.log(
          `Generating Project Planner for project ${projectName}`,
        );
        // Generate project planner content in CSV format
        const projectPlannerContent =
          await this.projectPlannerService.generateProjectPlan(
            instanceName,
            userEmail,
            sowData,
          );

        const folderId =
          await this.googleSheetService.createGoogleDriveFolder(projectName);
        const sheetId = await this.googleSheetService.createGoogleSheet(
          `Project Planner for ${projectName}`,
          folderId,
          userEmail,
        );

        // Write the CSV formatted content into the Google Sheet
        await this.googleSheetService.writeToSheet(
          sheetId,
          projectPlannerContent,
        );

        // Save the Sheet info in the assets database
        await this.contentAssetsService.saveDocumentAsset(
          'ProjectPlanner',
          'google sheet',
          sheetId,
          `https://docs.google.com/spreadsheets/d/${sheetId}`,
          `Project Planner for project ${projectName}`,
          projectName,
          instanceName,
          userEmail,
        );

        this.logger.log(`Generated Project Planner with Sheet ID: ${sheetId}`);
        return sheetId;
      }

      throw new Error('Invalid content type specified');
    } catch (error) {
      this.logger.error(
        `Failed to generate ${contentType} content: ${error.message}`,
      );
      throw new Error(`Content generation failed for ${contentType}`);
    }
  }
  async updateContent(
    projectName: string,
    instanceName: string,
    contentData: { sowData?: any; pageName: string },
    userEmail: string,
    contentType: 'SOW' | 'Email' | 'ProjectPlanner',
  ): Promise<string> {
    try {
      // Step 1: Fetch External Asset ID based on contentType
      this.logger.log(`Fetching asset ID for contentType: ${contentType}`);
      const assetId = await this.contentAssetsService.getAssetId(
        contentType,
        projectName,
        instanceName,
        userEmail,
      );

      // Step 2: Read Existing Content
      let existingContent;
      if (contentType === 'SOW' || contentType === 'Email') {
        this.logger.log(`Reading document content for asset ID: ${assetId}`);
        existingContent =
          await this.googleDocService.readDocumentContent(assetId);
      } else if (contentType === 'ProjectPlanner') {
        this.logger.log(`Reading sheet data for asset ID: ${assetId}`);
        existingContent = await this.googleSheetService.readSheetData(assetId);
      }

      // Step 3: Pass Content to Update Function based on contentType
      let updatedContent;
      if (contentType === 'SOW') {
        this.logger.log(`Updating SOW content for project: ${projectName}`);
        updatedContent = await this.sowUpdateService.updateSow(
          instanceName,
          userEmail,
          projectName,
          existingContent,
          contentData.sowData,
          contentData.pageName,
        );
      // } else if (contentType === 'Email') {
      //   this.logger.log(`Updating Email content for project: ${projectName}`);
      //   updatedContent = await this.emailGenerationService.updateEmail(
      //     existingContent,
      //     contentData.sowData,
      //   );
      // } else if (contentType === 'ProjectPlanner') {
      //   this.logger.log(
      //     `Updating Project Planner content for project: ${projectName}`,
      //   );
      //   updatedContent = await this.projectPlannerService.updateProjectPlan(
      //     existingContent,
      //     contentData.pageName,
      //   );
      }

      // Step 4: Write Updated Content to Document or Sheet
      if (contentType === 'SOW' || contentType === 'Email') {
        await this.googleDocService.writeToDocument(assetId, updatedContent);
      } else if (contentType === 'ProjectPlanner') {
        await this.googleSheetService.writeToSheet(assetId, updatedContent);
      }

      // Step 5: Save Updated Content to Database
      await this.contentAssetsService.saveDocumentAsset(
        contentType,
        contentType === 'ProjectPlanner' ? 'google sheet' : 'google doc',
        assetId,
        `https://docs.google.com/${contentType === 'ProjectPlanner' ? 'spreadsheets' : 'document'}/d/${assetId}`,
        `${contentType} for project ${projectName} (Updated)`,
        projectName,
        instanceName,
        userEmail,
      );

      this.logger.log(
        `Successfully updated ${contentType} for project ${projectName}`,
      );
      return `Updated ${contentType} content for project: ${projectName}`;
    } catch (error) {
      this.logger.error(
        `Failed to update ${contentType} content: ${error.message}`,
      );
      throw new Error(`Content update failed for ${contentType}`);
    }
  }
}
