import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class FetchDataService {
  private readonly logger = new Logger(FetchDataService.name);

  constructor(private readonly httpService: HttpService) {}

  async fetchDataFromPage(
    tableEntity: string,
    projectName: string,
    instanceName: string,
  ): Promise<any> {
    const url = `services/kafka/ob1-v2/send-request/${instanceName}`;
    const requestBody = {
      destinationService: 'postgres-write-read-service',
      sourceFunction: 'fetchPage',
      sourceType: 'user',
      messageInput: {
        messageContent: {
          functionName: 'CRUDUserfunction',
          functionInput: {
            CRUDName: 'GET',
            CRUDInput: {
              tableEntity,
              projectName,
            },
          },
        },
      },
    };

    try {
      const response = await lastValueFrom(
        this.httpService.post(url, requestBody),
      );
      this.logger.log(`Fetched data from table ${tableEntity} for project ${projectName}`);
      return response.data; // Ensure TypeScript knows the structure of the response
    } catch (error) {
      this.logger.error(`Error fetching data from page: ${error.message}`);
      throw new Error('Failed to fetch data');
    }
  }
}
