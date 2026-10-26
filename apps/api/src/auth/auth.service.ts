import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailTokenPurpose, Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppTokenService } from './app-token.service';
import { AuthUser, ProviderIdentity } from './auth-user';
import { EmailDto, LoginDto, RegisterDto, ResetPasswordDto } from './auth.dto';
import { hashPassword, randomToken, sha256, verifyPassword } from './crypto';
import { EntraTokenService } from './entra-token.service';
import { GoogleTokenService } from './google-token.service';
import { MailService } from './mail.service';
import { RateLimiter } from './rate-limiter';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

export interface ClientMeta {
  ip: string;
  userAgent?: string;
}

export interface SignedIn {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

/** Same reply whether or not the address exists, so the endpoints cannot be used to probe for accounts. */
const CHECK_INBOX = { message: 'If that address can be used, we have sent an email with a link. Check your inbox.' };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly adminEmails: Set<string>;
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly appTokens: AppTokenService,
    private readonly entra: EntraTokenService,
    private readonly google: GoogleTokenService,
    private readonly mail: MailService,
    private readonly limiter: RateLimiter,
    config: ConfigService,
  ) {
    this.adminEmails = new Set(
      (config.get<string>('ADMIN_EMAILS') ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    );
    this.appUrl = (config.get<string>('APP_URL') ?? config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5173').replace(/\/$/, '');
  }

  providers() {
    return {
      microsoft: this.entra.enabled,
      google: this.google.enabled ? { clientId: this.google.clientId } : null,
      password: true,
    };
  }

  // ---- Microsoft and Google ----

  async withMicrosoft(token: string, meta: ClientMeta): Promise<SignedIn> {
    this.limiter.hit(`sso:${meta.ip}`, 30, 15 * MINUTE);
    const identity = await this.verifyProvider(() => this.entra.verify(token), 'Microsoft');
    const user = await this.linkProvider('entraOid', identity);
    return this.startSession(user, 'microsoft', meta);
  }

  async withGoogle(credential: string, meta: ClientMeta): Promise<SignedIn> {
    this.limiter.hit(`sso:${meta.ip}`, 30, 15 * MINUTE);
    const identity = await this.verifyProvider(() => this.google.verify(credential), 'Google');
    const user = await this.linkProvider('googleSub', identity);
    return this.startSession(user, 'google', meta);
  }

  /**
   * Finds the account for a provider identity. An existing account with the same email is linked,
   * because the provider has proved the address. If that account was never verified, someone else
   * may have registered the address first, so its password is dropped before linking.
   */
  private async linkProvider(field: 'entraOid' | 'googleSub', identity: ProviderIdentity): Promise<User> {
    const where: Prisma.UserWhereUniqueInput =
      field === 'entraOid' ? { entraOid: identity.subject } : { googleSub: identity.subject };
    const linked = await this.prisma.user.findUnique({ where });
    if (linked) return this.touch(linked);

    const byEmail = await this.prisma.user.findUnique({ where: { email: identity.email } });
    if (byEmail) {
      const updated = await this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          [field]: identity.subject,
          emailVerified: true,
          passwordHash: byEmail.emailVerified ? byEmail.passwordHash : null,
          isAdmin: byEmail.isAdmin || this.adminEmails.has(identity.email),
          lastSeenAt: new Date(),
        },
      });
      if (!byEmail.emailVerified) await this.revokeAll(byEmail.id);
      return updated;
    }

    return this.prisma.user.create({
      data: {
        [field]: identity.subject,
        email: identity.email,
        name: identity.name,
        emailVerified: true,
        isAdmin: this.adminEmails.has(identity.email),
      },
    });
  }

  // ---- Email and password ----

  async register(dto: RegisterDto, meta: ClientMeta) {
    this.limiter.hit(`register:${meta.ip}`, 10, 60 * MINUTE);
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing?.emailVerified) {
      await this.mail.send(
        email,
        'You already have a Yathra account',
        `Someone tried to create a Yathra account with this address, but you already have one.\n\n` +
          `Sign in: ${this.appUrl}/login\nForgot your password? ${this.appUrl}/forgot-password\n\n` +
          `If this wasn't you, you can ignore this email.`,
      );
      return CHECK_INBOX;
    }
    if (existing) {
      // Pending sign-up: resend the link but keep the original password, so a second sign-up
      // with this address cannot take over the account once its owner verifies it.
      await this.sendVerification(existing);
      return CHECK_INBOX;
    }

    const user = await this.prisma.user.create({
      data: { email, name: dto.name.trim(), passwordHash: await hashPassword(dto.password), emailVerified: false },
    });
    await this.sendVerification(user);
    return CHECK_INBOX;
  }

  async login(dto: LoginDto, meta: ClientMeta): Promise<SignedIn> {
    const email = dto.email.trim().toLowerCase();
    this.limiter.hit(`login:${meta.ip}`, 50, 15 * MINUTE);
    this.limiter.hit(`login:${email}`, 8, 15 * MINUTE);

    const user = await this.prisma.user.findUnique({ where: { email } });
    const ok = !!user?.passwordHash && (await verifyPassword(dto.password, user.passwordHash));
    if (!user || !ok) throw new UnauthorizedException('Email or password is incorrect');
    if (!user.emailVerified) {
      throw new ForbiddenException({ message: 'Verify your email before signing in. We can send the link again.', code: 'EMAIL_NOT_VERIFIED' });
    }

    this.limiter.reset(`login:${email}`);
    return this.startSession(await this.touch(user), 'password', meta);
  }

  async resendVerification(dto: EmailDto, meta: ClientMeta) {
    this.limiter.hit(`mail:${meta.ip}`, 10, 60 * MINUTE);
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.trim().toLowerCase() } });
    if (user && !user.emailVerified && user.passwordHash) await this.sendVerification(user);
    return CHECK_INBOX;
  }

  async verifyEmail(token: string, meta: ClientMeta): Promise<SignedIn> {
    const record = await this.consumeEmailToken(token, EmailTokenPurpose.VERIFY_EMAIL);
    const user = await this.prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: true, lastSeenAt: new Date() },
    });
    return this.startSession(await this.touch(user), 'password', meta);
  }

  async forgotPassword(dto: EmailDto, meta: ClientMeta) {
    this.limiter.hit(`mail:${meta.ip}`, 10, 60 * MINUTE);
    const email = dto.email.trim().toLowerCase();
    this.limiter.hit(`reset:${email}`, 3, 60 * MINUTE);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      const raw = await this.createEmailToken(user.id, EmailTokenPurpose.RESET_PASSWORD, RESET_TTL_MS);
      await this.mail.send(
        email,
        'Reset your Yathra password',
        `Use this link to choose a new password. It works once and expires in 1 hour.\n\n` +
          `${this.appUrl}/reset-password?token=${raw}\n\nIf you didn't ask for this, you can ignore this email.`,
      );
    }
    return CHECK_INBOX;
  }

  /** Setting a new password signs out every other session and proves the inbox, so the email counts as verified. */
  async resetPassword(dto: ResetPasswordDto, meta: ClientMeta): Promise<SignedIn> {
    const record = await this.consumeEmailToken(dto.token, EmailTokenPurpose.RESET_PASSWORD);
    const user = await this.prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(dto.password), emailVerified: true },
    });
    await this.revokeAll(user.id);
    return this.startSession(await this.touch(user), 'password', meta);
  }

  // ---- Sessions ----

  /**
   * Rotates the refresh token. A token that was already rotated or revoked being used again means
   * it was copied, so every session of that user is ended.
   */
  async refresh(raw: string | undefined, meta: ClientMeta): Promise<SignedIn> {
    if (!raw) throw new UnauthorizedException('Not signed in');
    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256(raw) }, include: { user: true } });
    if (!session) throw new UnauthorizedException('Not signed in');
    if (session.revokedAt) {
      this.logger.warn(`Refresh token reuse for user ${session.userId}; revoking all sessions`);
      await this.revokeAll(session.userId);
      throw new UnauthorizedException('Your session ended. Sign in again.');
    }
    if (session.expiresAt <= new Date()) throw new UnauthorizedException('Your session expired. Sign in again.');

    await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    return this.startSession(await this.touch(session.user), session.provider, meta);
  }

  async logout(raw: string | undefined) {
    if (raw) {
      await this.prisma.session.updateMany({ where: { tokenHash: sha256(raw), revokedAt: null }, data: { revokedAt: new Date() } });
    }
    return { ok: true };
  }

  private async startSession(user: User, provider: string, meta: ClientMeta): Promise<SignedIn> {
    const refreshToken = randomToken();
    await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        provider,
        userAgent: meta.userAgent?.slice(0, 300),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
    const authUser = this.toAuthUser(user);
    return { accessToken: await this.appTokens.sign(authUser), refreshToken, user: authUser };
  }

  private revokeAll(userId: string) {
    return this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  // ---- Helpers ----

  private async sendVerification(user: User) {
    const raw = await this.createEmailToken(user.id, EmailTokenPurpose.VERIFY_EMAIL, VERIFY_TTL_MS);
    await this.mail.send(
      user.email,
      'Verify your email for Yathra',
      `Hi ${user.name},\n\nConfirm your email to finish creating your Yathra account. The link expires in 24 hours.\n\n` +
        `${this.appUrl}/verify-email?token=${raw}\n\nIf you didn't sign up, you can ignore this email.`,
    );
  }

  /** Issues a one-time link token and cancels any earlier unused link for the same purpose. */
  private async createEmailToken(userId: string, purpose: EmailTokenPurpose, ttlMs: number) {
    const raw = randomToken();
    await this.prisma.$transaction([
      this.prisma.emailToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.emailToken.create({
        data: { userId, purpose, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + ttlMs) },
      }),
    ]);
    return raw;
  }

  private async consumeEmailToken(raw: string, purpose: EmailTokenPurpose) {
    const record = await this.prisma.emailToken.findUnique({ where: { tokenHash: sha256(raw) } });
    if (!record || record.purpose !== purpose || record.usedAt || record.expiresAt <= new Date()) {
      throw new BadRequestException('This link is invalid or has expired. Ask for a new one.');
    }
    const claimed = await this.prisma.emailToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) throw new BadRequestException('This link has already been used.');
    return record;
  }

  /** Refreshes last-seen and applies ADMIN_EMAILS to verified addresses. */
  private touch(user: User): Promise<User> {
    const shouldBeAdmin = user.emailVerified && this.adminEmails.has(user.email);
    return this.prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date(), isAdmin: user.isAdmin || shouldBeAdmin },
    });
  }

  private async verifyProvider(verify: () => Promise<ProviderIdentity>, name: string) {
    try {
      return await verify();
    } catch (err) {
      this.logger.debug(`${name} token rejected: ${(err as Error).message}`);
      throw new UnauthorizedException(`${name} sign-in failed. Try again.`);
    }
  }

  private toAuthUser(u: User): AuthUser {
    return { id: u.id, email: u.email, name: u.name, isAdmin: u.isAdmin };
  }
}
