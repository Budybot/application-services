import { Injectable, Logger, Inject } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';
import { ClientKafka } from '@nestjs/microservices';

@Injectable()
export class SalesforceAnalysisService {
  private readonly logger = new Logger(SalesforceAnalysisService.name);
  private readonly defaultToolEnvVars = {
    sf_instance_url:
      process.env.SF_SANDBOX_INSTANCE_URL ||
      'https://my-salesforce-instance.salesforce.com',
    sf_access_token: process.env.SF_SANDBOX_TOKEN || 'default-sf-access-token',
  };

  constructor(
    private readonly agentServiceRequest: AgentServiceRequest,
    @Inject('KAFKA_OB1_CLIENT') private readonly kafkaClient: ClientKafka,
  ) {}

  async processMetricsAnalysis(message: Record<string, any>): Promise<void> {
    let apiCount = 0;
    try {
      if (!message?.messageContent) {
        throw new Error('Invalid message format');
      }

      const { personId, userOrgId, queryToolId, createToolId } =
        message.messageContent;

      // Calculate current quarter
      const now = new Date();
      const currentQuarter = `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;

      // First get the closed won opportunities from last year with their close dates
      const closedWonQuery = `
        SELECT Id, CloseDate 
        FROM Opportunity 
        WHERE StageName = 'Closed Won'
        AND CALENDAR_QUARTER(CreatedDate) = ${Math.floor(now.getMonth() / 3) + 1}
        AND CALENDAR_YEAR(CreatedDate) = ${now.getFullYear() - 1}
      `;

      const closedWonResponse = await this.agentServiceRequest.sendToolRequest(
        personId,
        userOrgId,
        queryToolId,
        {
          toolInputVariables: { query: closedWonQuery },
          toolInputENVVariables: this.defaultToolEnvVars,
        },
      );
      apiCount++;

      // Then get the demo stage history for those opportunities
      const closedWonIds =
        closedWonResponse.messageContent.toolResult.result.records.map(
          (r) => r.Id,
        );
      const historicalOppsQuery = `
        SELECT OpportunityId, CreatedDate
        FROM OpportunityHistory 
        WHERE Field = 'StageName'
        AND NewValue = 'Demo'
        AND OpportunityId IN ('${closedWonIds.join("','")}')
      `;

      const historicalOppsResponse =
        await this.agentServiceRequest.sendToolRequest(
          personId,
          userOrgId,
          queryToolId,
          {
            toolInputVariables: { query: historicalOppsQuery },
            toolInputENVVariables: this.defaultToolEnvVars,
          },
        );
      apiCount++;

      // Calculate median age
      const historicalOpps =
        historicalOppsResponse.messageContent.toolResult.result.records;
      const medianHistoricalAge = this.calculateMedianAge(historicalOpps);

      // Create single metric record
      const metricsRecord = {
        Name: `Opportunity Age Analysis - ${currentQuarter}`,
        Budy_Key_Metric_1_Name__c: 'Historical Median Age (Days)',
        Budy_Key_Metric_1_Value__c: medianHistoricalAge,
        Budy_Analysis_Quarter__c: currentQuarter,
      };

      const createResponse = await this.agentServiceRequest.sendToolRequest(
        personId,
        userOrgId,
        createToolId,
        {
          toolInputVariables: {
            record_type: 'Budy_Key_Metrics__c',
            records: [metricsRecord],
          },
          toolInputENVVariables: this.defaultToolEnvVars,
        },
      );
      apiCount++;

      if (!createResponse.messageContent?.toolSuccess) {
        throw new Error(
          `Failed to create metrics record: ${createResponse.messageContent?.toolError?.message || 'Unknown error'}`,
        );
      }

      this.logger.log(
        `Successfully created metrics record for ${currentQuarter}`,
        {
          apiCount,
        },
      );
    } catch (error) {
      this.logger.error('Error processing metrics analysis', {
        error: error.message,
        stack: error.stack,
        apiCount,
      });
      throw error;
    }
  }

  private calculateMedianAge(opportunities: any[]): number {
    const ages = opportunities
      .map((opp) => {
        const demoDate = new Date(opp.CreatedDate);
        const closeDate = new Date(opp.CloseDate);
        return Math.floor(
          (closeDate.getTime() - demoDate.getTime()) / (1000 * 60 * 60 * 24),
        ); // Convert to days
      })
      .sort((a, b) => a - b);

    const mid = Math.floor(ages.length / 2);
    return ages.length % 2 === 0 ? (ages[mid - 1] + ages[mid]) / 2 : ages[mid];
  }
}
