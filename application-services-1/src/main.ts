import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'debug', 'error', 'warn', 'verbose'], // Adjust based on LOG_LEVEL
  });
  const SERVICE_NAME = process.env.SERVICE_NAME;

  // Kafka microservice options
  const kafkaMicroserviceOptions: MicroserviceOptions = {
    transport: Transport.KAFKA,
    options: {
      client: {
        brokers: ['kafka-server-1.orangebox-uswest-2.local:9092'], // Kafka broker address
        // connectionTimeout: 3000,
        // requestTimeout: 60000,
      },
      consumer: {
        groupId: `${SERVICE_NAME}-group`, // Consumer group ID
        // sessionTimeout: 15000,
        // heartbeatInterval: 5000,
        // maxWaitTimeInMs: 10000,
        // rebalanceTimeout: 90000,
      },
      producer: {
        allowAutoTopicCreation: false, // Optional: Prevents auto-creation of topics if they don't exist
        // transactionTimeout: 120000,
      },
    },
  };

  // Connect Kafka microservice
  app.connectMicroservice(kafkaMicroserviceOptions);

  // Start all microservices (including Kafka)
  await app.startAllMicroservices();

  // Start the HTTP server
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
