import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { KafkaOb1Service } from 'src/kafka-ob1/kafka-ob1.service';
@Injectable()
export class GoogleDocMonitoringService {
  private readonly logger = new Logger(GoogleDocMonitoringService.name);
  private oAuth2Client: any;
  private pollingIntervals: Map<string, NodeJS.Timeout> = new Map();
  private processedComments: Map<string, Set<string>> = new Map();

  constructor(private readonly kafkaOb1Service: KafkaOb1Service) {
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
        () => this.checkForNewComments(documentId, instanceName, userId),
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
            // SEND KAFKA MESSAGE HERE
            const messageInput = {
              messageContent: {
                functionName: 'processComment',
                functionInput: {
                  commentContent: comment.content,
                  commentAuthor: comment.author?.displayName,
                },
              },
              messageType: 'NOTIFICATION',
            };
            const topic = 'budyos-ob1-applicationServices';
            const response = await this.kafkaOb1Service.sendRequest(
              userId,
              instanceName,
              'application-services',
              'checkForNewComments',
              'system',
              messageInput,
              'system',
              userId,
              topic,
            );
            this.logger.debug(response);
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
}
