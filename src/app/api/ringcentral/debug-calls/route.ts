import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken, getStoredTokensAsync } from "@/lib/ringcentral-tokens";

export async function GET(request: NextRequest) {
  const tokens = await getStoredTokensAsync();
  if (!tokens) {
    return NextResponse.json({ error: "Not connected" }, { status: 401 });
  }

  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Token expired" }, { status: 401 });
  }

  const baseUrl = process.env.RINGCENTRAL_BASE_URL || "https://platform.ringcentral.com";
  const now = Date.now();
  const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);

  const callLogUrl = new URL(`${baseUrl}/restapi/v1.0/account/~/extension/~/call-log`);
  callLogUrl.searchParams.set("direction", "Inbound");
  callLogUrl.searchParams.set("perPage", "3");
  callLogUrl.searchParams.set("view", "Detailed");
  callLogUrl.searchParams.set("dateFrom", twoHoursAgo.toISOString());

  const response = await fetch(callLogUrl.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: `RC API error: ${response.status}`, body: await response.text() },
      { status: 500 },
    );
  }

  const data = await response.json();

  return NextResponse.json({
    recordCount: data.records?.length || 0,
    records: (data.records || []).map((r: any) => ({
      id: r.id,
      direction: r.direction,
      result: r.result,
      from: r.from,
      to: r.to,
      startTime: r.startTime,
      legs: r.legs,
    })),
  });
}
