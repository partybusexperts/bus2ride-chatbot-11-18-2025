import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken, getStoredTokensAsync } from "@/lib/ringcentral-tokens";

interface CallLogRecord {
  id: string;
  uri: string;
  sessionId: string;
  startTime: string;
  duration: number;
  type: string;
  direction: string;
  action: string;
  result: string;
  from: {
    phoneNumber?: string;
    name?: string;
  };
  to: {
    phoneNumber?: string;
    name?: string;
  };
}

interface CallLogResponse {
  records: CallLogRecord[];
}

function formatPhone(phone: string | undefined | null): string {
  if (!phone) return "Unknown";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith("1")) {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

export async function GET(request: NextRequest) {
  try {
    const tokens = await getStoredTokensAsync();
    console.log('[recent-calls] tokens present?', !!tokens);
    if (!tokens) {
      return NextResponse.json({
        success: false,
        error: "Not connected to RingCentral. Please connect first.",
        needsAuth: true,
        calls: [],
      });
    }

    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return NextResponse.json({
        success: false,
        error: "RingCentral session expired. Please reconnect.",
        needsAuth: true,
        calls: [],
      });
    }

    const baseUrl = process.env.RINGCENTRAL_BASE_URL || "https://platform.ringcentral.com";
    const now = Date.now();

    // Fetch calls from the last 2 hours so there's always something to show
    const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);
    const callLogUrl = new URL(`${baseUrl}/restapi/v1.0/account/~/extension/~/call-log`);
    callLogUrl.searchParams.set("direction", "Inbound");
    callLogUrl.searchParams.set("perPage", "25");
    callLogUrl.searchParams.set("view", "Simple");
    callLogUrl.searchParams.set("dateFrom", twoHoursAgo.toISOString());

    console.log('[recent-calls] Fetching call log from RC API...');

    const response = await fetch(callLogUrl.toString(), {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[recent-calls] RC API error:", response.status, errorText);

      if (response.status === 401) {
        return NextResponse.json({
          success: false,
          error: "RingCentral session expired. Please reconnect.",
          needsAuth: true,
          calls: [],
        });
      }

      if (response.status === 429) {
        return NextResponse.json({
          success: false,
          error: "Rate limited by RingCentral. Please try again in a few seconds.",
          calls: [],
        });
      }

      throw new Error(`Failed to fetch call log: ${response.status}`);
    }

    const data: CallLogResponse = await response.json();
    console.log('[recent-calls] RC API returned', data.records?.length, 'records');

    const calls = (data.records || [])
      .filter(call =>
        call.direction === "Inbound" &&
        (call.result === "Accepted" || call.result === "Missed" || call.result === "Voicemail" || call.result === "InProgress" || call.result === "Ringing")
      )
      .slice(0, 5)
      .map(call => ({
        id: call.id,
        sessionId: call.sessionId,
        fromPhoneNumber: call.from?.phoneNumber || null,
        fromPhoneNumberFormatted: formatPhone(call.from?.phoneNumber),
        fromName: call.from?.name || null,
        toPhoneNumber: call.to?.phoneNumber || null,
        toPhoneNumberFormatted: formatPhone(call.to?.phoneNumber),
        startTime: call.startTime,
        status: call.result,
        direction: call.direction,
        duration: call.duration,
      }));

    return NextResponse.json({
      success: true,
      calls,
      fetchedAt: new Date().toISOString(),
      source: "calllog",
      totalRecords: data.records?.length || 0,
    });

  } catch (error) {
    console.error("[recent-calls] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        calls: [],
      },
      { status: 500 }
    );
  }
}
