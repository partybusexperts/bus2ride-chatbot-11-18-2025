import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const clientId = process.env.RINGCENTRAL_CLIENT_ID;
  const redirectUri = process.env.RINGCENTRAL_REDIRECT_URI || "https://www.bus2ride.com/api/ringcentral/callback";
  const baseUrl = process.env.RINGCENTRAL_BASE_URL || "https://platform.ringcentral.com";

  if (!clientId) {
    return NextResponse.json({ error: "Missing RINGCENTRAL_CLIENT_ID" }, { status: 500 });
  }

  const state = Math.random().toString(36).substring(7);
  
  console.log("OAuth Login - Using redirect_uri:", redirectUri);
  
  const authUrl = new URL(`${baseUrl}/restapi/oauth/authorize`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  console.log("OAuth Login - Full auth URL:", authUrl.toString());

  return NextResponse.redirect(authUrl.toString());
}
