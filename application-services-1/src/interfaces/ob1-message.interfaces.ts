// src/interfaces/ob1-message.interfaces.ts

import { Logger } from '@nestjs/common';
import { KafkaContext } from '@nestjs/microservices';

// Define current and compatible schema versions
export const CURRENT_SCHEMA_VERSION = '0.1.5';
export const MIN_COMPATIBLE_SCHEMA_VERSION = '0.1.1';
export const MAX_COMPATIBLE_SCHEMA_VERSION = '0.1.5';

// Instantiate the NestJS Logger
const logger = new Logger('OB1MessageValidator');

// Interface for OB1MessageValue
export interface OB1MessageValue {
  //compulsory fields
  messageContent: { [key: string]: any };
  messageType: string;

  //optional but defined in other tables
  projectId?: string;
  assetId?: string;
  conversationId?: string;

  //optional but not defined in other tables
  error?: boolean;
  errorCode?: number;
  errorMessage?: string;
  responseMessage?: string;
  messageStatus?: string;
}

// class for OB1MessageValue
export class OB1MessageValueClass {
  //compulsory fields
  messageContent: { [key: string]: any };
  messageType: string;

  //optional but defined in other tables
  projectId?: string;
  assetId?: string;
  conversationId?: string;

  //optional but not defined in other tables
  error?: boolean;
  errorCode?: number;
  errorMessage?: string;
  responseMessage?: string;
  messageStatus?: string;
}

// Interface for OB1MessageHeader
export interface OB1MessageHeader {
  //compulsory fields

  sourceService: string;
  schemaVersion: string;

  //compulsory but to be depricated soon
  instanceName?: string;
  userEmail?: string;

  //optional but defined in other tables
  destinationService?: string;
  requestId?: string;
  responseId?: string;
  kafka_correlationId?: string;

  //optional but not defined in other tables
  sourceFunction?: string;
  sourceType?: string;
  kafka_replyPartition?: number;
  kafka_replyTopic?: string;

  //future use
  sourceServiceId?: string;

  //optional but to be depricated soon
  userRole?: string;
  instanceId?: string;
  userId?: string;
}

export class OB1MessageHeaderClass {
  //compulsory fields

  sourceService: string;
  schemaVersion: string;

  //new optional but soon to become compulsory fields
  personId?: string;
  userOrgId?: string;

  //compulsory but to be depricated soon
  instanceName?: string;
  userEmail?: string;

  //optional but defined in other tables
  destinationService?: string;
  requestId?: string;
  responseId?: string;
  kafka_correlationId?: string;

  //optional but not defined in other tables
  sourceFunction?: string;
  sourceType?: string;
  kafka_replyPartition?: number;
  kafka_replyTopic?: string;
  //future use
  sourceServiceId?: string;

  //new optional fields
  personRole?: string;
  consultantOrgID?: string;

  //optional but to be depricated soon
  userRole?: string;
  instanceId?: string;
  userId?: string;
}

// Optional Interface for messageContent
export interface OB1messageContent {
  //compulsory fields

  //optional
  content?: string;
  notificationType?: string;
  userState?: number;
  functionName?: string;
  functionInput?: { [key: string]: any };
  CRUDName?: string;
  CRUDInput?: { [key: string]: any };
}

export class OB1messageContentClass {
  //compulsory fields

  //optional
  content?: string;
  notificationType?: string;
  userState?: number;
  functionName?: string;
  functionInput?: { [key: string]: any };
  CRUDName?: string;
  CRUDInput?: { [key: string]: any };
}

// Function to validate schema version
export function validateSchemaVersion(header: OB1MessageHeader): void {
  const incomingVersion = header.schemaVersion;

  if (incomingVersion === CURRENT_SCHEMA_VERSION) {
    // Version is up-to-date and compatible
    return;
  }

  if (
    incomingVersion >= MIN_COMPATIBLE_SCHEMA_VERSION &&
    incomingVersion <= MAX_COMPATIBLE_SCHEMA_VERSION
  ) {
    // Version is compatible but not current
    logger.warn(
      `Schema version mismatch: Expected ${CURRENT_SCHEMA_VERSION}, received ${incomingVersion}. ` +
        `Proceeding with backward-compatible version.`,
    );
    return;
  }

  // Version is outside the compatible range
  logger.error(
    `Unsupported schema version: ${incomingVersion}. ` +
      `Compatible versions are between ${MIN_COMPATIBLE_SCHEMA_VERSION} and ${MAX_COMPATIBLE_SCHEMA_VERSION}.`,
  );
  throw new Error(`Invalid schema version: ${incomingVersion}`);
}

// Function to validate compulsory fields in both header and message body, using KafkaContext
export function validateMessageFields(context: KafkaContext): void {
  const message = context.getMessage();

  // Type-cast headers to OB1MessageHeader after converting to 'unknown' first to satisfy TypeScript
  const headers = message.headers as unknown as OB1MessageHeader;

  // Check if message value is a Buffer; if not, assume it's already an object
  let messageValue: OB1MessageValue;
  if (Buffer.isBuffer(message.value)) {
    // Parse message value from Buffer to OB1MessageValue
    messageValue = JSON.parse(message.value.toString()) as OB1MessageValue;
  } else {
    // Directly assign if already an object
    messageValue = message.value as OB1MessageValue;
  }

  // Validate schema version first
  validateSchemaVersion(headers);

  // Define compulsory fields
  const compulsoryHeaderFields = ['sourceService', 'schemaVersion'];
  const compulsoryMessageFields = ['messageContent', 'messageType'];

  // Check compulsory fields in header
  compulsoryHeaderFields.forEach((field) => {
    if (!headers[field]) {
      logger.error(`Missing or null compulsory field in header: ${field}`);
      throw new Error(
        `Invalid message: Missing or null compulsory field in header: ${field}`,
      );
    }
  });

  // Check compulsory fields in message body
  compulsoryMessageFields.forEach((field) => {
    if (!messageValue[field]) {
      logger.error(
        `Missing or null compulsory field in message value: ${field}`,
      );
      throw new Error(
        `Invalid message: Missing or null compulsory field in message value: ${field}`,
      );
    }
  });

  logger.log('Message validation completed successfully');
}
