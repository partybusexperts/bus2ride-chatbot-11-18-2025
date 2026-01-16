import { NextResponse } from "next/server";
import { getStoredTokens, isTokenExpired } from "@/lib/ringcentral-tokens";

export async function GET() {
  const tokens = getStoredTokens();
  
  if (!tokens) {
    return NextResponse.json({
      connected: false,
      message: "Not connected to RingCentral",
    });
  }

  const expired = isTokenExpired();
  
  return NextResponse.json({
    connected: !expired,
    message: expired ? "Session expired, needs reconnection" : "Connected to RingCentral",
    expiresAt: tokens.expiresAt,
  });
}
