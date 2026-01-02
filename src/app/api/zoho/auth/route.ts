import { NextResponse } from "next/server";

let cachedAccessToken: string | null = null;
let tokenExpiry: number = 0;

export async function getZohoAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < tokenExpiry) {
    return cachedAccessToken;
  }

  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Zoho credentials not configured");
  }

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://accounts.zoho.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Zoho token refresh failed:", errorText);
    throw new Error(`Failed to refresh Zoho token: ${response.status}`);
  }

  const data = await response.json();
  
  if (!data.access_token) {
    throw new Error("No access token in Zoho response");
  }

  cachedAccessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;

  return cachedAccessToken as string;
}

export async function GET() {
  try {
    const token = await getZohoAccessToken();
    return NextResponse.json({ success: true, hasToken: !!token });
  } catch (error) {
    console.error("Zoho auth error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Auth failed" },
      { status: 500 }
    );
  }
}
