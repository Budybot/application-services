import { Injectable, Logger } from '@nestjs/common';
import { ContentAssetsService } from '../content/content-assets.service';
import { GoogleDocService } from '../../google/google-doc.service';
import { GoogleSheetService } from '../../google/google-sheet.service';
import { SowSectionService } from '../content/sow-section.service';
import { AgentServiceRequest } from '../agent-service-request.service';

@Injectable()
export class SyncAssetsService {
  private readonly logger = new Logger(SyncAssetsService.name);

  constructor(
    private readonly contentAssetsService: ContentAssetsService,
    private readonly googleDocService: GoogleDocService,
    private readonly googleSheetService: GoogleSheetService,
    private readonly sowSectionService: SowSectionService,
    private readonly agentServiceRequest: AgentServiceRequest,
  ) {}

  async syncAssets(
    syncTo: string,
    syncFrom: string,
    projectName: string,
    instanceName: string,
    userEmail: string,
  ): Promise<void> {
    this.logger.log(`Syncing assets from ${syncFrom} to ${syncTo}`);

    // Step 1: Fetch latest asset IDs for syncTo and syncFrom
    const syncFromAssetId = await this.contentAssetsService.getAssetId(
      syncFrom,
      projectName,
      instanceName,
      userEmail,
    );
    const syncToAssetId = await this.contentAssetsService.getAssetId(
      syncTo,
      projectName,
      instanceName,
      userEmail,
    );

    // Step 2: Read the content based on asset type
    const syncFromContent =
      syncFrom === 'SOW'
        ? await this.googleDocService.readDocumentContent(syncFromAssetId)
        : await this.googleSheetService.readSheetData(syncFromAssetId);

    const syncToContent =
      syncTo === 'SOW'
        ? await this.googleDocService.readDocumentContent(syncToAssetId)
        : await this.googleSheetService.readSheetData(syncToAssetId);

    // // Step 3: If either asset is SOW, split into sections for that asset
    // const sowSections =
    //   syncFrom === 'SOW'
    //     ? await this.sowSectionService.splitSowIntoSections(
    //         instanceName,
    //         userEmail,
    //         syncFromContent as string,
    //       )
    //     : syncTo === 'SOW'
    //       ? await this.sowSectionService.splitSowIntoSections(
    //           instanceName,
    //           userEmail,
    //           syncToContent as string,
    //         )
    //       : null;

    const sowDelta =
      syncFrom === 'SOW' || syncTo === 'SOW'
        ? await this.contentAssetsService.getAssetId(
            'SOWDelta',
            projectName,
            instanceName,
            userEmail,
          )
        : null;
    this.logger.debug(`SOW Delta: ${sowDelta}`);

    // Step 4: Fork for specific sync cases - Implement SOW to ProjectPlanner
    let updatedOutput;
    if (syncFrom === 'ProjectPlanner' && syncTo === 'SOW') {
      this.logger.log('Implementing sync from ProjectPlanner to SOW');
      // Placeholder for future implementation
    } else if (syncFrom === 'SOW' && syncTo === 'ProjectPlanner') {
      this.logger.log('Syncing from SOW to ProjectPlanner');

      // Step 5: Compare "Desired Deliverables" and "Timeline" in SOW sections with ProjectPlanner data
      const comparisonPrompt = `
        Analyze the differences between the Project Planner content and the latest client feedback, as found in sowDelta.assetDescription.

        Project Planner Data: ${JSON.stringify(syncToContent)}

        Based on the updated client needs and changes, provide an analysis of differences in the following JSON format:

        {
          "edit": {
            "Task ID to be edited": "edit description",
            ...
          },
          "remove": [
            "Task ID to be removed",
            ...
          ],
          "add": [
            {
              "Task ID": "New Task ID",
              "Task Name": "Task name",
              "Dependency": "Dependency description",
              "Description": "Task description",
              "Action on Completion": "Action to be taken upon completion",
              "Deadline": "Task deadline"
            },
            ...
          ]
        }
        For additions, insert new Task IDs without overwriting existing ones. Use decimal notation to fit new tasks between current Task IDs. For example, if IDs 1.2 and 1.3 already exist and a task needs to be added between them, assign it ID 1.2.1.
        For edits and removals, directly list the affected Task IDs and provide concise descriptions for edits or deletions as appropriate.
        Only highlight key changes that involve specific deliverables or timeline adjustments that are missing, redundant, or misaligned. Avoid unnecessary detail.
        `;

      const comparisonResponse =
        await this.agentServiceRequest.sendAgentRequest(
          comparisonPrompt,
          'Only return the difference analysis in JSON format. No additional content is allowed.',
          {
            provider: 'openai',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            maxTokens: 4096,
            frequencyPenalty: 0,
            presencePenalty: 0,
          },
          instanceName,
          userEmail,
        );

      const differenceAnalysis = comparisonResponse.messageContent?.content;
      if (!differenceAnalysis) {
        this.logger.error(`Failed to generate difference analysis`);
        throw new Error('Error in generating difference analysis');
      }
      this.logger.debug(`Difference Analysis: ${differenceAnalysis}`);

      // Update Project Planner with the difference analysis
      updatedOutput = await updateProjectPlanner(sowDelta, syncToContent);
      this.logger.debug(
        `Updated Project Planner: ${JSON.stringify(updatedOutput)}`,
      );

      // // Step 6: LLM Call to Generate Updated Project Planner
      // const projectPlannerUpdatePrompt = `
      //   Using the difference analysis provided, generate an updated Project Planner.
      //   Difference Analysis: ${differenceAnalysis}
      //   Existing Project Planner: ${JSON.stringify(syncToContent)}

      //   Ensure the output is structured in JSON format compatible with Google Sheets.
      // `;

      // const updatedPlannerResponse =
      //   await this.agentServiceRequest.sendAgentRequest(
      //     projectPlannerUpdatePrompt,
      //     'Only return the updated Project Planner in JSON format. No additional content is allowed.',
      //     {
      //       provider: 'openai',
      //       model: 'gpt-4o-mini',
      //       temperature: 0.7,
      //       maxTokens: 4096,
      //       frequencyPenalty: 0,
      //       presencePenalty: 0,
      //     },
      //     instanceName,
      //     userEmail,
      //   );

      // updatedOutput = updatedPlannerResponse.messageContent?.content;
      if (!updatedOutput) {
        this.logger.error(`Failed to generate updated Project Planner content`);
        throw new Error('Error in generating updated Project Planner');
      }
      // updatedOutput = updatedOutput.replace(/```json|```/g, '').trim();
      // updatedOutput = JSON.parse(updatedOutput);
    }

    // Step 7: Rewrite syncTo asset with updatedOutput
    if (syncTo === 'ProjectPlanner') {
      await this.googleSheetService.writeToSheet(syncToAssetId, updatedOutput);
    } else if (syncTo === 'SOW') {
      await this.googleDocService.writeToDocument(syncToAssetId, updatedOutput);
    }

    // Step 8: Update database for syncTo asset
    await this.contentAssetsService.saveDocumentAsset(
      syncTo,
      syncTo === 'ProjectPlanner' ? 'google sheet' : 'google doc',
      syncToAssetId,
      `https://docs.google.com/${syncTo === 'ProjectPlanner' ? 'spreadsheets' : 'document'}/d/${syncToAssetId}`,
      `${syncTo} for project (Synced from ${syncFrom})`,
      projectName,
      instanceName,
      userEmail,
    );

    this.logger.log(`Successfully synchronized ${syncFrom} to ${syncTo}`);
  }
}
// Function to process JSON and reassemble table data
// async function updateProjectPlanner(sowDelta: any, syncToContent: any) {
//   // Extract and parse JSON input for `edit`, `remove`, and `add` sections
//   const { edit, remove, add } = sowDelta;

