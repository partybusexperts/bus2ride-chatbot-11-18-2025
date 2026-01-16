interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

let tokens: StoredTokens | null = null;

export function getStoredTokens(): StoredTokens | null {
  return tokens;
}

export function storeTokens(accessToken: string, refreshToken: string, expiresIn: number): void {
  tokens = {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + (expiresIn * 1000),
  };
}

export function clearTokens(): void {
  tokens = null;
}

export function isTokenExpired(): boolean {
  if (!tokens) return true;
  return tokens.expiresAt < Date.now() + 60000;
}

export async function refreshAccessToken(): Promise<string | null> {
  if (!tokens?.refreshToken) return null;

  const clientId = process.env.RINGCENTRAL_CLIENT_ID;
  const clientSecret = process.env.RINGCENTRAL_CLIENT_SECRET;
  const baseUrl = process.env.RINGCENTRAL_BASE_URL || "https://platform.ringcentral.com";

  if (!clientId || !clientSecret) return null;

  try {
    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("refresh_token", tokens.refreshToken);

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
    return data.access_token;
  } catch (error) {
    console.error("Token refresh error:", error);
    clearTokens();
    return null;
  }
}

export async function getValidAccessToken(): Promise<string | null> {
  if (!tokens) return null;
  
  if (isTokenExpired()) {
    return await refreshAccessToken();
  }
  
  return tokens.accessToken;
}
