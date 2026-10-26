import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators';
import { ActionToTicketDto, CreateRetroItemDto, UpdateRetroItemDto } from './retro.dto';
import { RetroService } from './retro.service';

@Controller()
export class RetroController {
  constructor(private readonly retro: RetroService) {}

  @Get('projects/:key/retros')
  sprints(@Param('key') key: string, @CurrentUser() user: AuthUser) {
    return this.retro.sprints(key, user);
  }

  @Get('sprints/:id/retro')
  board(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.retro.board(id, user);
  }

  @Post('sprints/:id/retro/items')
  addItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateRetroItemDto, @CurrentUser() user: AuthUser) {
    return this.retro.addItem(id, dto, user);
  }

  @Post('sprints/:id/retro/close')
  close(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.retro.close(id, user);
  }

  @Post('sprints/:id/retro/reopen')
  reopen(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.retro.reopen(id, user);
  }

  @Patch('retro-items/:id')
  updateItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRetroItemDto, @CurrentUser() user: AuthUser) {
    return this.retro.updateItem(id, dto, user);
  }

  @Delete('retro-items/:id')
  deleteItem(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.retro.deleteItem(id, user);
  }

  @Post('retro-items/:id/vote')
  vote(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.retro.toggleVote(id, user);
  }

  @Post('retro-items/:id/ticket')
  toTicket(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ActionToTicketDto, @CurrentUser() user: AuthUser) {
    return this.retro.toTicket(id, dto, user);
  }
}
