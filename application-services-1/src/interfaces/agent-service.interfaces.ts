// src/interfaces/agent-service.interfaces.ts
import { Logger } from '@nestjs/common';

// Instantiate the NestJS Logger
const logger = new Logger('AgentServiceValidator');

// Interface for LLMConfig
export interface LLMConfig {
  provider: string;
  model: string;
  temperature: number;
  maxTokens: number;
  frequencyPenalty: number;
  presencePenalty: number;
}

// Interface for AgentServiceRequestBody
export interface AgentServiceRequestBody {
  systemPrompt: string;
  userPrompt: string;
  config: LLMConfig;
}

// Function to validate required fields in LLMConfig
export function validateLLMConfig(config: LLMConfig): void {
  const requiredFields = [
    'provider',
    'model',
    'temperature',
    'maxTokens',
    'frequencyPenalty',
    'presencePenalty',
  ];
  requiredFields.forEach((field) => {
    if (config[field] === undefined || config[field] === null) {
      logger.error(`Missing required field in LLMConfig: ${field}`);
      throw new Error(`LLMConfig validation failed: Missing field ${field}`);
    }
  });
}

// Function to validate required fields in AgentServiceRequestBody
export function validateAgentServiceRequestBody(
  requestBody: AgentServiceRequestBody,
): void {
  const requiredFields = ['systemPrompt', 'userPrompt', 'config'];
  requiredFields.forEach((field) => {
    if (requestBody[field] === undefined || requestBody[field] === null) {
      logger.error(
        `Missing required field in AgentServiceRequestBody: ${field}`,
      );
      throw new Error(
        `AgentServiceRequestBody validation failed: Missing field ${field}`,
      );
    }
    // Validate the LLMConfig within AgentServiceRequestBody
    validateLLMConfig(requestBody.config);
  });
}

logger.log('Validation setup complete for Agent Service interfaces');
