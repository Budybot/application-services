import { Injectable, Logger } from '@nestjs/common';
import { CrudOperationsService } from './crud-operations.service';
import { ContentService } from './content/content.service';
import { SowUpdateService } from './content/sow-update.service';

@Injectable()
export class CreateProjectPlanService {
  private readonly logger = new Logger(CreateProjectPlanService.name);

  constructor(
    private readonly crudOperationsService: CrudOperationsService,
    private readonly contentService: ContentService,
    private readonly sowUpdateService: SowUpdateService,
  ) {}

  async createProjectPlan(
    projectName: string,
    instanceName: string,
    userEmail: string,
  ): Promise<string> {
    const tableEntity = 'OB1-pages-filterPage1';

    try {
      // Step 1: Fetch data from Postgres
      this.logger.log(
        `Fetching data from ${tableEntity} for project ${projectName}`,
      );
      const fetchDataResponse = await this.crudOperationsService.fetchData(
        tableEntity,
        projectName,
        instanceName,
        userEmail,
      );

      if (!fetchDataResponse || !fetchDataResponse.messageContent) {
        this.logger.error('No data fetched or invalid data format received.');
        throw new Error('No data fetched or invalid data format');
      }

      const plannerData = fetchDataResponse.messageContent[0];

      // Step 2: Generate Project Planner by calling generateContent from ContentService
      this.logger.log(
        `Calling ContentService to generate Project Planner for project ${projectName}`,
      );
      const sheetId = await this.contentService.generateContent(
        projectName,
        instanceName,
        { sowData: plannerData, pageName: tableEntity },
        userEmail,
        'ProjectPlanner',
      );

      // Step 3: Update the SOW with planner data
      await this.updateSowWithPlanner(
        projectName,
        instanceName,
        userEmail,
        sheetId,
      );

      this.logger.log(`Project Planner sheet created with ID: ${sheetId}`);
      return sheetId;
    } catch (error) {
      this.logger.error(
        `Error creating project plan for project ${projectName}: ${error.message}`,
      );
      throw new Error('Failed to create project plan');
    }
  }
  private async updateSowWithPlanner(
    projectName: string,
    instanceName: string,
    userEmail: string,
    plannerSheetId: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Fetching latest SOW asset ID for project ${projectName}`,
      );
      const sowAssetExternalId = await this.getLatestSowAssetId(
        projectName,
        instanceName,
        userEmail,
      );

      if (!sowAssetExternalId) {
        this.logger.warn(
          `No SOW asset found for project ${projectName}. Skipping SOW update.`,
        );
        return;
      }

      this.logger.log(
        `Updating SOW with planner data for project ${projectName}`,
      );
      await this.sowUpdateService.updateSowWithPlanner(
        projectName,
        sowAssetExternalId,
        plannerSheetId,
        // instanceName,
        userEmail,
      );

      this.logger.log(`Successfully updated SOW for project ${projectName}`);
    } catch (error) {
      this.logger.error(
        `Error updating SOW for project ${projectName}: ${error.message}`,
      );
      throw new Error('Failed to update SOW with project planner data');
    }
  }

  // Helper function to fetch the latest SOW assetExternalId for a project
  private async getLatestSowAssetId(
    projectName: string,
    instanceName: string,
    userEmail: string,
  ): Promise<string | null> {
    const tableEntity = 'OB1-assets';
    const fetchDataResponse = await this.crudOperationsService.fetchData(
      tableEntity,
      projectName,
      instanceName,
      userEmail,
    );

    if (!fetchDataResponse || !fetchDataResponse.messageContent) {
      this.logger.error('No assets fetched or invalid data format received.');
      return null;
    }

    // Filter results to find the latest SOW asset
    const sowAssets = fetchDataResponse.messageContent
      .filter((asset) => asset.assetName === 'SOW')
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

    return sowAssets.length > 0 ? sowAssets[0].assetExternalId : null;
  }
}
