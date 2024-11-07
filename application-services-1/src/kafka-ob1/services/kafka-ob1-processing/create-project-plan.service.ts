import { Injectable, Logger } from '@nestjs/common';
import { CrudOperationsService } from './crud-operations.service';
import { ProjectPlannerService } from './content/project-planner.service';
import { GoogleSheetService } from '../google/google-sheet.service';

@Injectable()
export class CreateProjectPlanService {
  private readonly logger = new Logger(CreateProjectPlanService.name);

  constructor(
    private readonly crudOperationsService: CrudOperationsService,
    private readonly projectPlannerService: ProjectPlannerService,
    private readonly googleSheetService: GoogleSheetService,
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

      // Step 2: Generate project plan CSV data
      this.logger.log('Generating project plan in string[][] format...');
      const projectPlanData =
        await this.projectPlannerService.generateProjectPlan(
          instanceName,
          userEmail,
          plannerData,
        );
      // Step 3: Parse CSV data to 2D array
      const folderId =
        await this.googleSheetService.createGoogleDriveFolder(projectName);
      const sheetId = await this.googleSheetService.createGoogleSheet(
        `Project Plan for ${projectName}`,
        folderId,
        userEmail,
      );

      await this.googleSheetService.writeToSheet(sheetId, projectPlanData);

      this.logger.log(`Project Plan sheet created with ID: ${sheetId}`);
      return sheetId;
    } catch (error) {
      this.logger.error(
        `Error creating project plan for project ${projectName}: ${error.message}`,
      );
      throw new Error('Failed to create project plan');
    }
  }
}
