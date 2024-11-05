import { Injectable, Logger } from '@nestjs/common';
// import { HttpService } from '@nestjs/axios';
// import { lastValueFrom } from 'rxjs';
import { KafkaOb1Service } from 'src/kafka-ob1/kafka-ob1.service';
@Injectable()
export class CrudOperationsService {
  private readonly logger = new Logger(CrudOperationsService.name);

  // constructor(private readonly httpService: HttpService) {}
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
    };

    try {
      const response = await this.kafkaOb1Service.sendRequest(
        messageKey, // Key for Kafka message
        instanceName,
        'database-service',
        'fetchPage',
        'user',
        messageInput,
        'system', // Example user role
        'system@budy.bot', // Example user email
        'budyos-ob1-databaseService', // Kafka topic
      );
      this.logger.log(
        `Fetched data from table ${tableEntity} for project ${projectName}`,
      );
      this.logger.debug(response);
      return response;
    } catch (error) {
      this.logger.error(`Error fetching data: ${error.message}`);
      throw new Error('Failed to fetch data');
    }
  //   const baseUrl =
  //     process.env.ENV === 'PROD'
  //       ? 'https://os.budy.bot'
  //       : 'https://app.budy.bot';
  //   const topic = 'budyos-ob1-databaseService';
  //   const url = `${baseUrl}/services/kafka/ob1-v2/send-request/${topic}/${instanceName}`;
  //   const requestBody = {
  //     destinationService: 'database-service',
  //     sourceFunction: 'fetchPage',
  //     sourceType: 'user',
  //     messageInput: {
  //       messageContent: {
  //         functionName: 'CRUDUserfunction',
  //         functionInput: {
  //           CRUDName: 'GET',
  //           CRUDInput: {
  //             tableEntity,
  //             projectName,
  //           },
  //         },
  //       },
  //     },
  //   };

  //   try {
  //     const response = await lastValueFrom(
  //       this.httpService.post(url, requestBody),
  //     );
  //     this.logger.log(
  //       `Fetched data from table ${tableEntity} for project ${projectName}`,
  //     );
  //     this.logger.debug(response.data);
  //     return response.data;
  //   } catch (error) {
  //     this.logger.error(`Error fetching data: ${error.message}`);
  //     throw new Error('Failed to fetch data');
  //   }
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
    };

    try {
      const response = await this.kafkaOb1Service.sendRequest(
        messageKey,
        instanceName,
        'database-service',
        'savePage',
        'user',
        messageInput,
        'system', // Example user role
        'system@budy.bot', // Example user email
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


  // async postData(
  //   tableEntity: string,
  //   projectName: string,
  //   data: any,
  //   instanceName: string,
  // ): Promise<any> {
  //   const baseUrl =
  //     process.env.ENV === 'PROD'
  //       ? 'https://os.budy.bot'
  //       : 'https://app.budy.bot';
  //   const topic = 'budyos-ob1-databaseService';
  //   const url = `${baseUrl}/services/kafka/ob1-v2/send-request/${topic}/${instanceName}`;
  //   const requestBody = {
  //     destinationService: 'database-service',
  //     sourceFunction: 'fetchPage',
  //     sourceType: 'user',
  //     messageInput: {
  //       messageContent: {
  //         functionName: 'CRUDUserfunction',
  //         functionInput: {
  //           CRUDName: 'POST',
  //           CRUDInput: {
  //             tableEntity,
  //             projectName,
  //             ...data,
  //           },
  //         },
  //       },
  //     },
  //   };
  //   this.logger.debug(requestBody);

  //   try {
  //     const response = await lastValueFrom(
  //       this.httpService.post(url, requestBody),
  //     );
  //     this.logger.log(
  //       `Posted data to table ${tableEntity} for project ${projectName}`,
  //     );
  //     return response.data;
  //   } catch (error) {
  //     this.logger.error(`Error posting data: ${error.message}`);
  //     throw new Error('Failed to post data');
  //   }
  // }
}
