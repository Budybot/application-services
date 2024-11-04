import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export async function fetchDataFromPage(
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
    const httpService = new HttpService(); // You need to inject HttpService if you're using NestJS
    const response = await lastValueFrom(
      httpService.post(url, requestBody),
    );
    console.log(`Fetched data from table ${tableEntity} for project ${projectName}`);
    return (response as any).data;
  } catch (error) {
    console.error(`Error fetching data from page: ${error.message}`);
    throw new Error('Failed to fetch data');
  }
}
