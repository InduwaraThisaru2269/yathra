import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { ProviderIdentity } from './auth-user';

const REQUIRED_SCOPE = 'access_as_user';

/**
 * Verifies Microsoft Entra ID access tokens for this API (v1 or v2) during sign-in.
 * Disabled when ENTRA_TENANT_ID / ENTRA_API_CLIENT_ID are not set.
 */
@Injectable()
export class EntraTokenService {
  readonly enabled: boolean;
  private readonly audiences: string[] = [];
  private readonly issuers: string[] = [];
  private readonly jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(config: ConfigService) {
    const tenantId = config.get<string>('ENTRA_TENANT_ID');
    const clientId = config.get<string>('ENTRA_API_CLIENT_ID');
    this.enabled = !!tenantId && !!clientId;
    if (!this.enabled) return;

    this.audiences = [clientId!, `api://${clientId}`];
    this.issuers = [`https://login.microsoftonline.com/${tenantId}/v2.0`, `https://sts.windows.net/${tenantId}/`];
    this.jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`));
  }

  async verify(token: string): Promise<ProviderIdentity> {
    if (!this.jwks) throw new Error('Microsoft sign-in is not configured');
    const { payload } = await jwtVerify(token, this.jwks, { audience: this.audiences, issuer: this.issuers });

    const scopes = typeof payload.scp === 'string' ? payload.scp.split(' ') : [];
    if (!scopes.includes(REQUIRED_SCOPE)) throw new Error(`Token is missing the ${REQUIRED_SCOPE} scope`);

    const oid = payload.oid;
    const email = payload.preferred_username ?? payload.upn ?? payload.unique_name ?? payload.email;
    if (typeof oid !== 'string' || typeof email !== 'string') throw new Error('Token has no user identity');

    return { subject: oid, email: email.toLowerCase(), name: typeof payload.name === 'string' ? payload.name : email };
  }
}
