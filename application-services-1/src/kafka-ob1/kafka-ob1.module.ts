import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KafkaOb1Controller } from './kafka-ob1.controller';
import { KafkaOb1ProcessingService } from './services/kafka-ob1-processing/kafka-ob1-processing.service';
import { CrudOperationsService } from './services/kafka-ob1-processing/crud-operations.service';

@Module({
  imports: [
    HttpModule,
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
  providers: [KafkaOb1ProcessingService, CrudOperationsService],
  controllers: [KafkaOb1Controller],
})
export class KafkaOb1Module {}
