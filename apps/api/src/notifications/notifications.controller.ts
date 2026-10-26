import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators';
import { NotificationsService } from './notifications.service';

class ListQuery {
  @IsOptional()
  @IsIn(['1', 'true'])
  unread?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  /** Cursor: createdAt of the last item already shown. */
  @IsOptional()
  @IsDateString()
  before?: string;
}

class SettingsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsEnum(NotificationType, { each: true })
  emailFor: NotificationType[];
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Query() q: ListQuery, @CurrentUser() user: AuthUser) {
    return this.notifications.list(user, { unreadOnly: !!q.unread, take: q.take ?? 30, before: q.before });
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    return { unreadCount: await this.notifications.unreadCount(user) };
  }

  @Post('read-all')
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user);
  }

  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.notifications.settings(user);
  }

  @Put('settings')
  updateSettings(@Body() dto: SettingsDto, @CurrentUser() user: AuthUser) {
    return this.notifications.updateSettings(user, dto.emailFor);
  }

  @Post(':id/read')
  read(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.notifications.markRead(id, user);
  }
}
