// src/kafka-ob1/services/kafka-ob1-processing/crud-operations.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class CrudOperationsService {
  private readonly logger = new Logger(CrudOperationsService.name);

  constructor(private readonly httpService: HttpService) {}

  async fetchData(
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
      this.logger.log(
        `Fetched data from table ${tableEntity} for project ${projectName}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Error fetching data: ${error.message}`);
      throw new Error('Failed to fetch data');
    }
  }

  async postData(
    tableEntity: string,
    projectName: string,
    data: any,
    instanceName: string,
  ): Promise<any> {
    const baseUrl =
      process.env.ENV === 'PROD'
        ? 'https://os.budy.bot'
        : 'https://app.budy.bot';
    const url = `${baseUrl}/services/kafka/ob1-v2/send-request/${instanceName}`;
    const requestBody = {
      destinationService: 'postgres-write-read-service',
      sourceFunction: 'fetchPage',
      sourceType: 'user',
      messageInput: {
        messageContent: {
          functionName: 'CRUDUserfunction',
          functionInput: {
            CRUDName: 'POST',
            CRUDInput: {
              tableEntity,
              projectName,
              data,
            },
          },
        },
      },
    };

    try {
      const response = await lastValueFrom(
        this.httpService.post(url, requestBody),
      );
      this.logger.log(
        `Posted data to table ${tableEntity} for project ${projectName}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(`Error posting data: ${error.message}`);
      throw new Error('Failed to post data');
    }
  }
}
