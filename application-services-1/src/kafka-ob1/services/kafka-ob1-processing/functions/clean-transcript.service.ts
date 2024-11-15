import { Injectable, Logger } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';

@Injectable()
export class CleanTranscriptService {
  private readonly logger = new Logger(CleanTranscriptService.name);

  constructor(private readonly agentServiceRequest: AgentServiceRequest) {}

  async cleanTranscript(
    transcript: string,
    instanceName: string,
    userId: string,
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
      maxTokens: 4096,
      frequencyPenalty: 0,
      presencePenalty: 0,
    };
    try {
      const response = await this.agentServiceRequest.sendAgentRequest(
        systemPrompt,
        transcriptWithoutTimestamps,
        config,
        instanceName,
        userId,
      );

      const cleanedTranscript = response.messageContent.content;
      this.logger.log('Transcript cleaned successfully');
      return cleanedTranscript;
    } catch (error) {
      this.logger.error(
        `Error cleaning transcript: ${error.message}`,
        error.stack,
      );
      // Split transcript if error occurs and length exceeds threshold
      const tokenThreshold = 2000;
      if (transcriptWithoutTimestamps.length > tokenThreshold) {
        this.logger.warn(
          'Transcript exceeds token limit, splitting into parts.',
        );
        const midPoint = Math.floor(transcriptWithoutTimestamps.length / 2);

        const firstHalf = transcriptWithoutTimestamps.slice(0, midPoint);
        const secondHalf = transcriptWithoutTimestamps.slice(midPoint);

        const newSystemPrompt = `Initial transcript was too long, this is only half. Please feel free to remove irrelevant or redundant content and use summarization where you believe it will decrease the size of the clean transcript without missing any important details about the project discussed.${systemPrompt}`;

        try {
          const firstHalfResponse =
            await this.agentServiceRequest.sendAgentRequest(
              newSystemPrompt,
              firstHalf,
              config,
              instanceName,
              userId,
            );

          const secondHalfResponse =
            await this.agentServiceRequest.sendAgentRequest(
              newSystemPrompt,
              secondHalf,
              config,
              instanceName,
              userId,
            );

          const combinedTranscript = `${firstHalfResponse.messageContent.content}
${secondHalfResponse.messageContent.content}`;
          this.logger.log('Transcript cleaned successfully after splitting');
          return combinedTranscript;
        } catch (splitError) {
          this.logger.error(
            `Error cleaning split transcript parts: ${splitError.message}`,
            splitError.stack,
          );
          throw new Error('Failed to clean transcript after splitting');
        }
      }
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
    return transcriptWithoutTimestamps;
  }
}