//   // Convert syncToContent (assuming it's a JSON string) to an array of rows
//   const plannerData = JSON.parse(syncToContent);

//   // Create a new 'Budy Notes' column in each row
//   plannerData.forEach((row) => (row['Budy Notes'] = ''));

//   // Handle 'remove' tasks
//   remove.forEach((taskId) => {
//     const taskRow = plannerData.find((row) => row['Task ID'] === taskId);
//     if (taskRow) {
//       taskRow['Budy Notes'] = 'Remove';
//     }
//   });

//   // Handle 'edit' tasks
//   for (const [taskId, editDescription] of Object.entries(edit)) {
//     const taskRow = plannerData.find((row) => row['Task ID'] === taskId);
//     if (taskRow) {
//       taskRow['Budy Notes'] = `Edit: ${editDescription}`;
//     }
//   }

//   // Handle 'add' tasks
//   add.forEach((newTask) => {
//     const newRow = {
//       'Task ID': newTask['Task ID'],
//       'Task Name': newTask['Task Name'] || '',
//       Dependency: newTask['Dependency'] || '',
//       Description: newTask['Description'] || '',
//       'Action on Completion': newTask['Action on Completion'] || '',
//       Deadline: newTask['Deadline'] || '',
//       'Budy Notes': 'Add',
//     };
//     plannerData.push(newRow);
//   });

