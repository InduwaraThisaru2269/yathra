export interface AuthUser {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

/** The identity an external provider (Microsoft or Google) vouches for. */
export interface ProviderIdentity {
  subject: string;
  email: string;
  name: string;
}
