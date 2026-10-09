import { Controller, Get, Inject } from '@nestjs/common';
import { AppService } from './app.service.js';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

@Controller()
@ApiTags('App')
export class AppController {
  constructor(@Inject(AppService) private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Get the application greeting' })
  @ApiOkResponse({ schema: { type: 'string', example: 'Hello World!' } })
  getHello(): string {
    return this.appService.getHello();
  }
}
