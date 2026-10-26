import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Me } from '../api/types';

const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export interface SessionPayload {
  accessToken: string;
  user: Me;
}

// The access token lives only in memory; the refresh token is an httpOnly cookie the browser sends to /api/auth.
let accessToken: string | null = null;
let currentUser: Me | null = null;
let refreshing: Promise<string | null> | null = null;
const listeners = new Set<(user: Me | null) => void>();

function publish(payload: SessionPayload | null) {
  accessToken = payload?.accessToken ?? null;
  currentUser = payload?.user ?? null;
  listeners.forEach((l) => l(currentUser));
}

export const setSession = (payload: SessionPayload) => publish(payload);

async function readError(res: Response) {
  try {
    const data = await res.json();
    const message = Array.isArray(data.message) ? data.message.join('. ') : (data.message ?? `Request failed (${res.status})`);
    return new ApiError(message, res.status, data.code);
  } catch {
    return new ApiError(`Request failed (${res.status})`, res.status);
  }
}

/** Calls a public /api/auth endpoint. */
export async function authPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/auth/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw await readError(res);
  return res.json();
}

export async function getProviders(): Promise<{ microsoft: boolean; google: { clientId: string } | null; password: boolean }> {
  const res = await fetch(`${BASE}/auth/providers`);
  if (!res.ok) throw await readError(res);
  return res.json();
}

/** One refresh at a time, however many requests notice an expired token at once. */
export function refreshSession(): Promise<string | null> {
  refreshing ??= authPost<SessionPayload>('refresh')
    .then((p) => {
      publish(p);
      return p.accessToken;
    })
    .catch(() => {
      publish(null);
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function expiresSoon(token: string) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')));
    return payload.exp * 1000 - Date.now() < 30_000;
  } catch {
    return true;
  }
}

export async function getAccessToken(): Promise<string | null> {
  if (accessToken && !expiresSoon(accessToken)) return accessToken;
  return refreshSession();
}

/** Authenticated API call. Retries once after refreshing if the token was rejected. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = (token: string | null) =>
    fetch(BASE + path, {
      ...init,
      credentials: 'include',
      headers: { ...(init.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });

  let res = await send(await getAccessToken());
  if (res.status === 401) {
    const token = await refreshSession();
    if (token) res = await send(token);
  }
  if (!res.ok) throw await readError(res);
  return res;
}

export async function signOut() {
  try {
    await authPost('logout');
  } finally {
    publish(null);
  }
}

type Status = 'loading' | 'signedIn' | 'signedOut';
const AuthContext = createContext<{ status: Status; user: Me | null }>({ status: 'loading', user: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ status: Status; user: Me | null }>({ status: 'loading', user: null });

  useEffect(() => {
    const onChange = (user: Me | null) => setState({ status: user ? 'signedIn' : 'signedOut', user });
    listeners.add(onChange);
    // Restore the session from the refresh cookie on page load.
    refreshSession();
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
