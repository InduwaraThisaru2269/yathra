import { Global, Module } from '@nestjs/common';
import { AppAuthGuard } from './app-auth.guard';
import { AppTokenService } from './app-token.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EntraTokenService } from './entra-token.service';
import { GoogleTokenService } from './google-token.service';
import { MailService } from './mail.service';
import { RateLimiter } from './rate-limiter';
import { UsersService } from './users.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AppTokenService,
    EntraTokenService,
    GoogleTokenService,
    MailService,
    RateLimiter,
    UsersService,
    AppAuthGuard,
  ],
  exports: [AppTokenService, UsersService, AppAuthGuard, MailService],
})
export class AuthModule {}
