import { Module } from '@nestjs/common';
import { KafkaOb1Module } from './kafka-ob1/kafka-ob1.module';
import { ConfigModule } from '@nestjs/config';
import { AppHealthV1Controller } from './appHealthV1.controller';
import { InternalJWTModule } from './auth/internal-services-jwt/internalServicesJWT.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // This will make .env configurations accessible throughout the app
    }),
    KafkaOb1Module,
    InternalJWTModule,
  ],
  controllers: [AppHealthV1Controller],
  providers: [],
})
export class AppModule {}
