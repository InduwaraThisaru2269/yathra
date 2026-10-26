import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { AuthUser } from './auth-user';
import { EmailDto, LoginDto, ProviderTokenDto, RegisterDto, ResetPasswordDto, TokenDto } from './auth.dto';
import { AuthService, ClientMeta, SESSION_TTL_MS, SignedIn } from './auth.service';
import { CurrentUser, Public } from './decorators';
import { UsersService } from './users.service';

const REFRESH_COOKIE = 'yathra_rt';

@Controller()
export class AuthController {
  private readonly cookie: CookieOptions;

  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    config: ConfigService,
  ) {
    // The refresh cookie is only sent to /api/auth and is never readable from JavaScript.
    this.cookie = {
      httpOnly: true,
      secure: config.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: SESSION_TTL_MS,
    };
  }

  @Public()
  @Get('health')
  health() {
    return { ok: true };
  }

  @Public()
  @Get('auth/providers')
  providers() {
    return this.auth.providers();
  }

  @Public()
  @Post('auth/microsoft')
  @HttpCode(200)
  async microsoft(@Body() dto: ProviderTokenDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.withMicrosoft(dto.token, meta(req)));
  }

  @Public()
  @Post('auth/google')
  @HttpCode(200)
  async google(@Body() dto: ProviderTokenDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.withGoogle(dto.token, meta(req)));
  }

  @Public()
  @Post('auth/register')
  @HttpCode(202)
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, meta(req));
  }

  @Public()
  @Post('auth/login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.login(dto, meta(req)));
  }

  @Public()
  @Post('auth/verify-email')
  @HttpCode(200)
  async verifyEmail(@Body() dto: TokenDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.verifyEmail(dto.token, meta(req)));
  }

  @Public()
  @Post('auth/resend-verification')
  @HttpCode(202)
  resend(@Body() dto: EmailDto, @Req() req: Request) {
    return this.auth.resendVerification(dto, meta(req));
  }

  @Public()
  @Post('auth/forgot-password')
  @HttpCode(202)
  forgot(@Body() dto: EmailDto, @Req() req: Request) {
    return this.auth.forgotPassword(dto, meta(req));
  }

  @Public()
  @Post('auth/reset-password')
  @HttpCode(200)
  async reset(@Body() dto: ResetPasswordDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, await this.auth.resetPassword(dto, meta(req)));
  }

  @Public()
  @Post('auth/refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      return this.respond(res, await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], meta(req)));
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, { ...this.cookie, maxAge: undefined });
      throw err;
    }
  }

  @Public()
  @Post('auth/logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.clearCookie(REFRESH_COOKIE, { ...this.cookie, maxAge: undefined });
    return this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  /** Users who have signed in at least once; used to add project members. */
  @Get('users')
  search(@Query('q') q = '') {
    return this.users.search(q);
  }

  /** The refresh token goes in the cookie; the body carries only the short-lived access token. */
  private respond(res: Response, signedIn: SignedIn) {
    res.cookie(REFRESH_COOKIE, signedIn.refreshToken, this.cookie);
    return { accessToken: signedIn.accessToken, user: signedIn.user };
  }
}

function meta(req: Request): ClientMeta {
  return { ip: req.ip ?? 'unknown', userAgent: req.headers['user-agent'] };
}
