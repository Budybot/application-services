import { Injectable, Logger } from '@nestjs/common';
import { KafkaOb1Service } from 'src/kafka-ob1/kafka-ob1.service';
import {
  OB1Global, CURRENT_SCHEMA_VERSION,
} from 'src/interfaces/ob1-message.interfaces';
@Injectable()
export class CrudOperationsService {
  private readonly logger = new Logger(CrudOperationsService.name);

  constructor(private readonly kafkaOb1Service: KafkaOb1Service) {}

  async fetchData(
    tableEntity: string,
    projectName: string,
    userOrgId: string,
    personId: string,
  ): Promise<any> {
    const messageInput = {
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
      messageType: 'REQUEST',
    };

    try {
      const headers: OB1Global.MessageHeaderV2 = {
        sourceService: process.env.SERVICE_NAME || 'unknown-service',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        sourceFunction: 'fetchData',
        sourceType: 'service',
        destinationService: 'database-service',
        requestId: `REQ-fetchData-${Date.now()}`,
        personId: personId,
        userOrgId: userOrgId,
      };
      const response = await this.kafkaOb1Service.sendRequest(
        messageInput,
        headers,
        'budyos-ob1-databaseService',
      );
      this.logger.log(
        `Fetched data from table ${tableEntity} for project ${projectName}`,
      );
      return response.messageContent;
    } catch (error) {
      this.logger.error(`Error fetching data: ${error.message}`);
      throw new Error('Failed to fetch data');
    }
  }
  async postData(
    tableEntity: string,
    projectName: string,
    data: any,
    userOrgId: string,
    personId: string,
  ): Promise<any> {
    const messageInput = {
      messageContent: {
        functionName: 'CRUDUserfunction',
        functionInput: {
          CRUDName: 'POST',
          CRUDInput: {
            tableEntity,
            projectName,
            ...data,
          },
        },
      },
      messageType: 'REQUEST',
    };
    const headers: OB1Global.MessageHeaderV2 = {
      sourceService: process.env.SERVICE_NAME || 'unknown-service',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      sourceFunction: 'fetchData',
      sourceType: 'service',
      destinationService: 'database-service',
      requestId: `REQ-fetchData-${Date.now()}`,
      personId: personId,
      userOrgId: userOrgId,
    };

    try {
      const response = await this.kafkaOb1Service.sendRequest(
        messageInput,
        headers,
        'budyos-ob1-databaseService',
      );
      this.logger.log(
        `Posted data to table ${tableEntity} for project ${projectName}`,
      );
      return response;
    } catch (error) {
      this.logger.error(`Error posting data: ${error.message}`);
      throw new Error('Failed to post data');
    }
  }
}
