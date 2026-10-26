import { IsDateString, IsIn, IsOptional, IsString, IsUUID, Length, ValidateIf } from 'class-validator';

export class CreateSprintDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  goal?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdateSprintDto extends CreateSprintDto {}

export class StartSprintDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  goal?: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}

export const MOVE_OPEN_TO = ['BACKLOG', 'SPRINT', 'NEW'] as const;

export class CompleteSprintDto {
  @IsIn(MOVE_OPEN_TO)
  moveOpenTo: (typeof MOVE_OPEN_TO)[number];

  @ValidateIf((o: CompleteSprintDto) => o.moveOpenTo === 'SPRINT')
  @IsUUID()
  targetSprintId?: string;
}
