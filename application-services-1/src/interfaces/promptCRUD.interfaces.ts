import {
  IsString,
  IsObject,
  IsOptional,
  IsEnum,
  ValidateNested,
  IsArray,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
// import { promptTracing, RequestMetadata } from 'src/llms/interfaces/llmV2.interfaces';

export const CRUDOperationName = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
} as const;

export type CRUDOperationNameType =
  (typeof CRUDOperationName)[keyof typeof CRUDOperationName];

export const CRUDRoute = {
  LIST_PROMPTS: 'prompts',
  GET_PROMPT: 'prompts/:promptId',
  CREATE_PROMPT: 'prompts',
  UPDATE_PROMPT: 'prompts/:promptId',
  EXECUTE_WITH_USER_PROMPT: 'prompts/:promptId/executeWithUserPrompt',
  EXECUTE_WITHOUT_USER_PROMPT: 'prompts/:promptId/executeWithoutUserPrompt',
  GET_EXECUTION_LOGS: 'prompts/:promptId/logs',
} as const;

export type CRUDRouteType = (typeof CRUDRoute)[keyof typeof CRUDRoute];

export class CRUDRouteParams {
  @IsOptional()
  @IsString()
  promptId?: string;
}

export class CRUDFunctionInput {
  @IsString()
  @IsEnum(CRUDOperationName)
  CRUDOperationName: CRUDOperationNameType;

  @IsString()
  @IsEnum(CRUDRoute)
  CRUDRoute: CRUDRouteType;

  @IsOptional()
  @IsObject()
  CRUDBody?: any;

  @IsOptional()
  @ValidateNested()
  @Type(() => CRUDRouteParams)
  routeParams?: CRUDRouteParams;

  @IsOptional()
  @IsObject()
  queryParams?: Record<string, any>;

//   @Type(() => promptTracing)
//   tracing?: promptTracing;

//   @Type(() => RequestMetadata)
//   requestMetadata?: RequestMetadata;
}

// export class CRUDFunctionInputExtended extends CRUDFunctionInput {
//   @Type(() => promptTracing)
//   tracing: promptTracing;

//   @Type(() => RequestMetadata)
//   requestMetadata?: RequestMetadata;
// }
