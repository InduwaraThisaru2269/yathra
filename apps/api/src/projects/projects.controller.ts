import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators';
import { AddMemberDto, CreateProjectDto, UpdateMemberDto, UpdateProjectDto } from './projects.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.projects.list(user);
  }

  @Post()
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: AuthUser) {
    return this.projects.create(dto, user);
  }

  @Get(':key')
  get(@Param('key') key: string, @CurrentUser() user: AuthUser) {
    return this.projects.get(key, user);
  }

  @Patch(':key')
  update(@Param('key') key: string, @Body() dto: UpdateProjectDto, @CurrentUser() user: AuthUser) {
    return this.projects.update(key, dto, user);
  }

  @Get(':key/members')
  members(@Param('key') key: string, @CurrentUser() user: AuthUser) {
    return this.projects.members(key, user);
  }

  @Post(':key/members')
  addMember(@Param('key') key: string, @Body() dto: AddMemberDto, @CurrentUser() user: AuthUser) {
    return this.projects.addMember(key, dto, user);
  }

  @Patch(':key/members/:userId')
  updateMember(
    @Param('key') key: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMemberDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.projects.updateMember(key, userId, dto, user);
  }

  @Delete(':key/members/:userId')
  removeMember(@Param('key') key: string, @Param('userId', ParseUUIDPipe) userId: string, @CurrentUser() user: AuthUser) {
    return this.projects.removeMember(key, userId, user);
  }
}
