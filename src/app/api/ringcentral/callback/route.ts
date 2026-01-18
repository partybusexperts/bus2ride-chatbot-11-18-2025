import { NextRequest, NextResponse } from "next/server";
import { storeTokens } from "@/lib/ringcentral-tokens";

function getRedirectBaseUrl(request: NextRequest): string {
  const replitDomain = process.env.REPLIT_DOMAINS?.split(',')[0];
  if (replitDomain) {
    return `https://${replitDomain}`;
  }
  const forwardedHost = request.headers.get('x-forwarded-host');
  if (forwardedHost) {
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    return `${proto}://${forwardedHost}`;
  }
  return 'https://newchatbot.replit.app';
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const appBaseUrl = getRedirectBaseUrl(request);

  if (error) {
    console.error("RingCentral OAuth error:", error);
    return NextResponse.redirect(new URL("/?rc_error=" + error, appBaseUrl));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/?rc_error=no_code", appBaseUrl));
  }

  const clientId = process.env.RINGCENTRAL_CLIENT_ID;
  const clientSecret = process.env.RINGCENTRAL_CLIENT_SECRET;
  const redirectUri =
    process.env.RINGCENTRAL_REDIRECT_URI ||
    "https://newchatbot.replit.app/api/ringcentral/callback";
  const rcApiBaseUrl =
    process.env.RINGCENTRAL_BASE_URL || "https://platform.ringcentral.com";

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/?rc_error=missing_credentials", appBaseUrl),
    );
  }

  try {
    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", redirectUri);

    const response = await fetch(`${rcApiBaseUrl}/restapi/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Token exchange failed:", errorText);
      return NextResponse.redirect(
        new URL("/?rc_error=token_exchange_failed", appBaseUrl),
      );
    }

    const data = await response.json();

    storeTokens(data.access_token, data.refresh_token, data.expires_in);

    console.log("RingCentral OAuth successful, tokens stored");

    return NextResponse.redirect(new URL("/?rc_connected=true", appBaseUrl));
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(new URL("/?rc_error=exception", appBaseUrl));
  }
}
