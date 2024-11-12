import { Injectable, Logger } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';
// import { SowSectionService } from './sow-section.service';
import { ContentAssetsService } from './content-assets.service';
import { GoogleDocService } from '../../google/google-doc.service';

@Injectable()
export class SowUpdateService {
  private readonly logger = new Logger(SowUpdateService.name);

  constructor(
    private readonly agentServiceRequest: AgentServiceRequest,
    // private readonly sowSectionService: SowSectionService,
    private readonly contentAssetsService: ContentAssetsService,
    private readonly googleDocService: GoogleDocService,
  ) {}

  // async updateSow(
  //   instanceName: string,
  //   userId: string,
  //   projectName: string,
  //   existingSowContent: string,
  //   pageContent: any,
  //   pageName: string,
  // ): Promise<string> {
  //   try {
  //     // Step 1: Split the SOW into sections
  //     const sowSections = await this.sowSectionService.splitSowIntoSections(
  //       instanceName,
  //       userId,
  //       existingSowContent,
  //     );

  //     // Extract relevant sections
  //     const objectivesChallenges =
  //       sowSections['Project Objectives and Key Challenges'];
  //     const projectScope = sowSections['Project Scope'];

  //     // Step 2a: Generate Scope Analysis
  //     const scopeAnalysisPrompt = `
  //       You are collaborating with another consultant to assess the current state of an ongoing project following a recent client meeting. Focus on any shifts in project objectives, challenges, and scope based on the details provided:

  //       • Meeting Transcript: ${pageContent.transcript}
  //       • Project Objectives and Key Challenges: ${objectivesChallenges}
  //       • Project Scope: ${projectScope}
  //       • Consultant’s Input: ${pageContent.consultant_input}

  //       Address the following questions:
  //       - Has the project scope changed? If yes, how?
  //       - What key challenges have emerged or evolved?
  //       - Are there new dependencies or bottlenecks affecting project completion?

  //       For each question, if there is no change, state “no change”; if not discussed, state "not discussed."
  //     `;

  //     this.logger.log(`Running scope analysis for SOW update on ${pageName}`);
  //     const scopeAnalysisResponse =
  //       await this.agentServiceRequest.sendAgentRequest(
  //         scopeAnalysisPrompt,
  //         'Return scope analysis based on the provided questions.',
  //         {
  //           provider: 'openai',
  //           model: 'gpt-4o-mini',
  //           temperature: 0.7,
  //           maxTokens: 4096,
  //           frequencyPenalty: 0,
  //           presencePenalty: 0,
  //         },
  //         instanceName,
  //         userId,
  //       );

  //     const scopeAnalysis = scopeAnalysisResponse.messageContent?.content;
  //     if (!scopeAnalysis) {
  //       this.logger.error(`Failed to generate scope analysis`);
  //       throw new Error('Error in generating scope analysis');
  //     }

  //     // Step 2b: Generate Timeline Analysis
  //     const desiredDeliverables = sowSections['Desired Deliverables'];
  //     const timelineAnalysisPrompt = `
  //       Based on recent client discussions, assess any changes or updates affecting the project timeline:
  //       • Current Action Items: ${pageContent.action_items}
  //       • Completed Action Items from Previous Call: ${pageContent.action_items_completed}
  //       • Desired Deliverables: ${desiredDeliverables}

  //       Answer the following:
  //       - Has the project end date changed?
  //       - Have interim milestones been adjusted?
  //       - Are there contingency plans for new risks?

  //       If there is no change, state “no change”; if not discussed, state "not discussed."
  //     `;

  //     this.logger.log(
  //       `Running timeline analysis for SOW update on ${pageName}`,
  //     );
  //     const timelineAnalysisResponse =
  //       await this.agentServiceRequest.sendAgentRequest(
  //         timelineAnalysisPrompt,
  //         'Return timeline analysis based on the provided questions.',
  //         {
  //           provider: 'openai',
  //           model: 'gpt-4o-mini',
  //           temperature: 0.7,
  //           maxTokens: 4096,
  //           frequencyPenalty: 0,
  //           presencePenalty: 0,
  //         },
  //         instanceName,
  //         userId,
  //       );

  //     const timelineAnalysis = timelineAnalysisResponse.messageContent?.content;
  //     if (!timelineAnalysis) {
  //       this.logger.error(`Failed to generate timeline analysis`);
  //       throw new Error('Error in generating timeline analysis');
  //     }

