import { Injectable, Logger } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';

@Injectable()
export class ProjectPlannerService {
  private readonly logger = new Logger(ProjectPlannerService.name);

  constructor(private readonly agentServiceRequest: AgentServiceRequest) {}

  async generateProjectPlan(
    instanceName: string,
    userId: string,
    plannerData: any,
  ): Promise<string[][]> {
    // Extract fields from plannerData
    const {
      consultant_name,
      consultant_role,
      project_type,
      company_name,
      primary_client_name,
      primary_client_role,
      KC1,
      KC2,
      PO,
      DD,
      action_items,
    } = plannerData;

    const plannerDetails = {
      consultantName: consultant_name,
      consultantRole: consultant_role,
      projectType: project_type,
      companyName: company_name,
      clientName: primary_client_name,
      clientRole: primary_client_role,
      keyTakeaway1: KC1.join(', '),
      keyTakeaway2: KC2.join(', '),
      projectObjectives: PO.join(', '),
      desiredDeliverables: DD.join(', '),
      actionItems: Object.values(action_items).join(', '),
    };

    // const systemPrompt = `
    //   You are a project planning assistant, using specific details from the project to generate a structured CSV task plan.

    //   Project Overview:
    //   This project, led by ${plannerDetails.consultantName}, ${plannerDetails.consultantRole}, is focused on delivering a ${plannerDetails.projectType} solution for ${plannerDetails.companyName}. Key takeaways from discussions with the client, ${plannerDetails.clientName}, ${plannerDetails.clientRole}, include ${plannerDetails.keyTakeaway1} and ${plannerDetails.keyTakeaway2}. The primary objectives are outlined as ${plannerDetails.projectObjectives}, with deliverables defined in ${plannerDetails.desiredDeliverables}. Action items identified include ${plannerDetails.actionItems}.

    //   Use this context to break down the project into milestone tasks and execution steps.

    //   Guidelines for Project Plan Structure:
    //   Milestone Tasks (e.g., 1, 2, 3): Major phases in the project, like Discovery, Definition, and Implementation.
    //   Execution Steps (e.g., 1.1, 1.2): Detailed, actionable steps to complete each milestone task.
      
    //   CSV Format and Columns:
    //   Task ID: Sequentially numbered tasks, with decimal notation for execution steps under each milestone.
    //   Task Name: Descriptive name for each task.
    //   Dependency: Previous Task ID for logical flow.
    //   Description: Detailed description of the task.
    //   Action on Completion: Next step or milestone upon completion of each task.

    //   Guidelines:
    //   Exhaustive Breakdown: Ensure every milestone task has corresponding execution steps that fully capture all necessary actions.
    //   Dependencies: List dependencies to indicate task progression and conditions for moving to subsequent steps.

    //   Using these details, create a comprehensive CSV of milestone tasks and execution steps that captures each phase and action required to complete the project.
    // `;
    const systemPrompt = `
    You are a project planning assistant, using specific details from the project to generate a structured table of tasks and steps.
  
    Project Overview:
    This project, led by ${plannerDetails.consultantName}, ${plannerDetails.consultantRole}, is focused on delivering a ${plannerDetails.projectType} solution for ${plannerDetails.companyName}. Key takeaways from discussions with the client, ${plannerDetails.clientName}, ${plannerDetails.clientRole}, include ${plannerDetails.keyTakeaway1} and ${plannerDetails.keyTakeaway2}. The primary objectives are outlined as ${plannerDetails.projectObjectives}, with deliverables defined in ${plannerDetails.desiredDeliverables}. Action items identified include ${plannerDetails.actionItems}.
  
    Use this context to break down the project into milestone tasks and execution steps.
  
    Guidelines for Project Plan Structure:
    - **Milestone Tasks**: Major phases in the project, like Discovery, Definition, and Implementation. Each should be numbered (e.g., 1, 2, 3).
    - **Execution Steps**: Detailed, actionable steps to complete each milestone task, numbered hierarchically under each milestone (e.g., 1.1, 1.2).
  
    Output Format:
    Please output the table as an array structure with no commas or special characters. Each row should be a list of cells, separated by a newline. The columns should be structured as follows:
  
    - **Task ID**: Sequential task IDs, using decimal notation for execution steps (e.g., 1, 1.1).
    - **Task Name**: Descriptive name for each task.
    - **Dependency**: ID of the previous task in the sequence.
    - **Description**: Detailed task description.
    - **Action on Completion**: Next step or milestone upon completion.
  
    ### Example Output:
  
    [
      ["Task ID", "Task Name", "Dependency", "Description", "Action on Completion"],
      ["1", "Discovery", "", "Conduct initial meetings and research", "Proceed to Definition"],
      ["1.1", "Stakeholder Interviews", "1", "Interview key stakeholders", "Document findings"],
      ["1.2", "Requirements Gathering", "1.1", "Gather requirements from discussions", "Compile requirements document"],
      ["2", "Definition", "1", "Define project scope and objectives", "Proceed to Implementation"],
      ["2.1", "Scope Definition", "2", "Outline project scope and boundaries", "Finalize scope document"]
    ]
  
    Guidelines:
    - Each row represents a task with consistent column structure.
    - Ensure milestone tasks and execution steps are logically sequenced.
    - Output in plain text with no additional formatting or symbols.
  
    Generate the table with tasks and steps based on the details provided above.
  `;
    const config = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 1500,
      frequencyPenalty: 0,
      presencePenalty: 0,
    };

