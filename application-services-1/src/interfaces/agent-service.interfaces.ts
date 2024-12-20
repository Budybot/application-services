// logger.log('Validation setup complete for Agent Service interfaces');
import { Logger } from '@nestjs/common';

const logger = new Logger('AgentServiceValidator');

// LLM Config DTO
export interface LLMConfigDto {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

// Request DTO for executing a prompt
export interface ExecutePromptRequestDto {
  promptId: string;
  userPrompt?: string;
  systemPromptVariables?: { [key: string]: any };
  userPromptVariables?: { [key: string]: any };
  llmConfig?: LLMConfigDto;
}

// Validate LLMConfigDto
export function validateLLMConfig(config: LLMConfigDto): void {
  const requiredFields = ['provider', 'model'];
  requiredFields.forEach((field) => {
    if (!config[field]) {
      logger.error(`Missing required field in LLMConfig: ${field}`);
      throw new Error(`LLMConfig validation failed: Missing field ${field}`);
    }
  });
}

// Validate ExecutePromptRequestDto
export function validateExecutePromptRequestBody(
  requestBody: ExecutePromptRequestDto,
): void {
  const requiredFields = ['promptId'];
  requiredFields.forEach((field) => {
    if (!requestBody[field]) {
      logger.error(
        `Missing required field in ExecutePromptRequestDto: ${field}`,
      );
      throw new Error(
        `ExecutePromptRequestDto validation failed: Missing field ${field}`,
      );
    }
  });

  // Validate LLMConfig if provided
  if (requestBody.llmConfig) {
    validateLLMConfig(requestBody.llmConfig);
  }
}


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