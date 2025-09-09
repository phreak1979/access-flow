// src/routes/+layout.ts
import type { LayoutLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';
import { PUBLIC_API_URL } from '$env/static/public';
import { readTokens, writeTokens, clearTokens } from '$lib/auth';

export const ssr = false; // SPA, since we use sessionStorage

export const load: LayoutLoad = async ({ url, fetch }) => {
  const pathname = url.pathname;

  // Allow visiting /login freely
  if (pathname === '/login') {
    return { API_URL: PUBLIC_API_URL, token: '', user: null };
  }

  // Read tokens from sessionStorage
  const t = browser ? readTokens() : null;
  if (!t) {
    // Not logged in
    throw redirect(307, '/login');
  }

  // Refresh if expiring within 60 seconds
  const now = Date.now();
  const aboutToExpire = t.expiresAt - now < 60_000;

  let access = t.access;
  let refresh = t.refresh;
  let expiresAt = t.expiresAt;

  if (aboutToExpire) {
    const r = await fetch(`${PUBLIC_API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refresh })
    });
    if (r.ok) {
      const { data } = await r.json(); // { access_token, expires, refresh_token? }
      access = data.access_token;
      refresh = data.refresh_token ?? refresh; // Directus may or may not rotate refresh_token
      expiresAt = Date.now() + data.expires * 1000;
      writeTokens(access, refresh, expiresAt);
    } else {
      // Refresh failed → force login
      clearTokens();
      throw redirect(307, '/login');
    }
  }

  // Validate / fetch current user
  const u = await fetch(`${PUBLIC_API_URL}/users/me?fields=*,role.*`, {
    headers: { Authorization: `Bearer ${access}` }
  });

  if (u.status === 401) {
    // Access token invalid → try one last refresh or go to login
    clearTokens();
    throw redirect(307, '/login');
  }

  const { data: user } = await u.json();

  return {
    API_URL: PUBLIC_API_URL,
    token: access,
    user
  };
};
