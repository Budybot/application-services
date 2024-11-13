import { Injectable, Logger } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';

@Injectable()
export class GetParticipantsService {
  private readonly logger = new Logger(GetParticipantsService.name);

  constructor(private readonly agentServiceRequest: AgentServiceRequest) {}

  async extractParticipants(
    transcript: string,
    instanceName: string,
    userId: string,
  ): Promise<any> {
    try {
      this.logger.log('Extracting participants from transcript...');
      const participants = {};
      const participantNames = new Set<string>();

      // Use regex to match names followed by timestamps in the format <Name> <Timestamp>
      const regex = /(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+\d{1,2}:\d{2}/g;
      let userCount = 1;

      // Extract all name matches from the transcript
      let match;
      while ((match = regex.exec(transcript)) !== null) {
        const name = match[1].trim();

        // Add the name only if it hasn't been added before
        if (!participantNames.has(name)) {
          participantNames.add(name);
          participants[`user${userCount}`] = {
            name,
            role: 'Unknown', // Default role, can be updated as needed
            roletype: 'Unknown', // Default role type, can be updated as needed
          };
          userCount++;
        }
      }
      if (Object.keys(participants).length === 0) {
        this.logger.log(
          'No participants found, invoking LLM for participant extraction...',
        );

        // Define the prompt for the LLM
        const systemPrompt = `
          You are an AI assistant tasked with identifying participants in a meeting transcript. 
          Identify unique speaker names from the conversation, providing a suggested role and role type for each.
          Format the output as JSON, where each key is a unique participant (e.g., "user1", "user2"), and each value includes the name, role, and roletype.

          Example output:
          {
            "user1": {"name": "John Doe", "role": "Manager", "roletype": "Staff"},
            "user2": {"name": "Jane Smith", "role": "Consultant", "roletype": "External"}
          }
        `;

        const config = {
          provider: 'openai',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          maxTokens: 1000,
          frequencyPenalty: 0,
          presencePenalty: 0,
        };

        try {
          const response = await this.agentServiceRequest.sendAgentRequest(
            systemPrompt,
            transcript,
            config,
            instanceName,
            userId,
          );

          // Parse response and populate participants
          const extractedParticipants = this.cleanJsonResponse(
            response.messageContent.content,
          );
          Object.assign(participants, extractedParticipants);

          this.logger.log('Participants extracted via LLM successfully');
        } catch (error) {
          this.logger.error(
            `Error invoking LLM for participants extraction: ${error.message}`,
            error.stack,
          );
          throw new Error('Failed to extract participants');
        }
      } else {
        this.logger.log('Participants extracted successfully via regex');
      }
      this.logger.debug(
        `Extracted participants: ${JSON.stringify(participants)}`,
      );
      return participants;
    } catch (error) {
      this.logger.error(
        `Error extracting participants: ${error.message}`,
        error.stack,
      );
      throw new Error('Failed to extract participants');
    }
  }
  private cleanJsonResponse(responseContent: string): any {
    try {
      // Remove common non-JSON markers such as ```json or ```
      const cleanedContent = responseContent
        .replace(/```(?:json)?/g, '') // Remove ```json or ``` markers
        .replace(/[\r\n]+/g, '') // Remove new lines
        .replace(/,\s*}/g, '}') // Remove trailing commas in objects
        .replace(/,\s*]/g, ']'); // Remove trailing commas in arrays

      return JSON.parse(cleanedContent);
    } catch (error) {
      this.logger.error(
        `Error cleaning JSON response: ${error.message}`,
        error.stack,
      );
      throw new Error('Failed to clean JSON response');
    }
  }
}
