import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';

@Injectable()
export class ToolTestingService {
  async runTest(
    serverUrl: string,
    activityToolId: string,
    requestBody: any,
  ): Promise<any> {
    const url = `http://${serverUrl}:5004/tool-testing/test/${activityToolId}`;

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
      throw new HttpException(
        error.response?.data || 'Error making request',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
