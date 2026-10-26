import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, SignJWT } from 'jose';
import { AuthUser } from './auth-user';

const ISSUER = 'yathra-api';
const AUDIENCE = 'yathra-web';
export const ACCESS_TOKEN_TTL = '15m';

/** Short-lived access tokens issued by Yathra itself, whatever provider the user signed in with. */
@Injectable()
export class AppTokenService {
  private readonly secret: Uint8Array;

  constructor(config: ConfigService) {
    const secret = config.getOrThrow<string>('JWT_SECRET');
    if (secret.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
    this.secret = new TextEncoder().encode(secret);
  }

  sign(user: AuthUser): Promise<string> {
    return new SignJWT({ email: user.email, name: user.name, adm: user.isAdmin })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(ACCESS_TOKEN_TTL)
      .sign(this.secret);
  }

  async verify(token: string): Promise<AuthUser> {
    const { payload } = await jwtVerify(token, this.secret, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
    if (!payload.sub || typeof payload.email !== 'string' || typeof payload.name !== 'string') {
      throw new Error('Malformed access token');
    }
    return { id: payload.sub, email: payload.email, name: payload.name, isAdmin: payload.adm === true };
  }
}
