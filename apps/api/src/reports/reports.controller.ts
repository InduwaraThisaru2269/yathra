import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators';
import { ReportsService } from './reports.service';

@Controller()
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('projects/:key/reports/velocity')
  velocity(@Param('key') key: string, @CurrentUser() user: AuthUser) {
    return this.reports.velocity(key, user);
  }

  @Get('sprints/:id/report')
  sprintReport(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.reports.sprintReport(id, user);
  }
}
