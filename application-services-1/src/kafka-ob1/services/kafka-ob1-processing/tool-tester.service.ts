import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';

@Injectable()
export class ToolTestingService {
  private readonly logger = new Logger(ToolTestingService.name);
  async runTest(
    serverUrl: string,
    toolId: string,
    requestBody: any,
  ): Promise<any> {
    this.logger.debug(
      `Running test for tool ${toolId} with request body: ${JSON.stringify(requestBody)}`,
    );
    const url = `http://${serverUrl}:5004/tool-testing/test/${toolId}`;

    try {
      const response: AxiosResponse = await axios.post(url, requestBody, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Return the response data
      return response.data;
    } catch (error) {
      // Handle errors and throw an HTTPException
      this.logger.error('Error running tool', error);
      throw new HttpException(
        error.response?.data || 'Error making request',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
