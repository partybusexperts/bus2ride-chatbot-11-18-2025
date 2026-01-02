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

  console.log("Zoho credentials check:", {
    clientIdLength: clientId?.length || 0,
    clientIdPrefix: clientId?.substring(0, 10) || "missing",
    clientSecretLength: clientSecret?.length || 0,
    clientSecretPrefix: clientSecret?.substring(0, 10) || "missing",
    refreshTokenLength: refreshToken?.length || 0,
  });

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Zoho credentials not configured");
  }

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const zohoRegions = [
    "https://accounts.zoho.com/oauth/v2/token",
    "https://accounts.zoho.eu/oauth/v2/token",
    "https://accounts.zoho.in/oauth/v2/token",
    "https://accounts.zoho.com.au/oauth/v2/token",
  ];

  let lastError = "";
  let data: any = null;

  for (const endpoint of zohoRegions) {
    try {
      console.log(`Trying Zoho endpoint: ${endpoint}`);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      const responseText = await response.text();
      console.log(`Zoho response from ${endpoint}:`, responseText);

      if (!response.ok) {
        lastError = `${endpoint}: ${response.status} - ${responseText}`;
        continue;
      }

      try {
        data = JSON.parse(responseText);
        if (data.access_token) {
          console.log("Successfully got access token from:", endpoint);
          break;
        } else {
          lastError = `${endpoint}: No access_token in response - ${responseText}`;
        }
      } catch (parseErr) {
        lastError = `${endpoint}: Failed to parse response - ${responseText}`;
      }
    } catch (fetchErr) {
      lastError = `${endpoint}: Fetch error - ${fetchErr}`;
    }
  }

  if (!data?.access_token) {
    console.error("All Zoho endpoints failed. Last error:", lastError);
    throw new Error(`Failed to get Zoho access token: ${lastError}`);
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