    try {
      this.logger.log(
        'Requesting Project Plan generation from AgentServiceRequest...',
      );
      const response = await this.agentServiceRequest.sendAgentRequest(
        systemPrompt,
        'Ensure the response is in valid JSON format.',
        config,
        instanceName,
        userId,
      );

      if (response?.messageContent?.content) {
        const generatedPlan = response.messageContent.content;
        this.logger.debug(`Generated Project Plan from LLM: ${generatedPlan}`);
        // const parsedData = this.parseCsvToArray(generatedPlan);
        const parsedData = this.parseOutputTo2DArray(generatedPlan);
        this.logger.debug(
          `Parsed Project Plan into 2D array format: ${JSON.stringify(parsedData)}`,
            // `Parsed Project Plan into 2D array format: ${JSON.stringify(generatedPlan)}`,
        );
        // return generatedPlan; 
        return parsedData;
      } else {
        throw new Error(`Invalid response: ${JSON.stringify(response)}`);
      }
    } catch (error) {
      this.logger.error(
        `Error generating Project Plan: ${error.message}`,
        error.stack,
      );
      throw new Error('Failed to generate Project Plan');
    }
  }

  private parseOutputTo2DArray(output: string): string[][] {
    // Attempt to parse as JSON
    try {
      const parsedOutput = JSON.parse(output);
      if (Array.isArray(parsedOutput)) {
        // If parsed successfully and is an array, return as is
        return parsedOutput as string[][];
      }
    } catch {
      // Not a valid JSON format, proceed to manual parsing
    }

    // Fallback manual parsing in case it's not JSON
    const rows = output
      .replace(/^\s*[\[\]]\s*$/gm, '') // Remove stray brackets at line starts/ends
      .trim()
      .split(/\r?\n/); 
    const result: string[][] = [];
    for (const row of rows) {
      const cells = row
        .split(/\s*"\s*,\s*"\s*/) // Split by comma or space after removing extra spaces
        .map((cell) => cell.replace(/^"|"$/g, '').trim()); // Remove any leading or trailing quotes and spaces
      if (cells.length > 0) result.push(cells);
    }
    return result;
  }
//   parseCsvToArray(csvData: string): string[][] {
//     const cleanedCsvData = csvData
//       .replace(/```csv|```/g, '') // Remove specific markers
//       .trim(); // Remove any leading or trailing whitespace
//     const rows = cleanedCsvData.split(/\r?\n/);
//     const result: string[][] = [];

//     for (const row of rows) {
//       const values: string[] = [];
//       let current = '';
//       let insideQuotes = false;

//       for (let i = 0; i < row.length; i++) {
//         const char = row[i];

//         if (char === '"') {
//           insideQuotes = !insideQuotes;
//         } else if (char === ',' && !insideQuotes) {
//           values.push(current.trim()); // Trim each value to remove extra whitespace
//           current = '';
//         } else {
//           current += char;
//         }
//       }
//       values.push(current.trim()); // Add the last value in the row

//       // Only add non-empty rows that don't have empty strings as values
//       if (values.filter((val) => val !== '').length === values.length) {
//         result.push(values);
//       }
//     }

//     this.logger.log(
//       `Parsed CSV into 2D array format: ${JSON.stringify(result)}`,
//     );
//     return result;
//   }
}
