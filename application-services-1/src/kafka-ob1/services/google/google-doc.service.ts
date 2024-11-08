import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';

@Injectable()
export class GoogleDocService {
  private readonly logger = new Logger(GoogleDocService.name);
  private oAuth2Client: any;

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

      const { client_id, client_secret, token_uri, refresh_token } = credentials;
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

  getAuthorizationUrl(): string {
    if (!this.oAuth2Client) {
      throw new Error('OAuth client not initialized');
    }
    return this.oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/drive',
      ],
    });
  }
  async handleOAuthCallback(code: string) {
    if (!this.oAuth2Client) {
      throw new Error('OAuth client not initialized');
    }
    const { tokens } = await this.oAuth2Client.getToken(code);
    this.oAuth2Client.setCredentials(tokens);
    // Optional: Log or store token securely
    this.logger.log('OAuth token received and set');
  }

  async createGoogleDriveFolder(
    folderName: string,
    parentFolderId?: string,
  ): Promise<string> {
    try {
      // this.logger.log(
      //   `Current OAuth2 Credentials: ${JSON.stringify(this.oAuth2Client.credentials)}`,
      // );

      // Check if the access token is expired or missing, and refresh if needed
      if (
        !this.oAuth2Client.credentials.access_token ||
        (this.oAuth2Client.credentials.expiry_date &&
          Date.now() >= this.oAuth2Client.credentials.expiry_date)
      ) {
        this.logger.log(
          'Access token is missing or expired. Attempting to refresh...',
        );
        await this.oAuth2Client.getAccessToken(); // Refreshes the token if expired
        this.logger.log('Token refreshed successfully');
      }
      const driveService = google.drive({
        version: 'v3',
        auth: this.oAuth2Client,
      });

      // Define the folder metadata
      const folderMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentFolderId && { parents: [parentFolderId] }), // Add parent folder if specified
      };

      // Log the request data before making the call
      // this.logger.debug(
      //   `Folder creation request data: ${JSON.stringify(folderMetadata)}`,
      // );

      // Create the folder in Google Drive
      const folder = await driveService.files.create({
        requestBody: folderMetadata,
        fields: 'id',
      });

      const folderId = folder.data.id;
      this.logger.log(
        `Created Google Drive folder '${folderName}' with ID: ${folderId}`,
      );
      return folderId;
    } catch (error) {
      // this.logger.error(`Failed to create Google Drive folder: ${error}`);
      this.logger.error(
        `Failed to create Google Drive folder: ${error.message}`,
        error.response?.data || error,
      );
      throw new Error('Failed to create Google Drive folder');
    }
  }

  async createGoogleDoc(
    title: string,
    folderId?: string,
    shareWithEmail?: string,
    role: string = 'writer',
  ) {
    try {
      // const auth = await this.getCredentials();
      const docsService = google.docs({
        version: 'v1',
        auth: this.oAuth2Client,
      });
      const driveService = google.drive({
        version: 'v3',
        auth: this.oAuth2Client,
      });

      // Step 1: Create the Google Doc
      const document = await docsService.documents.create({
        requestBody: { title },
      });
      const documentId = document.data.documentId;
      this.logger.log(`Google Doc created with ID: ${documentId}`);

      // Step 2: Move the Document to a Folder (Optional)
      if (folderId) {
        const file = await driveService.files.get({
          fileId: documentId,
          fields: 'parents',
        });
        const previousParents = file.data.parents
          ? file.data.parents.join(',')
          : '';
        await driveService.files.update({
          fileId: documentId,
          addParents: folderId,
          removeParents: previousParents,
          fields: 'id, parents',
        });
        this.logger.debug(`Document moved to folder ID: ${folderId}`);
      }

      // Step 3: Share the Document (Optional)
      if (shareWithEmail) {
        await driveService.permissions.create({
          fileId: documentId,
          requestBody: {
            type: 'user',
            role,
            emailAddress: shareWithEmail,
          },
          fields: 'id',
        });
        this.logger.log(`Document shared with ${shareWithEmail} as ${role}.`);
      }

      return documentId;
    } catch (error) {
      this.logger.error(
        `An error occurred while creating the document: ${error}`,
      );
      throw new Error('Failed to create Google Doc');
    }
  }

  async writeToDocument(
    documentId: string,
    content: string,
    rewrite: boolean = true,
  ) {
    try {
      // const auth = await this.getCredentials();
      const docsService = google.docs({
        version: 'v1',
        auth: this.oAuth2Client,
      });
      // Fetch the document to determine its current content
      const doc = await docsService.documents.get({ documentId });
      const bodyContent = doc.data.body?.content || [];
      const endIndex = bodyContent[bodyContent.length - 1]?.endIndex || 1;

      const requests: any[] = [];
      // Check that the endIndex allows for deletion without creating an empty range
      if (rewrite && endIndex > 2) {
        requests.push({
          deleteContentRange: {
            range: { startIndex: 1, endIndex: endIndex - 1 },
          },
        });
      } else {
        this.logger.warn(
          `Skipping content deletion: endIndex (${endIndex}) does not allow deletion without creating an empty range.`,
        );
      }

      // Insert the new content
      requests.push({
        insertText: {
          location: { index: 1 },
          text: content,
        },
      });

      // Add styling based on patterns
      let cursorIndex = 1; // Start after insertion point
      content.split('\n').forEach((line) => {
        const addMatch = line.startsWith('Add:');
        const removeMatch = line.startsWith('Remove:');

        if (addMatch || removeMatch) {
          const color = addMatch ? { blue: 1.0 } : { red: 1.0 };

          requests.push({
            updateTextStyle: {
              range: {
                startIndex: cursorIndex,
                endIndex: cursorIndex + line.length,
              },
              textStyle: {
                foregroundColor: { color: { rgbColor: color } },
              },
              fields: 'foregroundColor',
            },
          });
        }
        cursorIndex += line.length + 1; // Update cursorIndex (+1 for the newline character)
      });

      await docsService.documents.batchUpdate({
        documentId,
        requestBody: { requests },
      });

      this.logger.log(`Content written to Google Doc ID: ${documentId}`);
    } catch (error) {
      this.logger.error(`Failed to write to Google Doc: ${error}`);
      throw new Error('Failed to write to Google Doc');
    }
  }

  async readDocumentContent(documentId: string): Promise<string> {
    try {
      // const auth = await this.getCredentials();
      const docsService = google.docs({
        version: 'v1',
        auth: this.oAuth2Client,
      });

      // Fetch the document's content
      const doc = await docsService.documents.get({ documentId });
      const docContent = doc.data.body?.content || [];
      let documentText = '';

      // Parse each element to extract the text
      docContent.forEach((element) => {
        if (element.paragraph) {
          element.paragraph.elements?.forEach((elem) => {
            if (elem.textRun?.content) {
              documentText += elem.textRun.content;
            }
          });
        }
      });

      this.logger.log(`Read content from Google Doc ID: ${documentId}`);
      return documentText;
    } catch (error) {
      this.logger.error(`Failed to read Google Doc content: ${error}`);
      throw new Error('Failed to read Google Doc content');
    }
  }

  // async parseMarkdownFormat(content: string, startIndex: number = 1): Promise<any[]> {
  //   // Parses markdown-style formatting for bold, italic, etc., and returns Google Docs API requests.
  // }
}
