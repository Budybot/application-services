import { Injectable, Logger } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';

@Injectable()
export class CleanTranscriptService {
  private readonly logger = new Logger(CleanTranscriptService.name);

  constructor(private readonly agentServiceRequest: AgentServiceRequest) {}

  async cleanTranscript(
    transcript: string,
    userOrgId: string,
    personId: string,
  ): Promise<string> {
    const transcriptWithoutTimestamps = this.removeTimestamps(transcript);

    const systemPrompt = `
      You are an AI assistant tasked with cleaning up meeting transcripts by removing filler words and small talk, while preserving all relevant content and keeping the conversation's meaning intact. Each transcript is formatted with speaker names and dialogue (no timestamps needed). When editing the transcript, please remove the following:

      Filler words and verbal pauses (e.g., "um," "uh," "you know," "like," "I mean," "actually").
      Casual greetings and pleasantries at the very beginning or end of the conversation.
      Irrelevant side comments or off-topic remarks that do not pertain to the main discussion.
      Focus on retaining all the relevant content, ensuring that the main points of the conversation remain unchanged.

      Do not remove any sentences or phrases that contain important information or contribute to the discussion.

      Ensure that the cleaned transcript maintains the original structure with speaker names and dialogue, and is clear and easy to read. The goal is to provide a transcript that focuses on the important content of the meeting without unnecessary fillers or small talk.

      Only the cleaned transcript is required. Do not include any additional information or explanations.
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
      // this.logger.log(
      //   'Requesting cleaned transcript from AgentServiceRequest...',
      // );
      const response = await this.agentServiceRequest.sendAgentRequest(
        systemPrompt,
        transcriptWithoutTimestamps,
        config,
        userOrgId,
        personId,
      );

      const cleanedTranscript = response.messageContent.content;
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
  private removeTimestamps(transcript: string): string {
    this.logger.log('Removing timestamps from transcript...');
    // Regular expression to match timestamps in formats like 0:00 or 12:34
    const timestampRegex = /\b\d{1,2}:\d{2}\b/g;
    const transcriptWithoutTimestamps = transcript
      .replace(timestampRegex, '')
      .trim();
    // this.logger.debug(
    //   `Transcript without timestamps: ${transcriptWithoutTimestamps}`,
    // );
    return transcriptWithoutTimestamps;
  }
}
