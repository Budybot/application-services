import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class GetParticipantsService {
  private readonly logger = new Logger(GetParticipantsService.name);

  async extractParticipants(transcript: string): Promise<any> {
    try {
      this.logger.log('Extracting participants from transcript...');
      // Logic to extract participants from the transcript
      const participants = {};
      const participantNames = new Set<string>();
      const lines = transcript.split('\n');

      let userCount = 1;
      for (const line of lines) {
        const match = line.match(/^(.+?):\s/);
        if (match) {
          const name = match[1].trim();
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