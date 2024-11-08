import { Injectable, Logger } from '@nestjs/common';
import { CrudOperationsService } from '../crud-operations.service';

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
  async getAssetId(
    contentType: string,
    projectName: string,
    instanceName: string,
    userEmail: string,
  ): Promise<string | null> {
    const tableEntity = 'OB1-assets';

    // Fetch data from the specified table
    const fetchDataResponse = await this.crudOperationsService.fetchData(
      tableEntity,
      projectName,
      instanceName,
      userEmail,
    );

    // Validate fetch response
    if (!fetchDataResponse || !fetchDataResponse.messageContent) {
      this.logger.error('No assets fetched or invalid data format received.');
      return null;
    }

    // Filter results to find the latest asset for the specified contentType
    const filteredAssets = fetchDataResponse.messageContent
      .filter((asset) => asset.assetName === contentType)
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

    // Return the latest asset’s external ID if found
    const latestAssetId =
      filteredAssets.length > 0 ? filteredAssets[0].assetExternalId : null;

    if (latestAssetId) {
      this.logger.log(
        `Fetched latest asset ID for ${contentType}: ${latestAssetId}`,
      );
    } else {
      this.logger.warn(
        `No asset found for ${contentType} in project ${projectName}`,
      );
    }

    return latestAssetId;
  }
}
