import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';

export const PASSWORD_MIN = 10;

export class RegisterDto {
  @IsString()
  @Length(2, 80)
  name: string;

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(PASSWORD_MIN, { message: `Use at least ${PASSWORD_MIN} characters for your password` })
  @MaxLength(128)
  password: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(128)
  password: string;
}

export class EmailDto {
  @IsEmail()
  email: string;
}

export class TokenDto {
  @IsString()
  @Length(20, 200)
  token: string;
}

export class ResetPasswordDto extends TokenDto {
  @IsString()
  @MinLength(PASSWORD_MIN, { message: `Use at least ${PASSWORD_MIN} characters for your password` })
  @MaxLength(128)
  password: string;
}

export class ProviderTokenDto {
  @IsString()
  @Length(20, 10000)
  token: string;
}
