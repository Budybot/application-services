import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';

@Injectable()
export class GoogleDocMonitoringService {
  private readonly logger = new Logger(GoogleDocMonitoringService.name);
  private oAuth2Client: any;
  private pollingInterval: NodeJS.Timeout | null = null;

  constructor() {
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

      // Set token credentials (including access_token and refresh_token)
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
    pollingIntervalSeconds: number = 60,
  ) {
    this.logger.log(`Starting to monitor Google Doc with ID: ${documentId}`);

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.pollingInterval = setInterval(
      () => this.checkForNewComments(documentId),
      pollingIntervalSeconds * 1000,
    );
  }

  async stopMonitoring() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      this.logger.log('Stopped monitoring Google Doc.');
    }
  }

  private async checkForNewComments(documentId: string) {
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

      if (comments.length) {
        comments.forEach((comment) => {
          this.logger.log(
            `New Comment by ${comment.author?.displayName}: ${comment.content}`,
          );
        });
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