  //     // Step 3a: Scope Analysis Update
  //     const scopeUpdatePrompt = `
  //     Update relevant sections of the Statement of Work (SOW) based on the scope analysis. Only return sections that require changes.

  //     Scope Analysis: ${pageContent.scopeAnalysis}
  //     Existing SOW: ${existingSowContent}

  //     Return a JSON object with only the changes:

  //     {
  //       "sectionName": {"add": "new content only", "remove": "old content"},
  //       ...
  //     }
  //     Instructions:

  //     Do not repeat existing content: Only list under "add" content that is completely new and not already present in the SOW.
  //     Avoid duplicating bullet points: Verify that items listed under "add" are distinct from current content.
  //     Use bullet points (-) where possible.
  //     If only adding content, set "remove" to "". If only removing content, set "add" to "".
  //     Exclude sections with no changes.
  //     Generate a concise response, free of any redundant, duplicate, or conflicting entries.
  //     `;

  //     const scopeResponse = await this.agentServiceRequest.sendAgentRequest(
  //       scopeUpdatePrompt,
  //       'Return the scope-based SOW updates in JSON format.',
  //       {
  //         provider: 'openai',
  //         model: 'gpt-4o-mini',
  //         temperature: 0.7,
  //         maxTokens: 4096,
  //         frequencyPenalty: 0,
  //         presencePenalty: 0,
  //       },
  //       instanceName,
  //       userId,
  //     );

  //     const scopeUpdates = this.cleanAndParseJson(
  //       scopeResponse.messageContent?.content || '{}',
  //     );

  //     // Step 3b: Timeline Analysis Update
  //     const timelineUpdatePrompt = `
  //       Update the relevant sections of the Statement of Work (SOW) based on the timeline analysis. Only return sections with changes.

  //       Timeline Analysis: ${pageContent.timelineAnalysis}
  //       Existing SOW: ${existingSowContent}

  //       Return a JSON object with only the changes:

  //       {
  //         "sectionName": {"add": "new content only", "remove": "old content"},
  //         ...
  //       }
  //       Instructions:

  //       Do not repeat existing content: Only list under "add" content that is completely new and not already present in the SOW.
  //       Avoid duplicating bullet points: Verify that items listed under "add" are distinct from current content.
  //       Use bullet points (-) where possible.
  //       If only adding content, set "remove" to "". If only removing content, set "add" to "".
  //       Exclude sections with no changes.
  //       Generate a concise response, free of any redundant, duplicate, or conflicting entries.
  //       If there is no Timeline and Milestones section in the SOW, add it with the new content.

  //     `;

  //     const timelineResponse = await this.agentServiceRequest.sendAgentRequest(
  //       timelineUpdatePrompt,
  //       'Return the timeline-based SOW updates in JSON format.',
  //       {
  //         provider: 'openai',
  //         model: 'gpt-4o-mini',
  //         temperature: 0.7,
  //         maxTokens: 4096,
  //         frequencyPenalty: 0,
  //         presencePenalty: 0,
  //       },
  //       instanceName,
  //       userId,
  //     );

  //     const timelineUpdates = this.cleanAndParseJson(
  //       timelineResponse.messageContent?.content || '{}',
  //     );

  //     // Step 4: Merge scope and timeline updates
  //     const allUpdates = { ...scopeUpdates, ...timelineUpdates };
  //     // Bonus: Post updates to database
  //     await this.contentAssetsService.saveDocumentAsset(
  //       'SOWDelta',
  //       'json',
  //       'SOWDelta',
  //       '',
  //       JSON.stringify(allUpdates),
  //       projectName,
  //       instanceName,
  //       userId,
  //     );
  //     for (const [section, changes] of Object.entries(allUpdates) as [
  //       string,
  //       { add?: string; remove?: string; update?: string },
  //     ][]) {
  //       if (!sowSections[section]) {
  //         sowSections[section] = ''; // Initialize the section if it doesn't exist
  //       }

  //       // Handle "add" changes
  //       if (changes.add) {
  //         const addLines = changes.add
  //           .split('\n')
  //           .map((line) => `Add: ${line}`)
  //           .join('\n');
  //         sowSections[section] += `\n${addLines}`;
  //       }

