import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { join } from 'path';

@Controller()
export class AppHealthV1Controller {
  constructor() { }


  @Get('services/health')
  getHealth(@Res() res: Response) {
    return res.status(200).json({ status: 'ok' }); // Returning a 200 OK response for health checks
  }
}
