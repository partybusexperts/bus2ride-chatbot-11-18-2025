import { NextRequest, NextResponse } from "next/server";
import { storeTokens } from "@/lib/ringcentral-tokens";

function getOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

/** Use env redirect URI only if it's a full https URL (production). Must match login. */
function getRedirectUri(request: NextRequest): string {
  const env = process.env.RINGCENTRAL_REDIRECT_URI?.trim();
  if (env && env.startsWith("https://")) return env;
  const origin = getOrigin(request);
  return `${origin}/api/ringcentral/callback`;
}

function errorPage(message: string): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html>
    <html>
      <head>
        <title>Error</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
            color: white;
          }
          .icon { font-size: 64px; margin-bottom: 16px; }
          h1 { margin: 0 0 8px; font-size: 24px; }
          p { margin: 0; opacity: 0.9; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="icon">✕</div>
        <h1>Connection Failed</h1>
        <p>${message}</p>
        <script>
          setTimeout(() => window.close(), 3000);
        </script>
      </body>
    </html>`,
    { headers: { 'Content-Type': 'text/html' } }
  );
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    console.error("RingCentral OAuth error:", error);
    return errorPage("OAuth error: " + error);
  }

  if (!code) {
    return errorPage("No authorization code received");
  }

  const clientId = process.env.RINGCENTRAL_CLIENT_ID;
  const clientSecret = process.env.RINGCENTRAL_CLIENT_SECRET;
  const origin = getOrigin(request);
  const redirectUri = getRedirectUri(request);
  console.log("OAuth Callback - origin:", origin, "redirectUri:", redirectUri);
  const rcApiBaseUrl =
    process.env.RINGCENTRAL_BASE_URL || "https://platform.ringcentral.com";

  if (!clientId || !clientSecret) {
    return errorPage("Missing RingCentral credentials");
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
      console.error("redirect_uri used:", redirectUri);
      return new NextResponse(
        `<!DOCTYPE html><html><head><title>Debug Error</title>
        <style>body{font-family:monospace;max-width:800px;margin:40px auto;padding:20px;background:#1e1e1e;color:#d4d4d4}
        h2{color:#f87171}pre{background:#2d2d2d;padding:12px;border-radius:8px;overflow-x:auto;white-space:pre-wrap}
        .label{color:#60a5fa;font-weight:bold}</style></head>
        <body>
          <h2>Token Exchange Failed</h2>
          <p class="label">redirect_uri sent to RC token endpoint:</p>
          <pre>${redirectUri}</pre>
          <p class="label">Origin detected by callback:</p>
          <pre>${origin}</pre>
          <p class="label">Request URL:</p>
          <pre>${request.url}</pre>
          <p class="label">x-forwarded-host:</p>
          <pre>${request.headers.get("x-forwarded-host") || "NOT SET"}</pre>
          <p class="label">x-forwarded-proto:</p>
          <pre>${request.headers.get("x-forwarded-proto") || "NOT SET"}</pre>
          <p class="label">host header:</p>
          <pre>${request.headers.get("host") || "NOT SET"}</pre>
          <p class="label">RingCentral response:</p>
          <pre>${errorText}</pre>
          <p class="label">Code received:</p>
          <pre>${code}</pre>
        </body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const data = await response.json();

    await storeTokens(data.access_token, data.refresh_token, data.expires_in);

    console.log("RingCentral OAuth successful, tokens stored");

    // Return HTML that closes the popup window instead of redirecting
    return new NextResponse(
      `<!DOCTYPE html>
      <html>
        <head>
          <title>Connected!</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              color: white;
            }
            .checkmark { font-size: 64px; margin-bottom: 16px; }
            h1 { margin: 0 0 8px; font-size: 24px; }
            p { margin: 0; opacity: 0.9; }
            .close-btn {
              margin-top: 20px;
              padding: 12px 24px;
              background: white;
              color: #059669;
              border: none;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
            }
            .close-btn:hover { background: #f0fdf4; }
          </style>
        </head>
        <body>
          <div class="checkmark">✓</div>
          <h1>Connected to RingCentral!</h1>
          <p>This window will close automatically...</p>
          <button class="close-btn" onclick="window.close()">Close This Window</button>
          <script>
            // Notify parent window if it exists
            if (window.opener) {
              window.opener.postMessage({ type: 'ringcentral_connected' }, '*');
            }
            // Try to close automatically
            setTimeout(() => {
              window.close();
            }, 1500);
          </script>
        </body>
      </html>`,
      {
        headers: { 'Content-Type': 'text/html' },
      }
    );
  } catch (error) {
    console.error("OAuth callback error:", error);
    return errorPage("An unexpected error occurred. Please try again.");
  }
}
