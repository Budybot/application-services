import {
  Body,
  Controller,
  Logger,
  Post,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalServicesJWTService } from '../internalServicesJWT.service';
import { GenerateTokenRequestDto } from '../interfaces/generateTokenRequest.dto';

@Controller('auth/internalServices')
export class InternalServicesJWTController {
  private readonly apiKey: string;
  private readonly logger = new Logger(InternalServicesJWTController.name);

  constructor(
    private readonly jwtService: InternalServicesJWTService,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('INTERNAL_API_KEY') || '';
    if (!this.apiKey) {
      throw new Error(
        'INTERNAL_API_KEY is not set in the environment variables',
      );
    }
  }

  @Post('generateJWTToken')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  generateToken(@Body() body: GenerateTokenRequestDto) {
    const { apiKey, tokenRequest } = body;

    // Validate API key
    if (apiKey !== this.apiKey) {
      this.logger.warn('Invalid API key');
      throw new UnauthorizedException('Invalid API key');
    }
    const payload = {
      allowedParentRoutes: tokenRequest.requestedParentRoutes,
      requestedService: tokenRequest.requestingService,
      requestId: tokenRequest.requestId,
    };

    this.logger.debug('Generating JWT token', payload);
    // Generate JWT
    return { token: this.jwtService.generateToken(payload) };
  }
}
