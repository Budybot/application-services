import { IsString, IsArray, IsNotEmpty, ArrayNotEmpty } from 'class-validator';

export class TokenRequestDto {
  @IsArray()
  @ArrayNotEmpty()
  requestedParentRoutes: string[];

  @IsString()
  @IsNotEmpty()
  requestingService: string;

  @IsString()
  @IsNotEmpty()
  requestId: string;
}

export class GenerateTokenRequestDto {
  @IsString()
  @IsNotEmpty()
  apiKey: string;

  @IsNotEmpty()
  tokenRequest: TokenRequestDto;
}