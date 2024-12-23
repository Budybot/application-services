import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';

@Injectable()
export class GoogleSheetService {
  private readonly logger = new Logger(GoogleSheetService.name);
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

  async createGoogleDriveFolder(
    folderName: string,
    parentFolderId?: string,
  ): Promise<string> {
    try {
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

  async createGoogleSheet(
    title: string,
    folderId?: string,
    shareWithEmail?: string,
    role: string = 'writer',
  ): Promise<string> {
    try {
      const sheetsService = google.sheets({
        version: 'v4',
        auth: this.oAuth2Client,
      });
      const driveService = google.drive({
        version: 'v3',
        auth: this.oAuth2Client,
      });

      // Create the Google Sheet
      const spreadsheet = await sheetsService.spreadsheets.create({
        requestBody: { properties: { title } },
      });
      const sheetId = spreadsheet.data.spreadsheetId;
      this.logger.log(`Google Sheet created with ID: ${sheetId}`);

      // Move the Sheet to a Folder (Optional)
      if (folderId) {
        await driveService.files.update({
          fileId: sheetId,
          addParents: folderId,
          fields: 'id, parents',
        });
        this.logger.debug(`Sheet moved to folder ID: ${folderId}`);
      }

      // Share the Sheet (Optional)
      if (shareWithEmail) {
        await driveService.permissions.create({
          fileId: sheetId,
          requestBody: {
            type: 'user',
            role,
            emailAddress: shareWithEmail,
          },
          fields: 'id',
        });
        this.logger.log(`Sheet shared with ${shareWithEmail} as ${role}.`);
      }

      return sheetId;
    } catch (error) {
      this.logger.error(
        `An error occurred while creating the sheet: ${error.message}`,
      );
      throw new Error('Failed to create Google Sheet');
    }
  }

  // async writeToSheet(sheetId: string, data: string[][], startCell = 'A1') {
  //   try {
  //     const sheets = google.sheets({ version: 'v4', auth: this.oAuth2Client });

  //     // Compute dynamic range based on data dimensions
  //     const range = this.computeRange(startCell, data);

  //     const request = {
  //       spreadsheetId: sheetId,
  //       range,
  //       valueInputOption: 'USER_ENTERED',
  //       resource: { values: data },
  //     };

  //     await sheets.spreadsheets.values.update(request);
  //     this.logger.log(
  //       `Data written to Google Sheet ID: ${sheetId} at range ${range}`,
  //     );
  //   } catch (error) {
  //     this.logger.error(`Failed to write data to Google Sheet: ${error}`);
  //     throw new Error('Failed to write to Google Sheet');
  //   }
  // }

  async writeToSheet(sheetId: string, data: string[][], startCell = 'A1') {
    try {
      const sheets = google.sheets({ version: 'v4', auth: this.oAuth2Client });

      // Ensure data is valid
      if (!data || data.length === 0 || data[0].length === 0) {
        throw new Error('Data must be a non-empty 2D array.');
      }

      // Compute dynamic range based on data dimensions
      const range = this.computeRange(startCell, data);

      // Validate if the data matches the intended range
      this.logger.debug(`Attempting to write data to range: ${range}`);

      const request = {
        spreadsheetId: sheetId,
        range,
        valueInputOption: 'USER_ENTERED',
        resource: { values: data },
      };

      // Update the values in the given range
      const response = await sheets.spreadsheets.values.update(request);
      if (response.status !== 200) {
        throw new Error(`Unexpected response status: ${response.status}`);
      }

      // Apply formatting to "Budy Suggests" column if present
      const headers = data[0];
      const budyNotesIndex = headers.indexOf('Budy Suggests');
      if (budyNotesIndex !== -1) {
        const formatRequests = [];
        for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
          const cellValue = data[rowIndex][budyNotesIndex];
          let color = null;
          if (cellValue === 'Add') {
            color = { red: 0.0, green: 0.0, blue: 1.0 }; // Blue
          } else if (cellValue.startsWith('Edit:')) {
            color = { red: 0.0, green: 0.0, blue: 1.0 }; // Blue
          } else if (cellValue === 'Remove') {
            color = { red: 1.0, green: 0.0, blue: 0.0 }; // Red
          }

          if (color) {
            formatRequests.push({
              repeatCell: {
                range: {
                  sheetId: 0, // Assuming first sheet
                  startRowIndex: rowIndex,
                  endRowIndex: rowIndex + 1,
                  startColumnIndex: budyNotesIndex,
                  endColumnIndex: budyNotesIndex + 1,
                },
                cell: {
                  userEnteredFormat: {
                    textFormat: {
                      foregroundColor: color,
                    },
                  },
                },
                fields: 'userEnteredFormat.textFormat.foregroundColor',
              },
            });
          }
        }

        if (formatRequests.length > 0) {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: sheetId,
            requestBody: {
              requests: formatRequests,
            },
          });
          this.logger.log(
            `Applied text formatting to "Budy Suggests" column in Google Sheet ID: ${sheetId}`,
          );
        }
      }

      this.logger.log(
        `Data written to Google Sheet ID: ${sheetId} at range ${range}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to write data to Google Sheet: ${error.message}`,
      );
      throw new Error('Failed to write to Google Sheet');
    }
  }

  private computeRange(startCell: string, data: string[][]): string {
    const startColumn = startCell.match(/[A-Z]+/)![0];
    const startRow = parseInt(startCell.match(/\d+/)![0], 10);
    const numRows = data.length;
    const numCols = data[0].length;

    // Calculate the end column by converting the column letters to an index and adding numCols
    const endColumn = this.getColumnLetter(
      this.getColumnIndex(startColumn) + numCols - 1,
    );
    const endRow = startRow + numRows - 1;

    return `${startColumn}${startRow}:${endColumn}${endRow}`;
  }

  private getColumnIndex(column: string): number {
    let index = 0;
    for (let i = 0; i < column.length; i++) {
      index = index * 26 + (column.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return index;
  }

  private getColumnLetter(index: number): string {
    let letter = '';
    while (index > 0) {
      const mod = (index - 1) % 26;
      letter = String.fromCharCode(mod + 'A'.charCodeAt(0)) + letter;
      index = Math.floor((index - mod) / 26);
    }
    return letter;
  }
  async readSheetData(
    sheetId: string,
    sheetName: string = 'Sheet1',
  ): Promise<any[][]> {
    try {
      const sheetsService = google.sheets({
        version: 'v4',
        auth: this.oAuth2Client,
      });

      // Use the sheet name only, without specifying a cell range, to read the entire sheet
      const response = await sheetsService.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: sheetName,
      });

      const rows = response.data.values;
      this.logger.log(
        `Data read from Google Sheet ID: ${sheetId}, sheet name: ${sheetName}`,
      );
      return rows || [];
    } catch (error) {
      this.logger.error(`Failed to read Google Sheet data: ${error.message}`);
      throw new Error('Failed to read Google Sheet data');
    }
  }
}
