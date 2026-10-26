import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators';
import { CompleteSprintDto, CreateSprintDto, StartSprintDto, UpdateSprintDto } from './sprints.dto';
import { SprintsService } from './sprints.service';

@Controller()
export class SprintsController {
  constructor(private readonly sprints: SprintsService) {}

  @Get('projects/:key/sprints')
  list(@Param('key') key: string, @CurrentUser() user: AuthUser) {
    return this.sprints.list(key, user);
  }

  @Post('projects/:key/sprints')
  create(@Param('key') key: string, @Body() dto: CreateSprintDto, @CurrentUser() user: AuthUser) {
    return this.sprints.create(key, dto, user);
  }

  @Patch('sprints/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSprintDto, @CurrentUser() user: AuthUser) {
    return this.sprints.update(id, dto, user);
  }

  @Delete('sprints/:id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.sprints.remove(id, user);
  }

  @Post('sprints/:id/start')
  start(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StartSprintDto, @CurrentUser() user: AuthUser) {
    return this.sprints.start(id, dto, user);
  }

  @Post('sprints/:id/complete')
  complete(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CompleteSprintDto, @CurrentUser() user: AuthUser) {
    return this.sprints.complete(id, dto, user);
  }
}
