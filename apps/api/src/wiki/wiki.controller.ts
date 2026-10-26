import { Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators';
import { CreatePageDto, MovePageDto, RestoreVersionDto, UpdatePageDto } from './wiki.dto';
import { WikiService } from './wiki.service';

@Controller()
export class WikiController {
  constructor(private readonly wiki: WikiService) {}

  @Get('projects/:key/wiki')
  tree(@Param('key') key: string, @CurrentUser() user: AuthUser) {
    return this.wiki.tree(key, user);
  }

  @Get('projects/:key/wiki/search')
  search(@Param('key') key: string, @Query('q') q = '', @CurrentUser() user: AuthUser) {
    return this.wiki.search(key, q, user);
  }

  @Post('projects/:key/wiki')
  create(@Param('key') key: string, @Body() dto: CreatePageDto, @CurrentUser() user: AuthUser) {
    return this.wiki.create(key, dto, user);
  }

  @Get('wiki/:id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.wiki.get(id, user);
  }

  @Patch('wiki/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePageDto, @CurrentUser() user: AuthUser) {
    return this.wiki.update(id, dto, user);
  }

  @Post('wiki/:id/move')
  move(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MovePageDto, @CurrentUser() user: AuthUser) {
    return this.wiki.move(id, dto, user);
  }

  @Delete('wiki/:id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.wiki.remove(id, user);
  }

  @Get('wiki/:id/versions')
  versions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.wiki.versions(id, user);
  }

  @Get('wiki/:id/versions/:version')
  version(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version', ParseIntPipe) version: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.wiki.version(id, version, user);
  }

  @Post('wiki/:id/versions/:version/restore')
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() dto: RestoreVersionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.wiki.restore(id, version, dto, user);
  }
}
