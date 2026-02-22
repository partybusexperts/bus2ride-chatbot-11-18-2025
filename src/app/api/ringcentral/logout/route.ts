import { NextResponse } from "next/server";
import { clearTokens } from "@/lib/ringcentral-tokens";

export async function POST() {
  await clearTokens();
  return NextResponse.json({ success: true, message: "Logged out of RingCentral" });
}

export async function GET() {
  await clearTokens();
  return NextResponse.json({ success: true, message: "Logged out of RingCentral. You can close this tab." });
}
