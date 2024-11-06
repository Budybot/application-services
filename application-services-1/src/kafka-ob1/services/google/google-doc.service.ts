import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class GoogleDocService {
  private readonly logger = new Logger(GoogleDocService.name);
  private readonly SCOPES = [
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/drive',
  ];
  private readonly TOKEN_PATH = path.join(__dirname, '../../token.json');
  // private readonly CREDENTIALS_PATH = path.join(
  //   __dirname,
  //   '../../credentials.json',
  // );
  private readonly CREDENTIALS_PATH =
    process.env.CREDENTIALS_PATH ||
    path.join(__dirname, '../../credentials.json');
  private oAuth2Client: any;

  constructor() {
    // Initialize the OAuth2 client with credentials
    this.initOAuth2Client();
  }
  private initOAuth2Client() {
    const content = fs.readFileSync(this.CREDENTIALS_PATH, 'utf8');
    const credentials = JSON.parse(content);
    const { client_secret, client_id, redirect_uris } = credentials.installed;
    this.oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0],
    );
  }

  async getCredentials() {
    try {
      if (fs.existsSync(this.TOKEN_PATH)) {
        const token = fs.readFileSync(this.TOKEN_PATH, 'utf8');
        this.oAuth2Client.setCredentials(JSON.parse(token));
        return this.oAuth2Client;
      } else {
        return this.getAuthorizationUrl();
      }
    } catch (error) {
      this.logger.error('Error loading client secret file:', error);
      throw new Error('Failed to load credentials');
    }
  }

  getAuthorizationUrl(): string {
    const authUrl = this.oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: this.SCOPES,
    });
    this.logger.log(`Authorize this app by visiting this URL: ${authUrl}`);
    return authUrl;
  }

  async handleOAuthCallback(code: string) {
    const token = await this.oAuth2Client.getToken(code);
    this.oAuth2Client.setCredentials(token.tokens);
    fs.writeFileSync(this.TOKEN_PATH, JSON.stringify(token.tokens));
    this.logger.log('Token stored to', this.TOKEN_PATH);
    return this.oAuth2Client;
  }

  async createGoogleDriveFolder(
    folderName: string,
    parentFolderId?: string,
  ): Promise<string> {
    try {
      const auth = await this.getCredentials();
      const driveService = google.drive({ version: 'v3', auth });

      // Define the folder metadata
      const folderMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentFolderId && { parents: [parentFolderId] }), // Add parent folder if specified
      };

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
      this.logger.error(`Failed to create Google Drive folder: ${error}`);
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
      const auth = await this.getCredentials();
      const docsService = google.docs({ version: 'v1', auth });
      const driveService = google.drive({ version: 'v3', auth });

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
        this.logger.log(`Document moved to folder ID: ${folderId}`);
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
      const auth = await this.getCredentials();
      const docsService = google.docs({ version: 'v1', auth });
      // Fetch the document to determine its current content
      const doc = await docsService.documents.get({ documentId });
      const bodyContent = doc.data.body?.content || [];
      const endIndex = bodyContent[bodyContent.length - 1]?.endIndex || 1;

      const requests: any[] = [];
      // Optionally clear existing content
      if (rewrite && endIndex > 1) {
        requests.push({
          deleteContentRange: {
            range: { startIndex: 1, endIndex },
          },
        });
      }

      // Insert the new content
      requests.push({
        insertText: {
          location: { index: 1 },
          text: content,
        },
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
      const auth = await this.getCredentials();
      const docsService = google.docs({ version: 'v1', auth });

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
