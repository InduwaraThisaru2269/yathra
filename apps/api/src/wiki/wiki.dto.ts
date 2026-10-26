import { IsInt, IsOptional, IsString, IsUUID, Length, MaxLength, Min } from 'class-validator';

export const WIKI_CONTENT_MAX = 200_000;

export class CreatePageDto {
  @IsString()
  @Length(1, 200)
  title: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(WIKI_CONTENT_MAX)
  content?: string;
}

export class UpdatePageDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(WIKI_CONTENT_MAX)
  content?: string;

  /** The version the editor started from; a newer saved version means someone else edited meanwhile. */
  @IsInt()
  @Min(1)
  baseVersion: number;
}

export class MovePageDto {
  /** New parent; null puts the page at the top level. */
  @IsOptional()
  @IsUUID()
  parentId: string | null;

  /** Place the page just before this sibling; omit to place it last. */
  @IsOptional()
  @IsUUID()
  beforeId?: string;
}

export class RestoreVersionDto {
  @IsInt()
  @Min(1)
  baseVersion: number;
}
