import { Module, Logger } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KafkaOb1Controller } from './kafka-ob1.controller';
import { KafkaOb1ProcessingService } from './services/kafka-ob1-processing/kafka-ob1-processing.service';
import { FetchDataService } from './services/kafka-ob1-processing/functions/fetchDataFromPage';

@Module({
  imports: [
    ConfigModule,
    ClientsModule.registerAsync([
      {
        name: 'KAFKA_OB1_CLIENT',
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: {
              clientId: `${configService.get<string>('SERVICE_ID')}-client`,
              brokers: ['kafka-server-1.orangebox-uswest-2.local:9092'],
            },
            consumer: {
              groupId: `${configService.get<string>('SERVICE_NAME')}-group`,
              allowAutoTopicCreation: false,
            },
          },
        }),
        inject: [ConfigService],
      },
    ]),

  ],
  providers: [
    KafkaOb1ProcessingService,

  ],
  controllers: [KafkaOb1Controller, FetchDataService],
})
export class KafkaOb1Module { }
