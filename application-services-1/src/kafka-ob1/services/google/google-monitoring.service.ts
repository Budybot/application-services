import { Injectable, Logger, Inject } from '@nestjs/common';
import { google } from 'googleapis';
import { ClientKafka } from '@nestjs/microservices';
import {
  OB1MessageValue,
  OB1MessageHeader,
  CURRENT_SCHEMA_VERSION,
} from 'src/interfaces/ob1-message.interfaces';
@Injectable()
export class GoogleDocMonitoringService {
  private readonly logger = new Logger(GoogleDocMonitoringService.name);
  private oAuth2Client: any;
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private processedComments: Map<string, Set<string>> = new Map();

  constructor(
    @Inject('KAFKA_OB1_CLIENT') private readonly kafkaClient: ClientKafka,
  ) {
    this.initOAuthClientFromToken();
  }

  private initOAuthClientFromToken() {
    const tokenData = process.env.GOOGLE_TOKEN;

    if (!tokenData) {
      this.logger.error(
        'GOOGLE_TOKEN environment variable not set. OAuth client not initialized.',
      );
      throw new Error('Missing GOOGLE_TOKEN environment variable');
    }

    try {
      const credentials = JSON.parse(tokenData);

      const { client_id, client_secret, token_uri, refresh_token } =
        credentials;
      this.oAuth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        token_uri,
      );

      this.oAuth2Client.setCredentials({
        access_token: credentials.token,
        refresh_token: refresh_token,
        expiry_date: new Date(credentials.expiry).getTime(),
      });

      this.logger.log('OAuth2 client initialized with token from environment.');
    } catch (error) {
      this.logger.error('Failed to parse GOOGLE_TOKEN JSON', error);
      throw new Error('Failed to initialize OAuth client from GOOGLE_TOKEN');
    }
  }

  async startMonitoring(
    documentId: string,
    projectName: string,
    instanceName: string,
    userId: string,
    pollingIntervalSeconds: number = 60,
  ) {
    this.logger.log(`Starting to monitor Google Doc with ID: ${documentId}`);

    if (this.pollingIntervals.has(documentId)) {
      clearInterval(this.pollingIntervals.get(documentId)!);
    }

    this.pollingIntervals.set(
      documentId,
      setInterval(
        () =>
          this.checkForNewComments(
            documentId,
            projectName,
            instanceName,
            userId,
          ),
        pollingIntervalSeconds * 1000,
      ),
    );
  }

  async stopMonitoring(documentId: string) {
    if (this.pollingIntervals.has(documentId)) {
      clearInterval(this.pollingIntervals.get(documentId)!);
      this.pollingIntervals.delete(documentId);
      this.logger.log(`Stopped monitoring Google Doc with ID: ${documentId}`);
    }
  }

  private async checkForNewComments(
    documentId: string,
    projectName: string,
    instanceName: string,
    userId: string,
  ) {
    try {
      await this.refreshAccessTokenIfNeeded();
      const driveService = google.drive({
        version: 'v3',
        auth: this.oAuth2Client,
      });

      const response = await driveService.comments.list({
        fileId: documentId,
        fields: 'comments',
      });

      const comments = response.data.comments || [];
      const processedCommentIds =
        this.processedComments.get(documentId) || new Set();

      if (comments.length) {
        comments.forEach(async (comment) => {
          if (!processedCommentIds.has(comment.id!)) {
            this.logger.log(
              `New Comment by ${comment.author?.displayName}: ${comment.content}`,
            );
            processedCommentIds.add(comment.id!);
            const topic = 'budyos-ob1-applicationService';
            const messageValue: OB1MessageValue = {
              messageContent: comment,
              messageType: 'NOTIFICATION',
              projectId: projectName,
              assetId: null,
              conversationId: null,
            };
            const messageHeaders: OB1MessageHeader = {
              instanceName: instanceName,
              userEmail: userId,
              sourceService: process.env.SERVICE_NAME || 'unknown-service',
              schemaVersion: CURRENT_SCHEMA_VERSION,
              destinationService: 'application-service',
            };
            this.emitMessage(messageValue, messageHeaders, topic);
            // const response = await this.kafkaOb1Service.sendRequest(
            //   userId,
            //   instanceName,
            //   'application-service',
            //   'checkForNewComments',
            //   'system',
            //   messageInput,
            //   'system',
            //   userId,
            //   topic,
            // );
            // this.logger.debug(response);
          }
        });
        this.processedComments.set(documentId, processedCommentIds);
      } else {
        this.logger.log('No new comments found.');
      }
    } catch (error) {
      this.logger.error(`Failed to poll comments: ${error.message}`);
    }
  }

  private async refreshAccessTokenIfNeeded() {
    if (
      !this.oAuth2Client.credentials.access_token ||
      (this.oAuth2Client.credentials.expiry_date &&
        Date.now() >= this.oAuth2Client.credentials.expiry_date)
    ) {
      this.logger.log(
        'Access token is missing or expired. Attempting to refresh...',
      );
      await this.oAuth2Client.getAccessToken();
      this.logger.log('Token refreshed successfully');
    }
  }
  emitMessage(
    messageValue: OB1MessageValue,
    messageHeaders: OB1MessageHeader,
    topic: string,
  ): void {
    try {
      this.logger.log(
        `Emitting message to topic: ${topic}, with content: ${JSON.stringify(messageValue)}`,
      );
      // Emit the message to Kafka topic without awaiting a response
      this.kafkaClient
        .emit(topic, {
          value: messageValue,
          headers: messageHeaders,
        })
        .subscribe({
          error: (err) =>
            this.logger.error(
              `Failed to emit Kafka message: ${err.message}`,
              err.stack,
            ),
        });

      this.logger.log('Kafka message emitted successfully');
    } catch (error) {
      this.logger.error(
        `Failed to emit Kafka message: ${error.message}`,
        error.stack,
      );
    }
  }
}
