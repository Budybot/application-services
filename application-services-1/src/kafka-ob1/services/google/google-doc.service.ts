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
      await this.refreshAccessTokenIfNeeded();
      const driveService = google.drive({
        version: 'v3',
        auth: this.oAuth2Client,
      });

      const folderMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        ...(parentFolderId && { parents: [parentFolderId] }),
      };

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
      await this.refreshAccessTokenIfNeeded();
      const docsService = google.docs({
        version: 'v1',
        auth: this.oAuth2Client,
      });
      const driveService = google.drive({
        version: 'v3',
        auth: this.oAuth2Client,
      });

      const document = await docsService.documents.create({
        requestBody: { title },
      });
      const documentId = document.data.documentId;
      this.logger.log(`Google Doc created with ID: ${documentId}`);

      if (folderId) {
        await this.moveFileToFolder(documentId, folderId);
      }

      if (shareWithEmail) {
        await this.shareFileWithUser(documentId, shareWithEmail, role);
      }

      return documentId;
    } catch (error) {
      this.logger.error(
        `An error occurred while creating the document: ${error.message}`,
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
      await this.refreshAccessTokenIfNeeded();
      const docsService = google.docs({
        version: 'v1',
        auth: this.oAuth2Client,
      });
      const doc = await docsService.documents.get({ documentId });
      const bodyContent = doc.data.body?.content || [];
      const endIndex = bodyContent[bodyContent.length - 1]?.endIndex || 1;

      const requests: any[] = [];

      if (rewrite && endIndex > 2) {
        requests.push(this.createDeleteContentRangeRequest(1, endIndex - 1));
      }

      requests.push(this.createInsertTextRequest(1, content));

      requests.push(...this.createTextStyleRequests(content, 1));

      await docsService.documents.batchUpdate({
        documentId,
        requestBody: { requests },
      });

      this.logger.log(`Content written to Google Doc ID: ${documentId}`);
    } catch (error) {
      this.logger.error(`Failed to write to Google Doc: ${error.message}`);
      throw new Error('Failed to write to Google Doc');
    }
  }

  async appendRecommendations(
    documentId: string,
    updates: { [section: string]: { add?: string; remove?: string } },
  ) {
    let recommendationsContent = 'RECOMMENDATIONS:

';

    for (const [section, changes] of Object.entries(updates)) {
      recommendationsContent += `${section}
`;
      if (changes.add)
        recommendationsContent += `Add:
${changes.add.trim()}
`;
      if (changes.remove)
        recommendationsContent += `Remove:
${changes.remove.trim()}
`;
      recommendationsContent += '
';
    }

    await this.writeToDocument(documentId, recommendationsContent, false);
  }

  async readDocumentContent(documentId: string): Promise<string> {
    try {
      await this.refreshAccessTokenIfNeeded();
      const docsService = google.docs({
        version: 'v1',
        auth: this.oAuth2Client,
      });

      const doc = await docsService.documents.get({ documentId });
      const docContent = doc.data.body?.content || [];
      let documentText = '';

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
      this.logger.error(`Failed to read Google Doc content: ${error.message}`);
      throw new Error('Failed to read Google Doc content');
    }
  }

  async getDocumentSections(
    documentId: string,
  ): Promise<{ [section: string]: string }> {
    try {
      await this.refreshAccessTokenIfNeeded();
      const docsService = google.docs({
        version: 'v1',
        auth: this.oAuth2Client,
      });
      const doc = await docsService.documents.get({ documentId });
      const contentElements = doc.data.body?.content || [];

      const sections: { [section: string]: string } = {};
      let currentSection = '';
      let currentContent = '';

      for (const element of contentElements) {
        if (element.paragraph) {
          const paragraph = element.paragraph;
          const textRuns = paragraph.elements || [];
          const textContent = textRuns
            .map((tr) => tr.textRun?.content || '')
            .join('');

          if (paragraph.paragraphStyle?.namedStyleType === 'HEADING_1') {
            if (currentSection) {
              sections[currentSection] = currentContent.trim();
            }
            currentSection = textContent.trim();
            currentContent = '';
          } else {
            currentContent += textContent;
          }
        }
      }

      if (currentSection) {
        sections[currentSection] = currentContent.trim();
      }

      return sections;
    } catch (error) {
      this.logger.error(`Failed to get document sections: ${error.message}`);
      throw new Error('Failed to get document sections');
    }
  }

  async createDocumentFromJson(
    documentId: string,
    contentJson: { [section: string]: string },
    title: string = 'Document Title',
  ) {
    try {
      await this.refreshAccessTokenIfNeeded();
      const docsService = google.docs({ version: 'v1', auth: this.oAuth2Client });
      const requests: any[] = [];

      // Add title at the beginning
      requests.push({
        insertText: {
          location: { index: 1 },
          text: `${title}\n\n`,
        },
      });
      requests.push({
        updateTextStyle: {
          range: { startIndex: 1, endIndex: title.length + 1 },
          textStyle: {
            bold: true,
            fontSize: { magnitude: 24, unit: 'PT' },
          },
          fields: 'bold,fontSize',
        },
      });

      // Set initial index after the title
      let index = title.length + 2;

      for (const [header, content] of Object.entries(contentJson)) {
        // Insert header
        requests.push({
          insertText: {
            location: { index },
            text: `${header}\n`,
          },
        });
        requests.push({
          updateParagraphStyle: {
            range: { startIndex: index, endIndex: index + header.length + 1 },
            paragraphStyle: {
              namedStyleType: 'HEADING_1',
            },
            fields: 'namedStyleType',
          },
        });
        index += header.length + 1;

        // Insert content with proper spacing
        requests.push({
          insertText: {
            location: { index },
            text: `\n${content}\n\n`,
          },
        });
        index += content.length + 4; // account for added newlines
      }

      await docsService.documents.batchUpdate({
        documentId,
        requestBody: { requests },
      });

      this.logger.log(
        `Document created with structured sections in Google Doc ID: ${documentId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to create document from JSON: ${error.message}`,
      );
      throw new Error('Failed to create document from JSON');
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

  private createDeleteContentRangeRequest(
    startIndex: number,
    endIndex: number,
  ) {
    return {
      deleteContentRange: {
        range: { startIndex, endIndex },
      },
    };
  }

  private createInsertTextRequest(index: number, text: string) {
    return {
      insertText: {
        location: { index },
        text,
      },
    };
  }

  private createTextStyleRequests(content: string, startIndex: number) {
    const requests: any[] = [];
    let cursorIndex = startIndex;
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
      cursorIndex += line.length + 1;
    });
    return requests;
  }

  private async moveFileToFolder(fileId: string, folderId: string) {
    const driveService = google.drive({
      version: 'v3',
      auth: this.oAuth2Client,
    });
    const file = await driveService.files.get({
      fileId,
      fields: 'parents',
    });
    const previousParents = file.data.parents
      ? file.data.parents.join(',')
      : '';
    await driveService.files.update({
      fileId,
      addParents: folderId,
      removeParents: previousParents,
      fields: 'id, parents',
    });
    this.logger.debug(`File moved to folder ID: ${folderId}`);
  }

  private async shareFileWithUser(
    fileId: string,
    email: string,
    role: string = 'writer',
  ) {
    const driveService = google.drive({
      version: 'v3',
      auth: this.oAuth2Client,
    });
    await driveService.permissions.create({
      fileId,
      requestBody: {
        type: 'user',
        role,
        emailAddress: email,
      },
      fields: 'id',
    });
    this.logger.log(`File shared with ${email} as ${role}`);
  }
}
