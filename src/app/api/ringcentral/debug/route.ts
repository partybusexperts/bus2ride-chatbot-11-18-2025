import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const host = request.headers.get("x-forwarded-host");
  const proto = request.headers.get("x-forwarded-proto");
  const hostHeader = request.headers.get("host");
  const urlOrigin = new URL(request.url).origin;

  const detectedOrigin = host
    ? `${proto || "https"}://${host}`
    : hostHeader
      ? `${proto || "https"}://${hostHeader}`
      : urlOrigin;

  return NextResponse.json({
    detectedOrigin,
    redirectUri: `${detectedOrigin}/api/ringcentral/callback`,
    headers: {
      "x-forwarded-host": host,
      "x-forwarded-proto": proto,
      host: hostHeader,
    },
    requestUrlOrigin: urlOrigin,
    fullRequestUrl: request.url,
  });
}