  //       // Handle "remove" changes
  //       if (changes.remove) {
  //         const removeLines = changes.remove
  //           .split('\n')
  //           .map((line) => `Remove: ${line}`)
  //           .join('\n');
  //         sowSections[section] += `\n${removeLines}`;
  //       }
  //     }
  //     // Step 5: Reassemble the SOW
  //     const sectionOrder = [
  //       'Project Overview',
  //       'Project Objectives',
  //       'Key Challenges',
  //       'Project Scope',
  //       'Roles and Responsibilities',
  //       'Desired Deliverables',
  //       'Timeline and Milestones',
  //     ];

  //     let finalSowContent = '**Statement of Work (SOW)**\n\n';
  //     for (const section of sectionOrder) {
  //       if (sowSections[section]) {
  //         finalSowContent += `## **${section}**\n${sowSections[section]}\n\n`;
  //       }
  //     }
  //     this.logger.log(
  //       `Successfully generated updated SOW for project ${pageName}`,
  //     );
  //     return finalSowContent;
  //     // // Step 3: Generate Updated SOW Document
  //     // const combinedMeetingAnalysis = `
  //     //   Scope Analysis:
  //     //   ${scopeAnalysis}

  //     //   Timeline Analysis:
  //     //   ${timelineAnalysis}
  //     // `;

  //     // const sowUpdatePrompt = `
  //     // Update the Statement of Work (SOW) based on recent project insights. Only return sections with changes.

  //     // Meeting Summary: ${combinedMeetingAnalysis}
  //     // Existing SOW: ${existingSowContent}

  //     // Return a JSON of the format:
  //     // {
  //     //   sectionName : {"add": "new content", "remove": "old content"},
  //     //   ...
  //     // }

  //     // If sections have no changes, omit them or state "no change".
  //     // `;

  //     // this.logger.log(`Generating updated SOW based on meeting analysis`);
  //     // // Step 1: Send prompt to LLM
  //     // const sowResponse = await this.agentServiceRequest.sendAgentRequest(
  //     //   sowUpdatePrompt,
  //     //   'Return the updated SOW content only without any other comments.',
  //     //   {
  //     //     provider: 'openai',
  //     //     model: 'gpt-4o-mini',
  //     //     temperature: 0.7,
  //     //     maxTokens: 4096,
  //     //     frequencyPenalty: 0,
  //     //     presencePenalty: 0,
  //     //   },
  //     //   instanceName,
  //     //   userId,
  //     // );
  //     // const updatedSowContent = sowResponse.messageContent?.content;
  //     // if (!updatedSowContent) {
  //     //   this.logger.warn('No updates detected in SOW');
  //     //   return existingSowContent;
  //     // }
  //     // // Step 1: Clean and parse the JSON response
  //     // const parsedUpdate = this.cleanAndParseJson(updatedSowContent);

  //     // // Step 3: Apply updates to existing sections or add new sections
  //     // for (const [section, changes] of Object.entries(parsedUpdate) as [
  //     //   string,
  //     //   { add?: string; remove?: string; update?: string },
  //     // ][]) {
  //     //   if (sowSections[section]) {
  //     //     // Existing section: apply add/remove logic
  //     //     if (changes.add) sowSections[section] += ` ${changes.add}`;
  //     //     if (changes.remove)
  //     //       sowSections[section] = sowSections[section].replace(
  //     //         changes.remove,
  //     //         '',
  //     //       );
  //     //     if (changes.update) sowSections[section] = changes.update;
  //     //   } else {
  //     //     // New section: add it entirely
  //     //     sowSections[section] = changes.add || changes.update || '';
  //     //   }
  //     // }
  //     // // Step 4: Reassemble the final SOW content
  //     // const sectionOrder = [
  //     //   'Project Overview',
  //     //   'Project Objectives',
  //     //   'Key Challenges',
  //     //   'Project Scope',
  //     //   'Desired Deliverables',
  //     //   'Timeline and Milestones',
  //     // ];

  //     // let finalSowContent = '**Statement of Work (SOW)**\n\n';
  //     // for (const section of sectionOrder) {
  //     //   if (sowSections[section]) {
  //     //     finalSowContent += `## **${section}**\n${sowSections[section]}\n\n`;
  //     //   }
  //     // }
  //     // this.logger.log(
  //     //   `Successfully generated updated SOW for project ${pageName}`,
  //     // );
  //     // return finalSowContent;

