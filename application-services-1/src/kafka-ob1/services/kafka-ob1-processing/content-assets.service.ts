import { Injectable, Logger } from '@nestjs/common';
import { CrudOperationsService } from './crud-operations.service';

@Injectable()
export class ContentAssetsService {
  private readonly logger = new Logger(ContentAssetsService.name);

  constructor(private readonly crudOperationsService: CrudOperationsService) {}

  async saveDocumentAsset(
    assetName: string,
    assetType: string,
    assetExternalId: string,
    assetExternalUrl: string,
    assetDescription: string,
    projectName: string,
    instanceName: string,
    userEmail: string,
  ): Promise<void> {
    try {
      await this.crudOperationsService.postData(
        'OB1-assets',
        projectName,
        {
          assetName,
          assetType,
          assetExternalId,
          assetExternalUrl,
          assetDescription,
        },
        instanceName,
        userEmail,
      );
      this.logger.log(`Saved asset ${assetName} for project ${projectName}`);
    } catch (error) {
      this.logger.error(`Failed to save asset: ${error.message}`);
      throw new Error('Failed to save document asset');
    }
  }
}
