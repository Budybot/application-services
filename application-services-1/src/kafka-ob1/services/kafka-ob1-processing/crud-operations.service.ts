import { Injectable, Logger } from '@nestjs/common';
import { KafkaOb1Service } from 'src/kafka-ob1/kafka-ob1.service';
@Injectable()
export class CrudOperationsService {
  private readonly logger = new Logger(CrudOperationsService.name);

  constructor(private readonly kafkaOb1Service: KafkaOb1Service) {}

  async fetchData(
    tableEntity: string,
    projectName: string,
    instanceName: string,
    messageKey: string,
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
      const response = await this.kafkaOb1Service.sendRequest(
        messageKey, // Key for Kafka message
        instanceName,
        'database-service',
        'fetchData',
        'user',
        messageInput,
        'consultant',
        messageKey,
        'budyos-ob1-databaseService', // Kafka topic
      );
      this.logger.log(
        `Fetched data from table ${tableEntity} for project ${projectName}`,
      );
      // this.logger.debug(response);
      return response;
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
    messageKey: string,
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

    try {
      const response = await this.kafkaOb1Service.sendRequest(
        messageKey,
        instanceName,
        'database-service',
        'savePage',
        'user',
        messageInput,
        'consultant',
        messageKey,
        'budyos-ob1-databaseService', // Kafka topic
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
