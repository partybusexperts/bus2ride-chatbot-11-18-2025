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

  const authUrl = new URL(`${baseUrl}/restapi/oauth/authorize`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);

  const debugMode = request.nextUrl.searchParams.get("debug") === "1";

  if (debugMode) {
    return new NextResponse(
      `<!DOCTYPE html><html><head><title>RC Login Debug</title>
      <style>body{font-family:sans-serif;max-width:700px;margin:40px auto;padding:20px}
      code{background:#f3f4f6;padding:2px 6px;border-radius:4px;word-break:break-all}
      pre{background:#f3f4f6;padding:12px;border-radius:8px;overflow-x:auto;word-break:break-all;white-space:pre-wrap}
      .btn{display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;margin-top:16px}</style></head>
      <body>
        <h2>RingCentral Login Debug</h2>
        <p><strong>Detected origin:</strong><br><code>${origin}</code></p>
        <p><strong>redirect_uri being sent:</strong><br><code>${redirectUri}</code></p>
        <p><strong>client_id:</strong><br><code>${clientId}</code></p>
        <p><strong>RC base URL:</strong><br><code>${baseUrl}</code></p>
        <p><strong>Full auth URL:</strong></p>
        <pre>${authUrl.toString()}</pre>
        <p>Copy the <code>redirect_uri</code> above and make sure it <strong>exactly matches</strong> what is in your RingCentral app's OAuth settings.</p>
        <a class="btn" href="${authUrl.toString()}">Proceed to RingCentral Login →</a>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  return NextResponse.redirect(authUrl.toString());
}
