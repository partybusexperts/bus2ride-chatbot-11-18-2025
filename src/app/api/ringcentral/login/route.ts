import { NextRequest, NextResponse } from "next/server";

function getOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  const clientId = process.env.RINGCENTRAL_CLIENT_ID;
  const origin = getOrigin(request);
  const redirectUri = `${origin}/api/ringcentral/callback`;
  const baseUrl =
    process.env.RINGCENTRAL_BASE_URL || "https://platform.ringcentral.com";

  if (!clientId) {
    return NextResponse.json(
      { error: "Missing RINGCENTRAL_CLIENT_ID" },
      { status: 500 },
    );
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
