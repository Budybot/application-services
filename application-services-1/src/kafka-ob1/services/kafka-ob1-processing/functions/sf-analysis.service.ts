import { Injectable, Logger, Inject } from '@nestjs/common';
import { AgentServiceRequest } from '../agent-service-request.service';
import { ClientKafka } from '@nestjs/microservices';

enum AnalysisType {
  SEASONAL = 'seasonal',
  PERFORMANCE = 'performance',
  OWNER_PERFORMANCE = 'owner_performance',
}

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

      const { personId, userOrgId, queryToolId, createToolId, analysisType } =
        message.messageContent;

      if (
        !analysisType ||
        !Object.values(AnalysisType).includes(analysisType)
      ) {
        throw new Error('Invalid or missing analysis type');
      }

      const now = new Date();
      const currentQuarter = `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;

      let metrics: Record<string, any>;

      if (analysisType === AnalysisType.SEASONAL) {
        const [seasonalMetrics, seasonalCount] =
          await this.processSeasonalAnalysis(
            personId,
            userOrgId,
            queryToolId,
            now,
            apiCount,
            currentQuarter,
          );
        metrics = seasonalMetrics;
        apiCount = seasonalCount;
      } else if (analysisType === AnalysisType.OWNER_PERFORMANCE) {
        const [ownerMetrics, ownerCount] =
          await this.processOwnerPerformanceAnalysis(
            personId,
            userOrgId,
            queryToolId,
            now,
            apiCount,
            currentQuarter,
          );
        metrics = ownerMetrics;
        apiCount = ownerCount;
      } else {
        const [performanceMetrics, performanceCount] =
          await this.processPerformanceAnalysis(
            personId,
            userOrgId,
            queryToolId,
            now,
            apiCount,
            currentQuarter,
          );
        metrics = performanceMetrics;
        apiCount = performanceCount;
      }

      const [, finalCount] = await this.createMetricsRecord(
        personId,
        userOrgId,
        createToolId,
        metrics,
        currentQuarter,
        apiCount,
      );
      apiCount = finalCount;

      this.logger.log(
        `Successfully created ${analysisType} metrics record for ${currentQuarter}`,
        { apiCount },
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

  private async processSeasonalAnalysis(
    personId: string,
    userOrgId: string,
    queryToolId: string,
    now: Date,
    apiCount: number,
    currentQuarter: string,
  ): Promise<[Record<string, any>, number]> {
    // Get closed won opportunities
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

    // Get stage history
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

    // Calculate metrics
    const closedWonOpps =
      closedWonResponse.messageContent.toolResult.result.records;
    const stageHistory =
      historicalOppsResponse.messageContent.toolResult.result.records;

    const medianHistoricalAge = this.calculateMedianAge(
      closedWonOpps,
      stageHistory,
    );
    const stageDurations = this.calculateStageDurations(stageHistory);

    return [
      {
        Name: `Seasonal Opportunity Age Analysis - ${currentQuarter}`,
        Budy_Key_Metric_1_Name__c: 'Seasonal Median Age (Days)',
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
      },
      apiCount,
    ];
  }

  private async processPerformanceAnalysis(
    personId: string,
    userOrgId: string,
    queryToolId: string,
    now: Date,
    apiCount: number,
    currentQuarter: string,
  ): Promise<[Record<string, any>, number]> {
    const ownerAnalysisQuery = `
      SELECT OwnerId, StageName, Amount
      FROM Opportunity 
      WHERE CALENDAR_QUARTER(CreatedDate) = ${Math.floor(now.getMonth() / 3) + 1}
      AND CALENDAR_YEAR(CreatedDate) = ${now.getFullYear() - 1}
      AND (StageName = 'Closed Won' OR StageName = 'Closed Lost')
    `;

    const ownerAnalysisResponse =
      await this.agentServiceRequest.sendToolRequest(
        personId,
        userOrgId,
        queryToolId,
        {
          toolInputVariables: { query: ownerAnalysisQuery },
          toolInputENVVariables: this.prodToolEnvVars,
        },
      );
    apiCount++;

    const ownerMetrics = this.calculateOwnerMetrics(
      ownerAnalysisResponse.messageContent.toolResult.result.records,
    );

    return [
      {
        Name: `Quarterly Opportunity Performance Analysis - ${currentQuarter}`,
        Budy_Key_Metric_1_Name__c: 'Opportunity Win Rate (%)',
        Budy_Key_Metric_1_Value__c: Math.round(ownerMetrics.winRate),
        Budy_Key_Metric_2_Name__c: 'Opportunity Loss Rate (%)',
        Budy_Key_Metric_2_Value__c: Math.round(ownerMetrics.lossRate),
        Budy_Key_Metric_3_Name__c: 'Total Opportunity Revenue ($)',
        Budy_Key_Metric_3_Value__c: Math.round(ownerMetrics.totalRevenue),
        Budy_Key_Metric_4_Name__c: 'Average Opportunity Revenue ($)',
        Budy_Key_Metric_4_Value__c: Math.round(ownerMetrics.avgRevenue),
        Budy_Analysis_Quarter__c: currentQuarter,
      },
      apiCount,
    ];
  }

  private async processOwnerPerformanceAnalysis(
    personId: string,
    userOrgId: string,
    queryToolId: string,
    now: Date,
    apiCount: number,
    currentQuarter: string,
  ): Promise<[Record<string, any>[], number]> {
    const ownerAnalysisQuery = `
      SELECT OwnerId, Owner.Name, StageName, Amount
      FROM Opportunity 
      WHERE CALENDAR_QUARTER(CreatedDate) = ${Math.floor(now.getMonth() / 3) + 1}
      AND CALENDAR_YEAR(CreatedDate) = ${now.getFullYear() - 1}
      AND (StageName = 'Closed Won' OR StageName = 'Closed Lost')
    `;

    const ownerAnalysisResponse =
      await this.agentServiceRequest.sendToolRequest(
        personId,
        userOrgId,
        queryToolId,
        {
          toolInputVariables: { query: ownerAnalysisQuery },
          toolInputENVVariables: this.prodToolEnvVars,
        },
      );
    apiCount++;

    // Group opportunities by owner
    const opportunitiesByOwner =
      ownerAnalysisResponse.messageContent.toolResult.result.records.reduce(
        (acc, opp) => {
          if (!acc[opp.OwnerId]) {
            acc[opp.OwnerId] = {
              ownerId: opp.OwnerId,
              ownerName: opp.Owner.Name,
              opportunities: [],
            };
          }
          acc[opp.OwnerId].opportunities.push(opp);
          return acc;
        },
        {},
      );

    // Calculate metrics for each owner
    const ownerMetrics = Object.values(opportunitiesByOwner).map(
      (ownerData: any) => {
        const metrics = this.calculateOwnerMetrics(ownerData.opportunities);

        return {
          Name: `Owner Performance Analysis - ${ownerData.ownerName} - ${currentQuarter}`,
          Budy_Key_Metric_1_Name__c: 'Opportunity Win Rate (%)',
          Budy_Key_Metric_1_Value__c: Math.round(metrics.winRate),
          Budy_Key_Metric_2_Name__c: 'Opportunity Loss Rate (%)',
          Budy_Key_Metric_2_Value__c: Math.round(metrics.lossRate),
          Budy_Key_Metric_3_Name__c: 'Total Opportunity Revenue ($)',
          Budy_Key_Metric_3_Value__c: Math.round(metrics.totalRevenue),
          Budy_Key_Metric_4_Name__c: 'Average Opportunity Revenue ($)',
          Budy_Key_Metric_4_Value__c: Math.round(metrics.avgRevenue),
          Budy_Analysis_Quarter__c: currentQuarter,
          User__c: ownerData.ownerId,
        };
      },
    );

    return [ownerMetrics, apiCount];
  }

  private async createMetricsRecord(
    personId: string,
    userOrgId: string,
    createToolId: string,
    metricsRecord: Record<string, any> | Record<string, any>[],
    currentQuarter: string,
    apiCount: number,
  ): Promise<[void, number]> {
    const records = Array.isArray(metricsRecord)
      ? metricsRecord
      : [metricsRecord];

    const createResponse = await this.agentServiceRequest.sendToolRequest(
      personId,
      userOrgId,
      createToolId,
      {
        toolInputVariables: {
          object_name: 'Budy_Opportunity_Key_Metrics__c',
          records: records,
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

    return [undefined, apiCount];
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

  // Add new private method for owner metrics calculation
  private calculateOwnerMetrics(opportunities: any[]): {
    winRate: number;
    lossRate: number;
    totalRevenue: number;
    avgRevenue: number;
  } {
    const totalOpps = opportunities.length;
    const wonOpps = opportunities.filter(
      (opp) => opp.StageName === 'Closed Won',
    );
    const totalRevenue = wonOpps.reduce(
      (sum, opp) => sum + (opp.Amount || 0),
      0,
    );

    return {
      winRate: (wonOpps.length / totalOpps) * 100,
      lossRate: ((totalOpps - wonOpps.length) / totalOpps) * 100,
      totalRevenue: totalRevenue,
      avgRevenue: wonOpps.length > 0 ? totalRevenue / wonOpps.length : 0,
    };
  }
}
