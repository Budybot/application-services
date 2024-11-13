import { Injectable, Logger } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';

@Injectable()
export class ProjectPlannerService {
  private readonly logger = new Logger(ProjectPlannerService.name);

  constructor(private readonly agentServiceRequest: AgentServiceRequest) {}

  templates = {
    deduplication: {
      keywords: ['deduplication', 'duplicate entries'],
      template:
        'Task 1. Check for duplicate entries in the database. Task 2. Remove duplicates from the database.',
    },
    data_cleaning: {
      keywords: ['data cleaning', 'clean data'],
      template:
        'Task 1. Clean the data by removing unnecessary columns. Task 2. Standardize the data format.',
    },
    report_building: {
      keywords: ['report building', 'build a report', 'generate reports'],
      template:
        'Task 1. Generate a report template. Task 2. Populate the template with data.',
    },
  };
  // private parseOutputTo2DArray(output: string): string[][] {
  //   // Attempt to parse as JSON
  //   try {
  //     const parsedOutput = JSON.parse(output);
  //     if (Array.isArray(parsedOutput)) {
  //       // If parsed successfully and is an array, return as is
  //       return parsedOutput as string[][];
  //     }
  //   } catch {
  //     // Not a valid JSON format, proceed to manual parsing
  //   }

  //   // Fallback manual parsing in case it's not JSON
  //   const rows = output
  //     .replace(/^\s*[\[\]]\s*$/gm, '') // Remove stray brackets at line starts/ends
  //     .trim()
  //     .split(/\r?\n/);
  //   const result: string[][] = [];
  //   for (const row of rows) {
  //     const cells = row
  //       .split(/\s*"\s*,\s*"\s*/) // Split by comma or space after removing extra spaces
  //       .map((cell) => cell.replace(/^"|"$/g, '').trim()); // Remove any leading or trailing quotes and spaces
  //     if (cells.length > 0) result.push(cells);
  //   }
  //   return result;
  // }

  private parseOutputTo2DArray(output: string): string[][] {
    // Remove code block delimiters and any extra symbols
    output = output
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

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
      actionItems: action_items
        .map(
          (item: { text: string; priority: string }) =>
            `${item.text} (Priority: ${item.priority})`,
        )
        .join(', '),
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
    let systemPrompt = `
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

    ### Example Output:
  
    [
      ["Task ID", "Task Name", "Dependency", "Description"],
      ["1", "Discovery", "", "Conduct initial meetings and research"],
      ["1.1", "Stakeholder Interviews", "1", "Interview key stakeholders"],
      ["1.2", "Requirements Gathering", "1.1", "Gather requirements from discussions"],
      ["2", "Definition", "1", "Define project scope and objectives"],
      ["2.1", "Scope Definition", "2", "Outline project scope and boundaries"]
    ]
  
    Guidelines:
    - Each row represents a task with consistent column structure.
    - Ensure milestone tasks and execution steps are logically sequenced.
    - Output in plain text with no additional formatting or symbols.
  
    Generate the table with tasks and steps based on the details provided above.
  `;
    // Check for specific keywords to use predefined templates
    const keywords = [
      ...this.templates.deduplication.keywords,
      ...this.templates.data_cleaning.keywords,
      ...this.templates.report_building.keywords,
    ];
    const desiredDeliverables = plannerDetails.desiredDeliverables || '';
    this.logger.debug(`Desired Deliverables: ${desiredDeliverables}`);
    const foundKeywords = keywords.filter((keyword) =>
      plannerDetails.desiredDeliverables
        .toLowerCase()
        .includes(keyword.toLowerCase()),
    );

    if (foundKeywords.length > 0) {
      this.logger.debug(
        `Using predefined template for keyword: ${foundKeywords[0]}`,
      );
      // Find the template for the first keyword match
      const matchedTemplate = Object.values(this.templates).find((template) =>
        template.keywords.some(
          (templateKeyword) =>
            templateKeyword.toLowerCase() === foundKeywords[0].toLowerCase(),
        ),
      );
      if (matchedTemplate) {
        this.logger.debug(`Matched template: ${matchedTemplate.template}`);
        systemPrompt += `For the ${foundKeywords[0]} deliverable, you need to structure the plan in the following way:\n`;
        systemPrompt += matchedTemplate.template;
      }
    }

    const config = {
      provider: 'openai',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 1500,
      frequencyPenalty: 0,
      presencePenalty: 0,
    };

    try {
      // this.logger.log(
      //   'Requesting Project Plan generation from AgentServiceRequest...',
      // );
      const response = await this.agentServiceRequest.sendAgentRequest(
        systemPrompt,
        'Ensure the response is in valid JSON format.',
        config,
        instanceName,
        userId,
      );

      if (response?.messageContent?.content) {
        const generatedPlan = response.messageContent.content;
        // this.logger.debug(`Generated Project Plan from LLM: ${generatedPlan}`);
        // const parsedData = this.parseCsvToArray(generatedPlan);
        const parsedData = this.parseOutputTo2DArray(generatedPlan);
        this.logger.debug(
          `Parsed Project Plan into 2D array format: ${JSON.stringify(parsedData)}`,
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
}
