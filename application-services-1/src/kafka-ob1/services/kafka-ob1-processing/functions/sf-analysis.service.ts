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
  private readonly prodToolEnvVars = {
    sf_instance_url:
      process.env.SALESFORCE_INSTANCE_URL ||
      'https://my-salesforce-instance.salesforce.com',
    sf_access_token: process.env.SALESFORCE_TOKEN || 'default-sf-access-token',
  };
  private readonly postDemoStages = [
    'Proposal/ROI Calculation',
    'Due Diligence',
    'Consensus',
    'Negotiation',
    'Contract',
  ];

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
          toolInputENVVariables: this.prodToolEnvVars,
        },
      );
      apiCount++;

      // Then get all stage history for those opportunities
      const closedWonIds =
        closedWonResponse.messageContent.toolResult.result.records.map(
          (r) => r.Id,
        );
      const historicalOppsQuery = `
        SELECT OpportunityId, CreatedDate, NewValue, OldValue
        FROM OpportunityFieldHistory 
        WHERE Field = 'StageName'
        AND OpportunityId IN ('${closedWonIds.join("','")}')
      `;

      const historicalOppsResponse =
        await this.agentServiceRequest.sendToolRequest(
          personId,
          userOrgId,
          queryToolId,
          {
            toolInputVariables: { query: historicalOppsQuery },
            toolInputENVVariables: this.prodToolEnvVars,
          },
        );
      apiCount++;

      // Calculate all metrics
      const closedWonOpps =
        closedWonResponse.messageContent.toolResult.result.records;
      const stageHistory =
        historicalOppsResponse.messageContent.toolResult.result.records;

      const medianHistoricalAge = this.calculateMedianAge(
        closedWonOpps,
        stageHistory,
      );
      const stageDurations = this.calculateStageDurations(stageHistory);

      // Create metrics record with all metrics
      const metricsRecord = {
        Name: `Opportunity Age Analysis - ${currentQuarter}`,
        Budy_Key_Metric_1_Name__c: 'Historical Median Age (Days)',
        Budy_Key_Metric_1_Value__c: medianHistoricalAge,
        Budy_Key_Metric_2_Name__c: 'Median Proposal/ROI Stage Duration (Days)',
        Budy_Key_Metric_2_Value__c:
          stageDurations['Proposal/ROI Calculation'] || 0,
        Budy_Key_Metric_3_Name__c: 'Median Due Diligence Stage Duration (Days)',
        Budy_Key_Metric_3_Value__c: stageDurations['Due Diligence'] || 0,
        Budy_Key_Metric_4_Name__c: 'Median Consensus Stage Duration (Days)',
        Budy_Key_Metric_4_Value__c: stageDurations['Consensus'] || 0,
        Budy_Key_Metric_5_Name__c: 'Median Negotiation Stage Duration (Days)',
        Budy_Key_Metric_5_Value__c: stageDurations['Negotiation'] || 0,
        Budy_Key_Metric_6_Name__c: 'Median Contract Stage Duration (Days)',
        Budy_Key_Metric_6_Value__c: stageDurations['Contract'] || 0,
        Budy_Analysis_Quarter__c: currentQuarter,
      };

      const createResponse = await this.agentServiceRequest.sendToolRequest(
        personId,
        userOrgId,
        createToolId,
        {
          toolInputVariables: {
            object_name: 'Budy_Opportunity_Key_Metrics__c',
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

  private calculateMedianAge(
    closedWonOpps: any[],
    stageHistory: any[],
  ): number {
    // Create a map of opportunity IDs to their close dates
    const closeDateMap = closedWonOpps.reduce((map, opp) => {
      map[opp.Id] = new Date(opp.CloseDate);
      return map;
    }, {});

    // Filter for Demo stages and calculate ages
    const ages = stageHistory
      .filter((history) => history.NewValue === 'Demo')
      .map((history) => {
        const closeDate = closeDateMap[history.OpportunityId];
        const demoDate = new Date(history.CreatedDate);
        return Math.floor(
          (closeDate.getTime() - demoDate.getTime()) / (1000 * 60 * 60 * 24),
        ); // Convert to days
      })
      .filter((age) => age > 0) // Filter out any negative ages (in case of multiple stage changes)
      .sort((a, b) => a - b);

    if (ages.length === 0) return 0;

    const mid = Math.floor(ages.length / 2);
    return ages.length % 2 === 0 ? (ages[mid - 1] + ages[mid]) / 2 : ages[mid];
  }

  private calculateStageDurations(stageHistory: any[]): Record<string, number> {
    // Group history records by opportunity and sort by date
    const oppStageHistory = stageHistory.reduce((acc, record) => {
      if (!acc[record.OpportunityId]) {
        acc[record.OpportunityId] = [];
      }
      acc[record.OpportunityId].push(record);
      return acc;
    }, {});

    // Calculate durations for each stage
    const stageDurations: Record<string, number[]> = {};
    this.postDemoStages.forEach((stage) => {
      stageDurations[stage] = [];
    });

    Object.values(oppStageHistory).forEach((history: any[]) => {
      // Sort history by date
      const sortedHistory = history.sort(
        (a, b) =>
          new Date(a.CreatedDate).getTime() - new Date(b.CreatedDate).getTime(),
      );

      // Calculate duration for each stage
      sortedHistory.forEach((record, index) => {
        if (this.postDemoStages.includes(record.OldValue)) {
          const stageStartDate = new Date(record.CreatedDate);
          const stageEndDate =
            index < sortedHistory.length - 1
              ? new Date(sortedHistory[index + 1].CreatedDate)
              : null;

          if (stageEndDate) {
            const duration = Math.floor(
              (stageEndDate.getTime() - stageStartDate.getTime()) /
                (1000 * 60 * 60 * 24),
            );
            if (duration > 0) {
              stageDurations[record.OldValue].push(duration);
            }
          }
        }
      });
    });

    // Calculate median for each stage
    return Object.entries(stageDurations).reduce((acc, [stage, durations]) => {
      if (durations.length === 0) {
        acc[stage] = 0;
      } else {
        const sorted = durations.sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        acc[stage] =
          sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
      }
      return acc;
    }, {});
  }
}