import fs from 'fs';
import path from 'path';

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const TOKEN_FILE = path.join(process.cwd(), '.ringcentral-tokens.json');

function loadTokensFromFile(): StoredTokens | null {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const data = fs.readFileSync(TOKEN_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading tokens from file:', error);
  }
  return null;
}

function saveTokensToFile(tokens: StoredTokens | null): void {
  try {
    if (tokens) {
      fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    } else {
      if (fs.existsSync(TOKEN_FILE)) {
        fs.unlinkSync(TOKEN_FILE);
      }
    }
  } catch (error) {
    console.error('Error saving tokens to file:', error);
  }
}

let tokens: StoredTokens | null = loadTokensFromFile();

export function getStoredTokens(): StoredTokens | null {
  if (!tokens) {
    tokens = loadTokensFromFile();
  }
  return tokens;
}

export function storeTokens(accessToken: string, refreshToken: string, expiresIn: number): void {
  tokens = {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + (expiresIn * 1000),
  };
  saveTokensToFile(tokens);
  console.log('RingCentral tokens stored, expires at:', new Date(tokens.expiresAt).toISOString());
}

export function clearTokens(): void {
  tokens = null;
  saveTokensToFile(null);
}

export function isTokenExpired(): boolean {
  const storedTokens = getStoredTokens();
  if (!storedTokens) return true;
  return storedTokens.expiresAt < Date.now() + 60000;
}

export async function refreshAccessToken(): Promise<string | null> {
  const storedTokens = getStoredTokens();
  if (!storedTokens?.refreshToken) return null;

  const clientId = process.env.RINGCENTRAL_CLIENT_ID;
  const clientSecret = process.env.RINGCENTRAL_CLIENT_SECRET;
  const baseUrl = process.env.RINGCENTRAL_BASE_URL || "https://platform.ringcentral.com";

  if (!clientId || !clientSecret) return null;

  try {
    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("refresh_token", storedTokens.refreshToken);

    const response = await fetch(`${baseUrl}/restapi/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: params.toString(),
    });

    if (!response.ok) {
      console.error("Token refresh failed:", await response.text());
      clearTokens();
      return null;
    }

    const data = await response.json();
    storeTokens(data.access_token, data.refresh_token, data.expires_in);
    console.log('RingCentral tokens refreshed successfully');
    return data.access_token;
  } catch (error) {
    console.error("Token refresh error:", error);
    clearTokens();
    return null;
  }
}

export async function getValidAccessToken(): Promise<string | null> {
  const storedTokens = getStoredTokens();
  if (!storedTokens) return null;
  
  if (isTokenExpired()) {
    console.log('Token expired, refreshing...');
    return await refreshAccessToken();
  }
  
  return storedTokens.accessToken;
}
