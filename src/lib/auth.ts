// src/lib/auth.ts
export type Tokens = {
  access: string;
  refresh: string;
  expiresAt: number; // epoch ms
};

export function readTokens(): Tokens | null {
  if (typeof window === 'undefined') return null;
  const access = sessionStorage.getItem('token') ?? '';
  const refresh = sessionStorage.getItem('refresh_token') ?? '';
  const expiresAt = Number(sessionStorage.getItem('expires_at') ?? '0');
  if (!access || !refresh || !expiresAt) return null;
  return { access, refresh, expiresAt };
}

export function writeTokens(access: string, refresh: string, expiresAtMs: number) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem('token', access);
  sessionStorage.setItem('refresh_token', refresh);
  sessionStorage.setItem('expires_at', String(expiresAtMs));
}

export function clearTokens() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('refresh_token');
  sessionStorage.removeItem('expires_at');
}
