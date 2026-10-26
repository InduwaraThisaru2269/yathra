import { Controller, Get, Param } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators';
import { BoardsService } from './boards.service';

@Controller('projects/:key')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  @Get('board')
  devBoard(@Param('key') key: string, @CurrentUser() user: AuthUser) {
    return this.boards.devBoard(key, user);
  }

  @Get('ba-board')
  baBoard(@Param('key') key: string, @CurrentUser() user: AuthUser) {
    return this.boards.baBoard(key, user);
  }

  @Get('backlog')
  backlog(@Param('key') key: string, @CurrentUser() user: AuthUser) {
    return this.boards.backlog(key, user);
  }
}
