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

    // Create a form JSON based on the new structure
    const formJson = {
      consultant_role: userRoles?.user1?.role || 'test',
      consultant_name: userRoles?.user1?.name || 'test',
      primary_client_name: userRoles?.user2?.name || 'test',
      primary_client_role: userRoles?.user2?.role || 'test',
      DD: [
        "desired deliverable item 1",
        "desired deliverable item 2",
        "desired deliverable item 3",
      ],
      KC1: [
        "key challenge item 1",
        "key challenge item 2",
        "key challenge item 3",
      ],
      KC2: [
        "key problem item 1",
        "key problem item 2",
        "key problem item 3",
      ],
      action_items: action_items || [],
      meeting_slots: '',
      consultant_input: consultant_input || '',
      project_type: "Digital transformation Consulting",
      PO: [
        "objective item 1",
        "objective item 2",
        "objective item 3",
      ],
      company_name: "McDonalds",
    };

    this.logger.log(
      `Form JSON successfully generated for project ${projectName} by user ${userId}`,
    );
    this.logger.debug(formJson);
    return formJson;
  }
}
