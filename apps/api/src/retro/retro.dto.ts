import { RetroColumn } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateRetroItemDto {
  @IsEnum(RetroColumn)
  column: RetroColumn;

  @IsString()
  @Length(1, 500)
  text: string;

  @IsOptional()
  @IsBoolean()
  anonymous?: boolean;
}

export class UpdateRetroItemDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  text?: string;

  @IsOptional()
  @IsEnum(RetroColumn)
  column?: RetroColumn;
}

export const ACTION_DESTINATIONS = ['NEXT_SPRINT', 'BACKLOG'] as const;

export class ActionToTicketDto {
  @IsIn(ACTION_DESTINATIONS)
  destination: (typeof ACTION_DESTINATIONS)[number];

  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}
