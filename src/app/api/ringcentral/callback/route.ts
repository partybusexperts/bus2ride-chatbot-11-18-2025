import { NextRequest, NextResponse } from "next/server";
import { storeTokens } from "@/lib/ringcentral-tokens";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    console.error("RingCentral OAuth error:", error);
    return NextResponse.redirect(new URL("/?rc_error=" + error, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/?rc_error=no_code", request.url));
  }

  const clientId = process.env.RINGCENTRAL_CLIENT_ID;
  const clientSecret = process.env.RINGCENTRAL_CLIENT_SECRET;
  const redirectUri = process.env.RINGCENTRAL_REDIRECT_URI || "https://newchatbot.replit.app/api/ringcentral/callback";
  const baseUrl = process.env.RINGCENTRAL_BASE_URL || "https://platform.ringcentral.com";

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/?rc_error=missing_credentials", request.url));
  }

  try {
    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", redirectUri);

    const response = await fetch(`${baseUrl}/restapi/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Token exchange failed:", errorText);
      return NextResponse.redirect(new URL("/?rc_error=token_exchange_failed", request.url));
    }

    const data = await response.json();
    
    storeTokens(data.access_token, data.refresh_token, data.expires_in);
    
    console.log("RingCentral OAuth successful, tokens stored");
    
    return NextResponse.redirect(new URL("/?rc_connected=true", request.url));
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(new URL("/?rc_error=exception", request.url));
  }
}
