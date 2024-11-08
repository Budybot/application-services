import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class GetParticipantsService {
  private readonly logger = new Logger(GetParticipantsService.name);

  async extractParticipants(transcript: string): Promise<any> {
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

      this.logger.log('Participants extracted successfully');
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
}
