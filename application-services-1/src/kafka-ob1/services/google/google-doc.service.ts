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

  /**
   * Creates a section with a header and initial content paragraphs.
   */
  async createSection(
    documentId: string,
    header: string,
    paragraphs: string[],
  ) {
    const docsService = google.docs({ version: 'v1', auth: this.oAuth2Client });
    const requests: any[] = [];

    // Add header
    requests.push({
      insertText: {
        location: { index: 1 },
        text: `\n${header}\n`,
      },
    });

    // Style as header
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: 1,
          endIndex: header.length + 2, // account for newline
        },
        textStyle: {
          bold: true,
          fontSize: { magnitude: 14, unit: 'PT' },
          foregroundColor: {
            color: { rgbColor: { blue: 0.5, green: 0.5, red: 0.2 } },
          },
        },
        fields: 'bold,fontSize,foregroundColor',
      },
    });

    // Add paragraphs
    let cursorIndex = header.length + 2;
    paragraphs.forEach((paragraph) => {
      requests.push({
        insertText: {
          location: { index: cursorIndex },
          text: `\n${paragraph}\n`,
        },
      });
      cursorIndex += paragraph.length + 2; // account for newline
    });

    await docsService.documents.batchUpdate({
      documentId,
      requestBody: { requests },
    });
    this.logger.log(`Section '${header}' created with paragraphs`);
  }

  /**
   * Writes to a specific paragraph under a given header.
   */
  async writeToParagraph(
    documentId: string,
    header: string,
    paragraphIndex: number,
    content: string,
    replace = true,
  ) {
    const docsService = google.docs({ version: 'v1', auth: this.oAuth2Client });

    // Locate the header and its paragraphs
    const doc = await docsService.documents.get({ documentId });
    const contentElements = doc.data.body?.content || [];

    let startIdx = null;
    let paraIdx = 0;
    for (let i = 0; i < contentElements.length; i++) {
      const element = contentElements[i];
      if (
        element.paragraph &&
        element.paragraph.elements?.[0]?.textRun?.content.trim() === header
      ) {
        startIdx = i + 1; // start after header
        break;
      }
    }

    if (startIdx === null) throw new Error(`Header '${header}' not found`);

    // Locate the specific paragraph index under the header
    for (let i = startIdx; i < contentElements.length; i++) {
      const element = contentElements[i];
      if (element.paragraph && paraIdx === paragraphIndex) {
        const endIndex = element.endIndex;
        const requests = [];

        if (replace) {
          requests.push({
            deleteContentRange: {
              range: { startIndex: element.startIndex, endIndex },
            },
          });
        }

        requests.push({
          insertText: {
            location: { index: element.startIndex },
            text: content,
          },
        });

        await docsService.documents.batchUpdate({
          documentId,
          requestBody: { requests },
        });
        this.logger.log(
          `Paragraph ${paragraphIndex} under header '${header}' updated`,
        );
        return;
      }
      paraIdx++;
    }

    throw new Error(
      `Paragraph index ${paragraphIndex} under header '${header}' not found`,
    );
  }

  /**
   * Reads content from a specific paragraph under a given header.
   */
  async readFromParagraph(
    documentId: string,
    header: string,
    paragraphIndex: number,
  ): Promise<string> {
    const docsService = google.docs({ version: 'v1', auth: this.oAuth2Client });

    // Locate the header and paragraphs
    const doc = await docsService.documents.get({ documentId });
    const contentElements = doc.data.body?.content || [];

    let startIdx = null;
    let paraIdx = 0;
    for (let i = 0; i < contentElements.length; i++) {
      const element = contentElements[i];
      if (
        element.paragraph &&
        element.paragraph.elements?.[0]?.textRun?.content.trim() === header
      ) {
        startIdx = i + 1; // start after header
        break;
      }
    }

    if (startIdx === null) throw new Error(`Header '${header}' not found`);

    // Locate the specific paragraph index under the header
    for (let i = startIdx; i < contentElements.length; i++) {
      const element = contentElements[i];
      if (element.paragraph && paraIdx === paragraphIndex) {
        const paragraphText = element.paragraph.elements
          ?.map((el) => el.textRun?.content || '')
          .join('');
        this.logger.log(
          `Read from paragraph ${paragraphIndex} under header '${header}'`,
        );
        return paragraphText || '';
      }
      paraIdx++;
    }

    throw new Error(
      `Paragraph index ${paragraphIndex} under header '${header}' not found`,
    );
  }

  async createDocumentFromJson(
    documentId: string,
    contentJson: { [section: string]: string },
    title: string = 'Document Title',
  ) {
    const docsService = google.docs({ version: 'v1', auth: this.oAuth2Client });
    const requests: any[] = [];

    // 1. Add Title at the top of the document
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

    // 2. Initialize index after the title
    let index = title.length + 2;

    // 3. Loop through each section in order
    for (const [header, content] of Object.entries(contentJson)) {
      // a. Add header
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

      // b. Add content based on its type
      if (Array.isArray(content)) {
        // Content is a list (e.g., objectives, challenges)
        for (const item of content) {
          // Insert bullet point
          requests.push({
            insertText: {
              location: { index },
              text: `${item}\n`,
            },
          });
          requests.push({
            createParagraphBullets: {
              range: {
                startIndex: index,
                endIndex: index + item.length + 1,
              },
              bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
            },
          });
          index += item.length + 1;
        }
      } else if (typeof content === 'object' && content !== null) {
        // Content is a sub-section (e.g., roles and responsibilities)
        for (const [subHeader, subContent] of Object.entries(content)) {
          // Insert sub-header
          requests.push({
            insertText: {
              location: { index },
              text: `${subHeader}\n`,
            },
          });
          requests.push({
            updateParagraphStyle: {
              range: {
                startIndex: index,
                endIndex: index + subHeader.length + 1,
              },
              paragraphStyle: {
                namedStyleType: 'HEADING_2',
              },
              fields: 'namedStyleType',
            },
          });
          index += subHeader.length + 1;

          // Check subContent type for flexible handling
          if (Array.isArray(subContent)) {
            // subContent is a list
            for (const listItem of subContent) {
              requests.push({
                insertText: {
                  location: { index },
                  text: `${listItem}\n`,
                },
              });
              requests.push({
                createParagraphBullets: {
                  range: {
                    startIndex: index,
                    endIndex: index + listItem.length + 1,
                  },
                  bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
                },
              });
              index += listItem.length + 1;
            }
          } else if (typeof subContent === 'string') {
            // subContent is a paragraph
            requests.push({
              insertText: {
                location: { index },
                text: `${subContent}\n\n`,
              },
            });
            index += subContent.length + 2;
          }
        }
      } else if (typeof content === 'string') {
        // Content is a paragraph
        requests.push({
          insertText: {
            location: { index },
            text: `${content}\n\n`,
          },
        });
        index += content.length + 2;
      }
    }

    // // 2. Reverse the order of sections to add content sequentially from the top down
    // const sections = Object.entries(contentJson).reverse();

    // sections.forEach(([header, paragraph]) => {
    //   // Add header for each section
    //   requests.push({
    //     insertText: {
    //       location: { index: 1 },
    //       text: `\n${header}\n`,
    //     },
    //   });
    //   requests.push({
    //     updateTextStyle: {
    //       range: { startIndex: 1, endIndex: header.length + 2 },
    //       textStyle: {
    //         bold: true,
    //         fontSize: { magnitude: 14, unit: 'PT' },
    //       },
    //       fields: 'bold,fontSize',
    //     },
    //   });
    //   // 3. Handle bullet points and numbered lists based on content format
    //   if (paragraph.includes('* ')) {
    //     // Bullet point formatting
    //     const bulletPoints = paragraph
    //       .split('\n')
    //       .map((line) => line.replace('* ', ''));
    //     bulletPoints.forEach((point) => {
    //       requests.push({
    //         insertText: {
    //           location: { index: header.length + 2 },
    //           text: `• ${point}\n`,
    //         },
    //       });
    //     });
    //   } else if (paragraph.includes('1. ')) {
    //     // Numbered list formatting
    //     const numberedItems = paragraph
    //       .split('\n')
    //       .map((line) => line.replace(/^\d+\.\s/, ''));
    //     numberedItems.forEach((item, index) => {
    //       requests.push({
    //         insertText: {
    //           location: { index: header.length + 2 },
    //           text: `${index + 1}. ${item}\n`,
    //         },
    //       });
    //     });
    //   } else {
    //     // Regular paragraph
    //     requests.push({
    //       insertText: {
    //         location: { index: header.length + 2 },
    //         text: `\n${paragraph}\n`,
    //       },
    //     });
    //   }
    // });

    // Send the batch update request to Google Docs API
    await docsService.documents.batchUpdate({
      documentId,
      requestBody: { requests },
    });

    this.logger.log(
      `Document created with structured sections in Google Doc ID: ${documentId}`,
    );
  }

  async getDocumentSections(
    documentId: string,
  ): Promise<{ [section: string]: string }> {
    const docsService = google.docs({ version: 'v1', auth: this.oAuth2Client });
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
          // Save the previous section
          if (currentSection) {
            sections[currentSection] = currentContent.trim();
          }
          // Start a new section
          currentSection = textContent.trim();
          currentContent = '';
        } else {
          // Append to the current section content
          currentContent += textContent;
        }
      }
    }

    // Save the last section
    if (currentSection) {
      sections[currentSection] = currentContent.trim();
    }

    return sections;
  }

  async appendRecommendations(
    documentId: string,
    updates: { [section: string]: { add?: string; remove?: string } },
  ) {
    const docsService = google.docs({ version: 'v1', auth: this.oAuth2Client });
    const doc = await docsService.documents.get({ documentId });
    const contentElements = doc.data.body?.content || [];

    const requests: any[] = [];

    // Step 1: Handle missing sections first by adding them near the end of the document
    const docEndIndex = contentElements.slice(-1)[0]?.endIndex || 1;
    for (const section of Object.keys(updates)) {
      const sectionExists = contentElements.some(
        (element) =>
          element.paragraph?.paragraphStyle?.namedStyleType === 'HEADING_1' &&
          element.paragraph.elements
            ?.map((tr) => tr.textRun?.content || '')
            .join('')
            .trim() === section,
      );

      if (!sectionExists) {
        this.logger.warn(`Section '${section}' not found. Adding it.`);

        // Insert the new section header just before the document end
        const insertPosition = Math.max(docEndIndex - 1, 1); // Ensure the position is valid and within bounds

        requests.push({
          insertText: {
            location: { index: insertPosition },
            text: `\n${section}\n`,
          },
        });
        requests.push({
          updateParagraphStyle: {
            range: {
              startIndex: insertPosition,
              endIndex: insertPosition + section.length + 1,
            },
            paragraphStyle: { namedStyleType: 'HEADING_1' },
            fields: 'namedStyleType',
          },
        });
      }
    }

    // Execute batch update to add any missing sections first
    if (requests.length > 0) {
      await docsService.documents.batchUpdate({
        documentId,
        requestBody: { requests },
      });
    }

    // Step 2: Go backwards through each section and append recommendations
    for (const [section, changes] of Object.entries(updates).reverse()) {
      let sectionStartIndex: number | null = null;
      let nextSectionStartIndex: number | null = null;

      // Locate the section and mark where to insert recommendations
      for (let i = contentElements.length - 1; i >= 0; i--) {
        const element = contentElements[i];
        const textContent = element.paragraph?.elements
          ?.map((tr) => tr.textRun?.content || '')
          .join('')
          .trim();

        if (
          textContent === section &&
          element.paragraph?.paragraphStyle?.namedStyleType === 'HEADING_1'
        ) {
          sectionStartIndex = element.endIndex || 1;
        } else if (sectionStartIndex && !nextSectionStartIndex) {
          nextSectionStartIndex = element.startIndex || sectionStartIndex + 1;
          break;
        }
      }

      // If the section is new, set the insertIndex to the document's end
      const insertIndex =
        nextSectionStartIndex || sectionStartIndex || docEndIndex - 1;

      // Prepare the recommendation text
      let updateText = '';
      if (changes.add) {
        updateText += changes.add
          .split('\n')
          .map((line) => `Add: ${line}`)
          .join('\n');
      }
      if (changes.remove) {
        updateText +=
          '\n' +
          changes.remove
            .split('\n')
            .map((line) => `Remove: ${line}`)
            .join('\n');
      }

      if (updateText) {
        const textToInsert = `\n${updateText}\n`;
        requests.push({
          insertText: {
            location: { index: insertIndex },
            text: textToInsert,
          },
        });

        // Apply color coding for "Add" and "Remove" labels
        const addColor = { red: 0, green: 0, blue: 1 };
        const removeColor = { red: 1, green: 0, blue: 0 };
        let cursorIndex = insertIndex;

        updateText.split('\n').forEach((line) => {
          if (line.startsWith('Add:')) {
            requests.push({
              updateTextStyle: {
                range: {
                  startIndex: cursorIndex,
                  endIndex: cursorIndex + 4,
                },
                textStyle: {
                  foregroundColor: { color: { rgbColor: addColor } },
                },
                fields: 'foregroundColor',
              },
            });
          } else if (line.startsWith('Remove:')) {
            requests.push({
              updateTextStyle: {
                range: {
                  startIndex: cursorIndex,
                  endIndex: cursorIndex + 7,
                },
                textStyle: {
                  foregroundColor: { color: { rgbColor: removeColor } },
                },
                fields: 'foregroundColor',
              },
            });
          }
          cursorIndex += line.length + 1;
        });
      }
    }

    // Step 3: Execute the final batch update
    if (requests.length > 0) {
      await docsService.documents.batchUpdate({
        documentId,
        requestBody: { requests },
      });
      this.logger.log('Appended recommendations to the document.');
    } else {
      this.logger.log('No updates to apply to the document.');
    }
  }

  // async appendRecommendations(
  //   documentId: string,
  //   updates: { [section: string]: { add?: string; remove?: string } },
  // ) {
  //   const docsService = google.docs({ version: 'v1', auth: this.oAuth2Client });
  //   const doc = await docsService.documents.get({ documentId });
  //   const contentElements = doc.data.body?.content || [];

  //   const requests: any[] = [];
  //   const sectionIndices: {
  //     [section: string]: { startIndex: number; endIndex: number };
  //   } = {};

  //   // Map section headers to their start and end indices
  //   let currentSection = '';
  //   let currentStartIndex = 0;
  //   let currentEndIndex = 0;

  //   for (const element of contentElements) {
  //     if (element.paragraph) {
  //       const paragraph = element.paragraph;
  //       const textRuns = paragraph.elements || [];
  //       const textContent = textRuns
  //         .map((tr) => tr.textRun?.content || '')
  //         .join('');
  //       const startIndex = element.startIndex || 1;
  //       const endIndex = element.endIndex || startIndex;

  //       if (paragraph.paragraphStyle?.namedStyleType === 'HEADING_1') {
  //         if (currentSection) {
  //           sectionIndices[currentSection].endIndex = startIndex - 1;
  //         }
  //         currentSection = textContent.trim();
  //         currentStartIndex = endIndex;
  //         sectionIndices[currentSection] = {
  //           startIndex: currentStartIndex,
  //           endIndex: 0,
  //         };
  //       } else {
  //         currentEndIndex = endIndex;
  //       }
  //     }
  //   }

  //   // Set endIndex for the last section
  //   if (currentSection) {
  //     sectionIndices[currentSection].endIndex = currentEndIndex;
  //   }
  //   const sortedSections = Object.entries(sectionIndices).sort(
  //     ([, a], [, b]) => a.startIndex - b.startIndex,
  //   );

  //   // Append recommendations to each section
  //   for (const [section, changes] of Object.entries(updates)) {
  //     let sectionInfo = sectionIndices[section];

  //     if (!sectionInfo) {
  //       this.logger.warn(
  //         `Section '${section}' not found in the document. Adding it.`,
  //       );
  //       // Get the end index of the document
  //       const endIndex = doc.data.body?.content?.slice(-1)[0]?.endIndex || 1;

  //       // Insert the new section header
  //       requests.push({
  //         insertText: {
  //           location: { index: endIndex - 1 },
  //           text: `\n${section}\n`,
  //         },
  //       });
  //       requests.push({
  //         updateParagraphStyle: {
  //           range: {
  //             startIndex: endIndex,
  //             endIndex: endIndex + section.length + 1,
  //           },
  //           paragraphStyle: {
  //             namedStyleType: 'HEADING_1',
  //           },
  //           fields: 'namedStyleType',
  //         },
  //       });

  //       // Update sectionInfo to point to the new section
  //       sectionInfo = {
  //         startIndex: endIndex + section.length + 1,
  //         endIndex: endIndex + section.length + 1,
  //       };

  //       // Add the new section to the sortedSections array
  //       sortedSections.push([section, sectionInfo]);

  //       // Sort the sections again
  //       sortedSections.sort(([, a], [, b]) => a.startIndex - b.startIndex);
  //     }

  //     // Prepare recommendations text
  //     let updateText = '';

  //     const addContent = changes.add || '';
  //     const removeContent = changes.remove || '';

  //     if (addContent) {
  //       const addLines = addContent
  //         .split('\n')
  //         .map((line) => `Add: ${line}`)
  //         .join('\n');
  //       updateText += `\n${addLines}\n`;
  //     }

  //     if (removeContent) {
  //       const removeLines = removeContent
  //         .split('\n')
  //         .map((line) => `Remove: ${line}`)
  //         .join('\n');
  //       updateText += `\n${removeLines}\n`;
  //     }

  //     if (updateText) {
  //       const textToInsert = `\n${updateText}`;
  //       const insertIndex = sectionInfo.endIndex;
  //       requests.push({
  //         insertText: {
  //           location: { index: insertIndex },
  //           text: textToInsert,
  //         },
  //       });
  //       requests.push({
  //         updateParagraphStyle: {
  //           range: {
  //             startIndex: insertIndex,
  //             endIndex: insertIndex + textToInsert.length,
  //           },
  //           paragraphStyle: {
  //             namedStyleType: 'NORMAL_TEXT',
  //           },
  //           fields: 'namedStyleType',
  //         },
  //       });
  //       const addColor = { red: 0, green: 0, blue: 1 }; // Blue for "Add:"
  //       const removeColor = { red: 1, green: 0, blue: 0 }; // Red for "Remove:"

  //       let cursorIndex = insertIndex;
  //       updateText.split('\n').forEach((line) => {
  //         if (line.startsWith('Add:')) {
  //           requests.push({
  //             updateTextStyle: {
  //               range: {
  //                 startIndex: cursorIndex,
  //                 endIndex: cursorIndex + 4, // "Add:" is 4 characters
  //               },
  //               textStyle: {
  //                 foregroundColor: { color: { rgbColor: addColor } },
  //               },
  //               fields: 'foregroundColor',
  //             },
  //           });
  //         } else if (line.startsWith('Remove:')) {
  //           requests.push({
  //             updateTextStyle: {
  //               range: {
  //                 startIndex: cursorIndex,
  //                 endIndex: cursorIndex + 7, // "Remove:" is 7 characters
  //               },
  //               textStyle: {
  //                 foregroundColor: { color: { rgbColor: removeColor } },
  //               },
  //               fields: 'foregroundColor',
  //             },
  //           });
  //         }
  //         cursorIndex += line.length + 1; // Move to the next line (+1 for the newline character)
  //       });

  //       // Calculate the length of inserted text
  //       const insertedTextLength = textToInsert.length;

  //       // Update the endIndex of the current section
  //       sectionInfo.endIndex += insertedTextLength;

  //       // Update startIndex and endIndex of subsequent sections
  //       for (const [nextSection, nextSectionInfo] of sortedSections) {
  //         if (nextSectionInfo.startIndex > sectionInfo.startIndex) {
  //           nextSectionInfo.startIndex += insertedTextLength;
  //           nextSectionInfo.endIndex += insertedTextLength;
  //         }
  //       }
  //     }
  //   }

  //   // Execute the batch update
  //   if (requests.length > 0) {
  //     await docsService.documents.batchUpdate({
  //       documentId,
  //       requestBody: { requests },
  //     });
  //     this.logger.log(`Appended recommendations to the document.`);
  //   } else {
  //     this.logger.log(`No updates to apply to the document.`);
  //   }
  // }

  // async parseMarkdownFormat(content: string, startIndex: number = 1): Promise<any[]> {
  //   // Parses markdown-style formatting for bold, italic, etc., and returns Google Docs API requests.
  // }
}
