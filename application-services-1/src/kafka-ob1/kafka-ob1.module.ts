import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { KafkaOb1Controller } from './kafka-ob1.controller';
import { KafkaOb1ProcessingService } from './services/kafka-ob1-processing/kafka-ob1-processing.service';
import { CrudOperationsService } from './services/kafka-ob1-processing/crud-operations.service';
import { PageSubmittedService } from './services/kafka-ob1-processing/page-submitted.service';
import { CleanTranscriptService } from './services/kafka-ob1-processing/clean-transcript.service';
import { GetParticipantsService } from './services/kafka-ob1-processing/get-participants.service';
import { AgentServiceRequest } from './services/kafka-ob1-processing/agent-service-request.service';
import { KafkaOb1Service } from './kafka-ob1.service';
import { SowGenerationService } from './services/kafka-ob1-processing/content/sow-generation.service';
import { ContentAssetsService } from './services/kafka-ob1-processing/content-assets.service';
import { ContentService } from './services/kafka-ob1-processing/content/content.service';
import { GoogleDocService } from './services/google/google-doc.service';
import { GoogleSheetService } from './services/google/google-sheet.service';
import { FormJsonService } from './services/kafka-ob1-processing/content/form-json.service';
import { EmailGenerationService } from './services/kafka-ob1-processing/content/email-generation.service';
import { ProjectPlannerService } from './services/kafka-ob1-processing/content/project-planner.service';
import { CreateProjectPlanService } from './services/kafka-ob1-processing/create-project-plan.service';
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
  providers: [
    KafkaOb1ProcessingService,
    CrudOperationsService,
    PageSubmittedService,
    CleanTranscriptService,
    GetParticipantsService,
    AgentServiceRequest,
    KafkaOb1Service,
    SowGenerationService,
    ContentAssetsService,
    ContentService,
    GoogleDocService,
    GoogleSheetService,
    FormJsonService,
    EmailGenerationService,
    ProjectPlannerService,
    CreateProjectPlanService,
  ],
  controllers: [KafkaOb1Controller],
})
export class KafkaOb1Module {}
