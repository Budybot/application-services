import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class LlmFormGenerationService {
  private readonly logger = new Logger(LlmFormGenerationService.name);

  constructor() {}

  async generateFormJsonFromPageData(
    pageData: any,
    userId: string,
    projectName: string,
  ): Promise<any> {
    // Validate required fields in pageData
    const {
      transcript,
      consultant_input,
      project_description,
      userRoles,
      action_items,
    } = pageData;

    if (!transcript) {
      this.logger.warn('Transcript is missing from page data.');
    }
    if (!consultant_input) {
      this.logger.warn('Consultant input is missing from page data.');
    }
    if (!project_description) {
      this.logger.warn('Project description is missing from page data.');
    }
    if (!userRoles) {
      this.logger.warn('User roles are missing from page data.');
    }
    if (!action_items) {
      this.logger.warn('Action items are missing from page data.');
    }

    // Create a form JSON template based on the provided JSON structure
    const formJson = {
      company_name: "Budy",
      PO: [
        {
          objective: "Enhance customer data accuracy across all platforms",
          description: "Establish protocols for data cleansing and validation to ensure consistency across customer touchpoints."
        },
        {
          objective: "Increase system integration",
          options: ["Increase system integration", "Improve data quality", "Optimize user experience"],
          description: "Integrate with external systems to provide seamless access to customer data for all users."
        }
      ],
      DD: [
        {
          goal: "Integrate seamless data flow across departments.",
          description: "Establish a robust pipeline to reduce redundancy and improve data accuracy."
        },
        {
          goal: "Real-time analytics dashboard",
          options: ["Real-time analytics dashboard", "Customer insights portal", "Salesforce integration"],
          description: "Develop a dashboard that provides key performance metrics and real-time insights."
        }
      ],
      KC1: [
        {
          challenge: "Data inconsistencies",
          options: ["Data inconsistencies", "Lack of technical resources", "System compatibility issues"],
          details: "Data is inconsistently formatted across platforms, causing integration issues."
        },
        {
          challenge: "Limited access to technical resources",
          options: ["Data inconsistencies", "Limited access to technical resources", "System compatibility issues"],
          details: "The project team lacks sufficient skilled personnel for timely development and troubleshooting."
        }
      ],
      KC2: [
        {
          cause: "Lack of data standardization",
          options: ["Lack of data standardization", "Legacy software limitations", "Inadequate documentation"],
          description: "Different data formats and conventions across systems complicate the integration."
        },
        {
          cause: "Legacy software limitations",
          options: ["Lack of data standardization", "Legacy software limitations", "Inadequate documentation"],
          description: "The project is limited by outdated systems, which hinder seamless integration."
        }
      ]
    };

    this.logger.log(
      `Form JSON successfully generated for project ${projectName} by user ${userId}`,
    );
    return formJson;
  }
}