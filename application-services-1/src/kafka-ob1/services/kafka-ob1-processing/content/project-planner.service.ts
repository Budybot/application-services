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

    const systemPrompt = `
      You are a project planning assistant, using specific details from the project to generate a structured CSV task plan.

      Project Overview:
      This project, led by ${plannerDetails.consultantName}, ${plannerDetails.consultantRole}, is focused on delivering a ${plannerDetails.projectType} solution for ${plannerDetails.companyName}. Key takeaways from discussions with the client, ${plannerDetails.clientName}, ${plannerDetails.clientRole}, include ${plannerDetails.keyTakeaway1} and ${plannerDetails.keyTakeaway2}. The primary objectives are outlined as ${plannerDetails.projectObjectives}, with deliverables defined in ${plannerDetails.desiredDeliverables}. Action items identified include ${plannerDetails.actionItems}.

      Use this context to break down the project into milestone tasks and execution steps.

      Guidelines for Project Plan Structure:
      Milestone Tasks (e.g., 1, 2, 3): Major phases in the project, like Discovery, Definition, and Implementation.
      Execution Steps (e.g., 1.1, 1.2): Detailed, actionable steps to complete each milestone task.
      
      CSV Format and Columns:
      Task ID: Sequentially numbered tasks, with decimal notation for execution steps under each milestone.
      Task Name: Descriptive name for each task.
      Dependency: Previous Task ID for logical flow.
      Description: Detailed description of the task.
      Action on Completion: Next step or milestone upon completion of each task.

      Guidelines:
      Exhaustive Breakdown: Ensure every milestone task has corresponding execution steps that fully capture all necessary actions.
      Dependencies: List dependencies to indicate task progression and conditions for moving to subsequent steps.

      Using these details, create a comprehensive CSV of milestone tasks and execution steps that captures each phase and action required to complete the project.
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
        'Only return the CSV format of the project plan',
        config,
        instanceName,
        userId,
      );

      if (response?.messageContent?.content) {
        const generatedPlan = response.messageContent.content;
        this.logger.debug(`Generated Project Plan CSV: ${generatedPlan}`);
        const parsedData = this.parseCsvToArray(generatedPlan);
        this.logger.debug(
          `Parsed Project Plan into 2D array format: ${JSON.stringify(parsedData)}`,
        );

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
  parseCsvToArray(csvData: string): string[][] {
    const rows = csvData.split(/\r?\n/);
    const result: string[][] = [];

    for (const row of rows) {
      const values: string[] = [];
      let current = '';
      let insideQuotes = false;

      for (let i = 0; i < row.length; i++) {
        const char = row[i];

        if (char === '"') {
          // Toggle insideQuotes when encountering a quote
          insideQuotes = !insideQuotes;
        } else if (char === ',' && !insideQuotes) {
          // If we’re outside quotes and see a comma, push the value
          values.push(current);
          current = '';
        } else {
          // Otherwise, add the character to the current cell value
          current += char;
        }
      }
      values.push(current); // Add the last value in the row
      result.push(values);
    }

    this.logger.log(
      `Parsed CSV into 2D array format: ${JSON.stringify(result)}`,
    );
    return result;
  }

}