//   // Sort plannerData by Task ID to maintain row order
//   plannerData.sort((a, b) => a['Task ID'].localeCompare(b['Task ID']));

//   // Convert back to JSON or your desired format for further processing
//   return plannerData;
// }
// function parseSyncToContent(syncToContent: string): any[] {
//   // Convert string to JSON-compatible format by wrapping with []
//   const formattedContent = `[${syncToContent.replace(/\[/g, '').replace(/\]/g, '')}]`;

//   // Parse the formatted content
//   return JSON.parse(formattedContent);
// }

async function updateProjectPlanner(sowDelta: any, syncToContent: any) {
  // Step 1: Parse the syncToContent string into an array of rows
  // const plannerData = parseSyncToContent(syncToContent);
  console.log('Type of syncToContent:', typeof syncToContent);
  const plannerData = syncToContent;

  // Extract header and rows separately
  const headers = plannerData[0];
  const rows = plannerData.slice(1);
  console.log('Headers:', headers);
  console.log('Rows:', rows);

  // Step 2: Extract and parse JSON input for `edit`, `remove`, and `add` sections
  const { edit, remove, add } = sowDelta;

  // Step 3: Initialize 'Budy Notes' column in each row
  headers.push('Budy Notes');
  const updatedRows = rows.map((row) => [...row, '']);

  // Step 4: Process `remove` items by marking them in the 'Budy Notes' column
  console.log('Remove:', remove);
  if (remove) {
    remove.forEach((taskId) => {
      const taskRow = updatedRows.find((row) => row[0] === taskId);
      if (taskRow) {
        taskRow[headers.length - 1] = 'Remove';
      }
    });
  }

  // Step 5: Process `edit` items by adding edit descriptions in the 'Budy Notes' column
  console.log('Edit:', edit);
  if (edit) {
    for (const [taskId, editDescription] of Object.entries(edit)) {
      const taskRow = updatedRows.find((row) => row[0] === taskId);
      if (taskRow) {
        taskRow[headers.length - 1] = `Edit: ${editDescription}`;
      }
    }
  }

  // Step 6: Process `add` items by creating new rows with all required columns
  console.log('Add:', add);
  if (add) {
    add.forEach((newTask) => {
      const newRow = [
        newTask['Task ID'],
        newTask['Task Name'] || '',
        newTask['Dependency'] || '',
        newTask['Description'] || '',
        newTask['Action on Completion'] || '',
        newTask['Deadline'] || '',
        'Add',
      ];
      updatedRows.push(newRow);
    });
  }

  // Step 7: Sort the rows by `Task ID` to maintain correct order
  updatedRows.sort((a, b) => a[0].localeCompare(b[0]));

  // Step 8: Return the updated planner data, including headers
  return [headers, ...updatedRows];
}
