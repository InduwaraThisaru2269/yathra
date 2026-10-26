import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ProviderIdentity } from './auth-user';

/** Verifies Google Identity Services ID tokens. Disabled when GOOGLE_CLIENT_ID is not set. */
@Injectable()
export class GoogleTokenService {
  readonly clientId: string | null;
  private readonly jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

  constructor(config: ConfigService) {
    this.clientId = config.get<string>('GOOGLE_CLIENT_ID') || null;
  }

  get enabled() {
    return this.clientId !== null;
  }

  async verify(credential: string): Promise<ProviderIdentity> {
    if (!this.clientId) throw new Error('Google sign-in is not configured');
    const { payload } = await jwtVerify(credential, this.jwks, {
      audience: this.clientId,
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
    });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') throw new Error('Token has no user identity');
    // Only a Google-verified address may be linked to an existing Yathra account.
    if (payload.email_verified !== true) throw new Error('Google has not verified this email address');

    return {
      subject: payload.sub,
      email: payload.email.toLowerCase(),
      name: typeof payload.name === 'string' ? payload.name : payload.email,
    };
  }
}
