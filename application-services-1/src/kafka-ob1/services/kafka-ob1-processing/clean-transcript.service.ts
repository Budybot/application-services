import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CleanTranscriptService {
  private readonly logger = new Logger(CleanTranscriptService.name);

  async cleanTranscript(transcript: string): Promise<string> {
    try {
      this.logger.log('Cleaning transcript...');
      // Add logic to clean transcript here
      // Example: Removing filler words, irrelevant content, etc.
      const cleanedTranscript = transcript
        .replace(/\b(um|uh|you know|like)\b/g, '')
        .trim();

      this.logger.log('Transcript cleaned successfully');
      return cleanedTranscript;
    } catch (error) {
      this.logger.error(
        `Error cleaning transcript: ${error.message}`,
        error.stack,
      );
      throw new Error('Failed to clean transcript');
    }
  }
}