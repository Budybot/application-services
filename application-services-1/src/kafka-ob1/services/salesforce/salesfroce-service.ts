import { Injectable, HttpService } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
@Injectable()
export class SalesforceService {
  constructor(private readonly httpService: HttpService) {}

  /**
   * Perform a SOQL query
   * @param instanceUrl Salesforce instance URL
   * @param accessToken Bearer token for authentication
   * @param soqlQuery SOQL query string
   */
  async querySalesforce(
    instanceUrl: string,
    accessToken: string,
    soqlQuery: string,
    version: string = '61.0',
  ): Promise<any> {
    const url = `${instanceUrl}/services/data/v${version}/query?q=${encodeURIComponent(soqlQuery)}`;

    const response = await this.httpService
      .get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })
      .toPromise();

    return response.data;
  }

  /**
   * Describe a Salesforce object
   * @param instanceUrl Salesforce instance URL
   * @param accessToken Bearer token for authentication
   * @param objectName Object API name to describe
   */
  async describeObject(
    instanceUrl: string,
    accessToken: string,
    objectName: string,
    version: string = '61.0',
  ): Promise<any> {
    const url = `${instanceUrl}/services/data/v${version}/sobjects/${objectName}/describe`;

    const response = await this.httpService
      .get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })
      .toPromise();

    return response.data;
  }

  /**
   * Fetch all data for a specific record
   * @param instanceUrl Salesforce instance URL
   * @param accessToken Bearer token for authentication
   * @param objectName Object API name
   * @param recordId Record ID to fetch
   */
  async fetchRecord(
    instanceUrl: string,
    accessToken: string,
    objectName: string,
    recordId: string,
    version: string = '61.0',
  ): Promise<any> {
    const url = `${instanceUrl}/services/data/v${version}/sobjects/${objectName}/${recordId}`;

    const response = await this.httpService
      .get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      })
      .toPromise();

    return response.data;
  }
}
