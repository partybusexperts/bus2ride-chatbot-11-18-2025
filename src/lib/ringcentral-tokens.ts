import { createClient } from '@supabase/supabase-js';

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const TOKENS_KEY = 'ringcentral_tokens';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// In-memory cache so we don't hit Supabase on every request within the same
// serverless invocation. On cold starts this will be null and we'll read from DB.
let cachedTokens: StoredTokens | null = null;

export async function getStoredTokensAsync(): Promise<StoredTokens | null> {
  if (cachedTokens) return cachedTokens;

  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data } = await sb
      .from('app_settings')
      .select('value')
      .eq('key', TOKENS_KEY)
      .single();

    if (data?.value) {
      cachedTokens = data.value as StoredTokens;
      return cachedTokens;
    }
  } catch (e) {
    console.error('[RC Tokens] Error reading from Supabase:', e);
  }
  return null;
}

// Synchronous getter that returns the in-memory cache only.
// Call getStoredTokensAsync() first if you need a fresh read.
export function getStoredTokens(): StoredTokens | null {
  return cachedTokens;
}

export async function storeTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
): Promise<void> {
  const tokens: StoredTokens = {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  cachedTokens = tokens;

  const sb = getSupabase();
  if (!sb) {
    console.warn('[RC Tokens] No Supabase client — tokens cached in memory only');
    return;
  }

  try {
    const { error } = await sb.from('app_settings').upsert({
      key: TOKENS_KEY,
      value: tokens,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.error('[RC Tokens] Supabase upsert error:', error.message);
    } else {
      console.log(
        '[RC Tokens] Stored in Supabase, expires:',
        new Date(tokens.expiresAt).toISOString(),
      );
    }
  } catch (e) {
    console.error('[RC Tokens] Error writing to Supabase:', e);
  }
}

export async function clearTokens(): Promise<void> {
  cachedTokens = null;

  const sb = getSupabase();
  if (!sb) return;

  try {
    await sb.from('app_settings').delete().eq('key', TOKENS_KEY);
  } catch (e) {
    console.error('[RC Tokens] Error clearing tokens:', e);
  }
}

export function isTokenExpired(): boolean {
  if (!cachedTokens) return true;
  return cachedTokens.expiresAt < Date.now() + 60000;
}

export async function refreshAccessToken(): Promise<string | null> {
  // Always read from DB in case another serverless instance refreshed
  const storedTokens = await getStoredTokensAsync();
  if (!storedTokens?.refreshToken) return null;

  // If the stored token is still valid (maybe refreshed by another instance), use it
  if (storedTokens.expiresAt > Date.now() + 60000) {
    cachedTokens = storedTokens;
    return storedTokens.accessToken;
  }

  const clientId = process.env.RINGCENTRAL_CLIENT_ID;
  const clientSecret = process.env.RINGCENTRAL_CLIENT_SECRET;
  const baseUrl =
    process.env.RINGCENTRAL_BASE_URL || 'https://platform.ringcentral.com';

  if (!clientId || !clientSecret) return null;

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', storedTokens.refreshToken);

    const response = await fetch(`${baseUrl}/restapi/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: params.toString(),
    });

    if (!response.ok) {
      console.error('[RC Tokens] Refresh failed:', await response.text());
      await clearTokens();
      return null;
    }

    const data = await response.json();
    await storeTokens(data.access_token, data.refresh_token, data.expires_in);
    console.log('[RC Tokens] Refreshed successfully');
    return data.access_token;
  } catch (error) {
    console.error('[RC Tokens] Refresh error:', error);
    await clearTokens();
    return null;
  }
}

export async function getValidAccessToken(): Promise<string | null> {
  // Always try DB first in case memory cache is stale (cold start)
  const storedTokens = await getStoredTokensAsync();
  if (!storedTokens) return null;

  if (isTokenExpired()) {
    console.log('[RC Tokens] Token expired, refreshing...');
    return await refreshAccessToken();
  }

  return storedTokens.accessToken;
}
