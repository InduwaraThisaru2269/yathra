import { IssueStatus, IssueType, LinkType, Priority } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const STORY_POINTS = [0, 1, 2, 3, 5, 8, 13, 21];

export class CreateIssueDto {
  @IsEnum(IssueType)
  type: IssueType;

  @IsString()
  @Length(1, 255)
  title: string;

  @IsOptional()
  @IsString()
  @Length(0, 20000)
  description?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsIn(STORY_POINTS)
  storyPoints?: number;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsUUID()
  sprintId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  labels?: string[];

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

/** Send only the fields that change; null clears a field. */
export class UpdateIssueDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 20000)
  description?: string | null;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsIn(STORY_POINTS)
  storyPoints?: number | null;

  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  labels?: string[];

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  /** Optimistic lock: the version the client last saw. */
  @IsOptional()
  @IsInt()
  version?: number;
}

export class TransitionDto {
  @IsEnum(IssueStatus)
  to: IssueStatus;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  comment?: string;
}

export class MoveIssueDto {
  /** Target sprint; null moves the issue to the backlog. */
  @IsOptional()
  @IsUUID()
  sprintId: string | null;

  /** Place the issue just before this one; omit to place it last. */
  @IsOptional()
  @IsUUID()
  beforeId?: string;
}

export class CommentDto {
  @IsString()
  @Length(1, 10000)
  body: string;
}

export class LinkDto {
  @IsString()
  toKey: string;

  @IsEnum(LinkType)
  type: LinkType;
}

export class ListIssuesQuery {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(IssueType)
  type?: IssueType;

  @IsOptional()
  @IsEnum(IssueStatus)
  status?: IssueStatus;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsUUID()
  epicId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;

  /** Comma-separated issue keys, e.g. "TN-1,TN-7"; used by the wiki to show live ticket status. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  keys?: string;
}
