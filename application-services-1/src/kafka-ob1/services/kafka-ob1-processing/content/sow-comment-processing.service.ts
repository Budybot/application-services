
import { Injectable, Logger } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';

@Injectable()
export class SowCommentProcessingService {
  private readonly logger = new Logger(SowCommentProcessingService.name);

  constructor(private readonly agentServiceRequest: AgentServiceRequest) {}
  async generateBudyReply(
    instanceName: string,
    userId: string,
    commentData: any,
  ): Promise<string> {
    const { commentContent } = commentData;
    this.logger.debug(`Generating SOW for comment: ${commentContent}`);
    const systemPrompt = `
    You are an expert consultant tasked with expanding a Statement of Work (SOW) using a provided meeting transcript. You will focus on one statement at a time, expanding it with 1-3 concise, technical bullet points that clarify, explain, or provide additional context. Use the following guidelines:

    Primary Focus: Start with the SOW section content as your primary guide. Use the transcript for additional context or specific details when applicable. Use common sense for gaps or implied knowledge.

    Relevance and Brevity: Ensure each bullet point is highly relevant and avoids verbosity. Keep sentences simple and avoid unnecessary complexity or nesting.

    Bullet Point Style:

    If the statement describes a problem, explain or provide context for the problem.
    If the statement describes an objective or task, outline clear, relevant steps or technical details to expand on it.
    Use technical terminology aligned with the SOW and transcript whenever possible.
    Non-Redundancy: Do not repeat the main statement unless rephrasing it meaningfully expands on its context.

    Confidence-Driven Output: Only generate a bullet point if it is confidently useful and contributes meaningfully to the SOW. Avoid cluttering the document.

    Example 1:

    Given Statement:

    "Improve customer support response times."

    Expanded Bullet Points:

    Implement a priority queue system to ensure high-severity tickets are addressed first.
    Set strict time-based SLAs for ticket resolution and enforce escalation rules for overdue cases.

    Example 2:

    Given Statement:
    "Customer support suffers from inconsistent response times."

    Expanded Bullet Points:

    Response times vary significantly across channels, with emails taking up to 48 hours while live chat averages under 2 hours.
    High ticket volume during peak hours overwhelms support teams, leading to delayed responses and customer dissatisfaction.

    Transcript:

    "Shabin George  Progress. \n\nSamay Kohli  How are you? \n\nShabin George  It's a little hectic before Diwali. \n\nSamay Kohli  Is it work-related or just holiday preparations? \n\nShabin George  Holiday. Just want to complete tasks before people go on leave. \n\nSamay Kohli  Are customers affected as well? You have a significant business in India. \n\nShabin George  We have stopped all our events, and everything will resume post-Diwali. \n\nSamay Kohli  Got it. Your customers are primarily B2B? \n\nShabin George  Yes, mostly B2B. In India, we are leading in fintech. Almost all banks and many insurance companies are our clients. \n\nSamay Kohli  Understood. Congratulations on the seven-year anniversary and the new launch. \n\nShabin George  Thank you. \n\nSamay Kohli  Regarding the outage, we don't have clarity. We received an email saying access was limited, but we only used it five days ago and typically don't exceed the request limit. I'm hoping this issue gets resolved. We’ve disabled all automated access for now. \n\nShabin George  I think the issue is resolved, and we can resume our API activities. \n\nSamay Kohli  We still don’t know the root cause. We need to investigate further to determine if it’s our fault or a larger issue. \n\nShabin George  It involves app exchanges. \n\nSamay Kohli  We haven't touched packages yet, so that's curious. We found a tool called sweep.io for deduplication, which seems promising. They offer a two-week trial. We should set it up in early November to create deduplication workflows in Salesforce. \n\nShabin George  Sounds good. Data duplication is a significant issue for many, including us. \n\nSamay Kohli  We are also looking at integrating ZoomInfo for account hierarchies. \n\nShabin George  ZoomInfo's account hierarchy is unreliable. We stopped using their services last year due to poor performance. The accuracy of their data is low, particularly for India.\n\nSamay Kohli  Really? We were told by a client that ZoomInfo is the best. \n\nShabin George  Our experience has been quite different. We found other tools more effective and affordable. \n\nSamay Kohli  What would you recommend? \n\nShabin George  Apollo has a better hierarchy feature but is more expensive. There are also free tools that outperform ZoomInfo. We relied on LinkedIn for accurate data. \n\nSamay Kohli  Understood. \n\nShabin George  We need to focus on data adoption and analytics. If we can streamline the data and provide insights, it will be a game changer for us.\n\nSamay Kohli  What do you need from our side? \n\nShabin George  We need to audit the data and determine what is necessary for effective use. The tool is functional in theory but needs practical application."

    User Roles:
    Samay Kohli = Consultant
    Shabin George = Client
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
        `Statement: ${commentContent} \n Only return 1-3 concise, technical bullet points that clarify, explain, or provide additional context.`,
        config,
        instanceName,
        userId,
      );
      const budyReply = response?.messageContent?.content;
      this.logger.log(`Generated Budy Reply: ${budyReply}`);
      return budyReply;
    } catch (error) {
      this.logger.error(`Error generating SOW: ${error.message}`, error.stack);
      throw new Error('Failed to generate SOW');
    }
  }
}
