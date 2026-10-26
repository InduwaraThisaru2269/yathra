import { ProjectRole } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @Matches(/^[A-Z][A-Z0-9]{1,9}$/, { message: 'Key must be 2–10 capital letters or digits, starting with a letter' })
  key: string;

  @IsString()
  @Length(2, 80)
  name: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;
}

export class AddMemberDto {
  @IsEmail()
  email: string;

  @IsEnum(ProjectRole)
  role: ProjectRole;
}

export class UpdateMemberDto {
  @IsEnum(ProjectRole)
  role: ProjectRole;
}