  //     // // Step 2: Parse the LLM response to extract only updated sections
  //     // const updatedSections = await this.sowSectionService.splitSowIntoSections(
  //     //   instanceName,
  //     //   userId,
  //     //   updatedSowContent,
  //     // );
  //     // // Step 3: Replace the relevant sections with updated content
  //     // for (const section in updatedSections) {
  //     //   if (
  //     //     updatedSections[section] &&
  //     //     updatedSections[section] !== 'no change'
  //     //   ) {
  //     //     sowSections[section] = updatedSections[section];
  //     //   }
  //     // }
  //     // // Step 4: Reassemble the SOW
  //     // const sectionOrder = [
  //     //   'Project Overview',
  //     //   'Project Objectives and Key Challenges',
  //     //   'Project Scope',
  //     //   'Desired Deliverables',
  //     //   'Timeline and Milestones',
  //     // ];
  //     // let finalSowContent = '**Statement of Work (SOW)**\n\n';

  //     // for (const section of sectionOrder) {
  //     //   if (sowSections[section]) {
  //     //     finalSowContent += `## **${section}**\n${sowSections[section]}\n\n`;
  //     //   }
  //     // }

  //     // this.logger.log(
  //     //   `Successfully generated updated SOW for project ${pageName}`,
  //     // );
  //     // return finalSowContent;
  //   } catch (error) {
  //     this.logger.error(`Error in updating SOW: ${error.message}`);
  //     throw new Error('Failed to update SOW');
  //   }
  // }
  async updateSow(
    instanceName: string,
    userId: string,
    projectName: string,
    documentId: string, // Pass the Google Doc ID
    pageContent: any,
    pageName: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Received request to update SOW with document ID: ${documentId}`,
      );
      // Step 1: Retrieve SOW sections based on headers
      const sowSections =
        await this.googleDocService.getDocumentSections(documentId);
      this.logger.debug(
        `Retrieved SOW sections: ${JSON.stringify(sowSections)}`,
      );

      // Extract relevant sections
      const projectObjectives = sowSections['Project Objectives'];
      const projectScope = sowSections['Project Scope'];
      const desiredDeliverables = sowSections['Desired Deliverables'];
      const projectTimeline = sowSections['Timeline and Milestones'];
      const keyChallenges = sowSections['Key Challenges'];

      // Step 2a: Generate Scope Analysis
      const scopeAnalysisPrompt = `
        You are collaborating with another consultant to assess the current state of an ongoing project following a recent client meeting. Focus on any shifts in project objectives, challenges, and scope based on the details provided:

        • Meeting Transcript: ${pageContent.transcript}
        • Project Objectives and Key Challenges: ${projectObjectives} & ${keyChallenges}
        • Project Scope: ${projectScope}
        • Consultant’s Input: ${pageContent.consultant_input}

        Address the following questions:
        - Has the project scope changed? If yes, how?
        - What key challenges have emerged or evolved?
        - Are there new dependencies or bottlenecks affecting project completion?

        For each question, if there is no change, state “no change”; if not discussed, state "not discussed."
      `;

      const scopeAnalysisResponse =
        await this.agentServiceRequest.sendAgentRequest(
          scopeAnalysisPrompt,
          'Return scope analysis based on the provided questions.',
          {
            provider: 'openai',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            maxTokens: 4096,
            frequencyPenalty: 0,
            presencePenalty: 0,
          },
          instanceName,
          userId,
        );

      const scopeAnalysis = scopeAnalysisResponse.messageContent?.content;
      if (!scopeAnalysis) {
        throw new Error('Failed to generate scope analysis');
      }

      // Step 2b: Generate Timeline Analysis
      const timelineAnalysisPrompt = `
        Based on recent client discussions, assess any changes or updates affecting the project timeline:
        • Current Action Items: ${pageContent.action_items}
        • Completed Action Items from Previous Call: ${pageContent.action_items_completed}
        • Desired Deliverables: ${desiredDeliverables}
        Current Timeline: ${projectTimeline}

        Answer the following:
        - Has the project end date changed?
        - Have interim milestones been adjusted?
        - Are there contingency plans for new risks?

        If there is no change, state “no change”; if not discussed, state "not discussed."
      `;

      const timelineAnalysisResponse =
        await this.agentServiceRequest.sendAgentRequest(
          timelineAnalysisPrompt,
          'Return timeline analysis based on the provided questions.',
          {
            provider: 'openai',
            model: 'gpt-4o-mini',
            temperature: 0.7,
            maxTokens: 4096,
            frequencyPenalty: 0,
            presencePenalty: 0,
          },
          instanceName,
          userId,
        );

      const timelineAnalysis = timelineAnalysisResponse.messageContent?.content;
      if (!timelineAnalysis) {
        throw new Error('Failed to generate timeline analysis');
      }

      // Step 3: Generate Updates Based on Analyses
      const scopeUpdatePrompt = `
      Update relevant sections of the Statement of Work (SOW) based on the scope analysis. Only return sections that require changes.

      Scope Analysis: ${pageContent.scopeAnalysis}
      Existing SOW: ${JSON.stringify(sowSections)}

      Return a JSON object with only the changes:

      {
        "sectionName": {"add": "new content only", "remove": "old content"},
        ...
      }
      Instructions:

      Do not repeat existing content: Only list under "add" content that is completely new and not already present in the SOW.
      Avoid duplicating bullet points: Verify that items listed under "add" are distinct from current content.
      Use bullet points (-) where possible.
      If only adding content, set "remove" to "". If only removing content, set "add" to "".
      Exclude sections with no changes.
      Generate a concise response, free of any redundant, duplicate, or conflicting entries.
      `;

      const scopeResponse = await this.agentServiceRequest.sendAgentRequest(
        scopeUpdatePrompt,
        'Return the scope-based SOW updates in JSON format.',
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          maxTokens: 4096,
          frequencyPenalty: 0,
          presencePenalty: 0,
        },
        instanceName,
        userId,
      );

      const scopeUpdates = this.cleanAndParseJson(
        scopeResponse.messageContent?.content || '{}',
      );

      const timelineUpdatePrompt = `
        Update the relevant sections of the Statement of Work (SOW) based on the timeline analysis. Only return sections with changes.

        Timeline Analysis: ${pageContent.timelineAnalysis}
        Existing SOW: ${JSON.stringify(sowSections)}

        Return a JSON object with only the changes:

        {
          "sectionName": {"add": "new content only", "remove": "old content"},
          ...
        }
        Instructions:

        Do not repeat existing content: Only list under "add" content that is completely new and not already present in the SOW.
        Avoid duplicating bullet points: Verify that items listed under "add" are distinct from current content.
        Use bullet points (-) where possible.
        If only adding content, set "remove" to "". If only removing content, set "add" to "".
        Exclude sections with no changes.
        Generate a concise response, free of any redundant, duplicate, or conflicting entries.
        If there is no Timeline and Milestones section in the SOW, add it with the new content.

      `;

      const timelineResponse = await this.agentServiceRequest.sendAgentRequest(
        timelineUpdatePrompt,
        'Return the timeline-based SOW updates in JSON format.',
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          maxTokens: 4096,
          frequencyPenalty: 0,
          presencePenalty: 0,
        },
        instanceName,
        userId,
      );

      const timelineUpdates = this.cleanAndParseJson(
        timelineResponse.messageContent?.content || '{}',
      );

      // Step 4: Merge and Apply Updates
      const allUpdates = { ...scopeUpdates, ...timelineUpdates };

      // Optionally save the updates as an asset
      await this.contentAssetsService.saveDocumentAsset(
        'SOWDelta',
        'json',
        'SOWDelta',
        '',
        JSON.stringify(allUpdates),
        projectName,
        instanceName,
        userId,
      );

      // Step 5: Apply updates to the Google Doc
      await this.googleDocService.appendRecommendations(documentId, allUpdates);

      this.logger.log(`Successfully updated SOW for project ${pageName}`);
    } catch (error) {
      this.logger.error(`Error in updating SOW: ${error.message}`);
      throw new Error('Failed to update SOW');
    }
  }

  private cleanAndParseJson(output: string): any {
    try {
      const sanitizedOutput = output.replace(/```json|```/g, '').trim();
      return JSON.parse(sanitizedOutput);
    } catch (error) {
      this.logger.error(`Failed to parse JSON: ${error.message}`);
      throw new Error('Invalid JSON format received from LLM');
    }
  }
}
