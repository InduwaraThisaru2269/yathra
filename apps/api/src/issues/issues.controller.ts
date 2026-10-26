import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators';
import {
  CommentDto,
  CreateIssueDto,
  LinkDto,
  ListIssuesQuery,
  MoveIssueDto,
  TransitionDto,
  UpdateIssueDto,
} from './issues.dto';
import { IssuesService } from './issues.service';

@Controller()
export class IssuesController {
  constructor(private readonly issues: IssuesService) {}

  @Get('projects/:key/issues')
  list(@Param('key') key: string, @Query() query: ListIssuesQuery, @CurrentUser() user: AuthUser) {
    return this.issues.list(key, query, user);
  }

  @Post('projects/:key/issues')
  create(@Param('key') key: string, @Body() dto: CreateIssueDto, @CurrentUser() user: AuthUser) {
    return this.issues.create(key, dto, user);
  }

  @Get('issues/:issueKey')
  get(@Param('issueKey') issueKey: string, @CurrentUser() user: AuthUser) {
    return this.issues.get(issueKey, user);
  }

  @Patch('issues/:issueKey')
  update(@Param('issueKey') issueKey: string, @Body() dto: UpdateIssueDto, @CurrentUser() user: AuthUser) {
    return this.issues.update(issueKey, dto, user);
  }

  @Delete('issues/:issueKey')
  remove(@Param('issueKey') issueKey: string, @CurrentUser() user: AuthUser) {
    return this.issues.remove(issueKey, user);
  }

  @Post('issues/:issueKey/transition')
  transition(@Param('issueKey') issueKey: string, @Body() dto: TransitionDto, @CurrentUser() user: AuthUser) {
    return this.issues.transition(issueKey, dto, user);
  }

  @Post('issues/:issueKey/move')
  move(@Param('issueKey') issueKey: string, @Body() dto: MoveIssueDto, @CurrentUser() user: AuthUser) {
    return this.issues.move(issueKey, dto, user);
  }

  @Post('issues/:issueKey/comments')
  addComment(@Param('issueKey') issueKey: string, @Body() dto: CommentDto, @CurrentUser() user: AuthUser) {
    return this.issues.addComment(issueKey, dto, user);
  }

  @Delete('issues/:issueKey/comments/:commentId')
  deleteComment(
    @Param('issueKey') issueKey: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.issues.deleteComment(issueKey, commentId, user);
  }

  @Post('issues/:issueKey/links')
  addLink(@Param('issueKey') issueKey: string, @Body() dto: LinkDto, @CurrentUser() user: AuthUser) {
    return this.issues.addLink(issueKey, dto, user);
  }

  @Delete('issues/:issueKey/links/:linkId')
  removeLink(
    @Param('issueKey') issueKey: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.issues.removeLink(issueKey, linkId, user);
  }
}
