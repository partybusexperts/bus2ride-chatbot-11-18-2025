import { NextRequest, NextResponse } from "next/server";
import { storeTokens } from "@/lib/ringcentral-tokens";

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
  // Must match exactly what the login route sent to RingCentral
  const origin = new URL(request.url).origin;
  const redirectUri =
    process.env.RINGCENTRAL_REDIRECT_URI ||
    `${origin}/api/ringcentral/callback`;
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
      return errorPage("Token exchange failed. Please try again.");
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
