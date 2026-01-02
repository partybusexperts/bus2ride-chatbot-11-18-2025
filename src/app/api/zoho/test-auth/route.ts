import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN;

  const credentials = {
    clientIdLength: clientId?.length || 0,
    clientIdPrefix: clientId?.substring(0, 10) || "missing",
    clientSecretLength: clientSecret?.length || 0,
    clientSecretPrefix: clientSecret?.substring(0, 10) || "missing",
    refreshTokenLength: refreshToken?.length || 0,
    refreshTokenPrefix: refreshToken?.substring(0, 10) || "missing",
  };

  if (!clientId || !clientSecret || !refreshToken) {
    return NextResponse.json({
      success: false,
      error: "Missing credentials - check Replit Secrets",
      credentials
    });
  }

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const zohoRegions = [
    { url: "https://accounts.zoho.com/oauth/v2/token", region: "US" },
    { url: "https://accounts.zoho.eu/oauth/v2/token", region: "EU" },
    { url: "https://accounts.zoho.in/oauth/v2/token", region: "India" },
    { url: "https://accounts.zoho.com.au/oauth/v2/token", region: "Australia" },
  ];

  const results: any[] = [];

  for (const { url, region } of zohoRegions) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      if (data.access_token) {
        return NextResponse.json({
          success: true,
          message: `Connected successfully to Zoho ${region}!`,
          region,
          credentials
        });
      }

      results.push({ region, error: data.error || data.raw || "Unknown error" });
    } catch (err) {
      results.push({ region, error: `Fetch failed: ${err}` });
    }
  }

  return NextResponse.json({
    success: false,
    error: `All regions failed. US error: ${results.find(r => r.region === "US")?.error || "unknown"}`,
    details: results,
    credentials
  });
}
