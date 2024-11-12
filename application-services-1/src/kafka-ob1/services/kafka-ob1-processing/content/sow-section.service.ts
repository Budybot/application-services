import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SowSectionService {
  private readonly logger = new Logger(SowSectionService.name);

  constructor() {}

  // Function to split SOW document into sections
  async splitSowIntoSections(
    instanceName: string,
    userId: string,
    sowContent: string,
  ): Promise<Record<string, string>> {
    try {
      // Define the expected section headers
      const sections = [
        'Project Overview',
        'Project Objectives',
        'Key Challenges',
        'Project Scope',
        'Roles and Responsibilities',
        'Desired Deliverables',
        'Timeline and Milestones',
      ];

      // Regular expression to match each section and capture its content
      const sectionRegex = new RegExp(
        `## \\*\\*(${sections.join('|')})\\*\\*\\s*\\n+([\\s\\S]*?)(?=\\n## \\*\\*|$)`,
        'g',
      );

      const sectionsMap: Record<string, string> = {};
      let match;

      // Extract each section's content
      while ((match = sectionRegex.exec(sowContent)) !== null) {
        const sectionTitle = match[1];
        const sectionContent = match[2].trim();
        sectionsMap[sectionTitle] = sectionContent;
      }

      // Ensure all sections are present in the output, even if empty
      sections.forEach((section) => {
        if (!sectionsMap[section]) {
          sectionsMap[section] = ''; // Assign empty string if section is missing
        }
      });

      this.logger.log('Successfully split SOW into sections:');
      this.logger.log(sectionsMap);
      return sectionsMap;
    } catch (error) {
      this.logger.error(`Error splitting SOW into sections: ${error.message}`);
      throw new Error('Failed to split SOW into sections');
    }
  }
}
