import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { InternalServicesJWTService } from './internalServicesJWT.service';
import { InternalServicesJWTController } from './controller/internalServicesJWT.controller';

@Module({
  imports: [ConfigModule, JwtModule.register({})],
  controllers: [InternalServicesJWTController],
  providers: [InternalServicesJWTService],
  exports: [InternalServicesJWTService],
})
export class InternalJWTModule {}
