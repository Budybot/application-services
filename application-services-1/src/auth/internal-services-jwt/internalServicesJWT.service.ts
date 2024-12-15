import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InternalServicesJWTPayload } from './interfaces/InternalServicesJWTPayload.interfaces';
import { INTERNAL_JWT_EXPIRATION } from './internalServicesJWT.constants';

@Injectable()
export class InternalServicesJWTService {
  private readonly secret: string;
  private readonly logger = new Logger(InternalServicesJWTService.name);

  constructor(private readonly jwtService: JwtService) {
    this.secret = process.env.INTERNAL_JWT_SECRET || '';
    if (!this.secret) {
      throw new Error(
        'INTERNAL_JWT_SECRET is not set in environment variables',
      );
    }
  }

  generateToken(
    tokenRequest: Omit<InternalServicesJWTPayload, 'iat' | 'exp'>,
  ): string {
    if (
      !Array.isArray(tokenRequest.allowedParentRoutes) ||
      tokenRequest.allowedParentRoutes.length === 0
    ) {
      throw new Error('Payload must include at least one allowed route');
    }

    const tokenPayload = {
      ...tokenRequest,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + INTERNAL_JWT_EXPIRATION,
    };
    this.logger.debug(
      `Generating token for payload: ${JSON.stringify(tokenPayload)}`,
    );
    return this.jwtService.sign(tokenPayload, { secret: this.secret });
  }
}
