import { PublicClientApplication } from '@azure/msal-browser';

const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID;
const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID;
const apiScope = import.meta.env.VITE_API_SCOPE;

/** MSAL is only used to get a Microsoft token once; Yathra then runs its own session. */
export const microsoftConfigured = !!clientId && !!tenantId && !!apiScope;

let instance: Promise<PublicClientApplication> | null = null;

function getMsal() {
  instance ??= (async () => {
    const msal = new PublicClientApplication({
      auth: {
        clientId,
        authority: `https://login.microsoftonline.com/${tenantId}`,
        redirectUri: `${window.location.origin}/blank.html`,
      },
      cache: { cacheLocation: 'sessionStorage' },
    });
    await msal.initialize();
    return msal;
  })();
  return instance;
}

/** Opens the Microsoft sign-in popup and returns an access token for the Yathra API scope. */
export async function microsoftToken(): Promise<string> {
  const msal = await getMsal();
  const result = await msal.loginPopup({ scopes: [apiScope], prompt: 'select_account' });
  return result.accessToken;
}
