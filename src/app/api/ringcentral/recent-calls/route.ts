import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken, getStoredTokens } from "@/lib/ringcentral-tokens";
import { getRecentCalls, getSubscriptionInfo, formatPhoneNumber } from "@/lib/ringcentral-calls-store";

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
  paging: {
    page: number;
    perPage: number;
    pageStart: number;
    pageEnd: number;
  };
}

interface CachedCallLog {
  calls: any[];
  fetchedAt: number;
}

let callLogCache: CachedCallLog | null = null;
const CACHE_TTL_MS = 10000;

export async function GET(request: NextRequest) {
  try {
    const tokens = getStoredTokens();
    console.log('recent-calls: tokens present?', !!tokens, tokens ? `expires: ${new Date(tokens.expiresAt).toISOString()}` : 'no tokens');
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

    const subscriptionInfo = getSubscriptionInfo();
    const realtimeCalls = getRecentCalls(10);
    
    if (subscriptionInfo.isActive && realtimeCalls.length > 0) {
      return NextResponse.json({
        success: true,
        calls: realtimeCalls,
        fetchedAt: new Date().toISOString(),
        source: "realtime",
        subscriptionActive: true,
      });
    }

    const now = Date.now();
    if (callLogCache && (now - callLogCache.fetchedAt) < CACHE_TTL_MS) {
      const combinedCalls = [...realtimeCalls];
      for (const call of callLogCache.calls) {
        if (!combinedCalls.some(c => c.sessionId === call.sessionId)) {
          combinedCalls.push(call);
        }
      }
      combinedCalls.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
      
      return NextResponse.json({
        success: true,
        calls: combinedCalls.slice(0, 10),
        fetchedAt: new Date(callLogCache.fetchedAt).toISOString(),
        source: "cached",
        subscriptionActive: subscriptionInfo.isActive,
      });
    }

    const baseUrl = process.env.RINGCENTRAL_BASE_URL || "https://platform.ringcentral.com";
    const callLogUrl = new URL(`${baseUrl}/restapi/v1.0/account/~/extension/~/call-log`);
    callLogUrl.searchParams.set("direction", "Inbound");
    callLogUrl.searchParams.set("perPage", "15");
    callLogUrl.searchParams.set("view", "Simple");
    
    const fifteenMinutesAgo = new Date(now - 15 * 60 * 1000);
    callLogUrl.searchParams.set("dateFrom", fifteenMinutesAgo.toISOString());

    const response = await fetch(callLogUrl.toString(), {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("RingCentral call log error:", response.status, errorText);
      
      if (response.status === 401) {
        return NextResponse.json({
          success: false,
          error: "RingCentral session expired. Please reconnect.",
          needsAuth: true,
          calls: [],
        });
      }
      
      if (response.status === 429) {
        if (callLogCache) {
          const combinedCalls = [...realtimeCalls];
          for (const call of callLogCache.calls) {
            if (!combinedCalls.some(c => c.sessionId === call.sessionId)) {
              combinedCalls.push(call);
            }
          }
          combinedCalls.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
          
          return NextResponse.json({
            success: true,
            calls: combinedCalls.slice(0, 10),
            fetchedAt: new Date(callLogCache.fetchedAt).toISOString(),
            source: "cached_ratelimit",
            subscriptionActive: subscriptionInfo.isActive,
          });
        }
        
        if (realtimeCalls.length > 0) {
          return NextResponse.json({
            success: true,
            calls: realtimeCalls,
            fetchedAt: new Date().toISOString(),
            source: "realtime_ratelimit",
            subscriptionActive: subscriptionInfo.isActive,
          });
        }
        
        return NextResponse.json({
          success: false,
          error: "Rate limited by RingCentral. Please try again in a few seconds.",
          calls: [],
        });
      }
      
      throw new Error(`Failed to fetch call log: ${response.status}`);
    }

    const data: CallLogResponse = await response.json();

    const filteredCalls = data.records
      .filter(call => 
        call.direction === "Inbound" && 
        (call.result === "Accepted" || call.result === "Missed" || call.result === "Voicemail")
      )
      .slice(0, 10)
      .map(call => ({
        id: call.id,
        sessionId: call.sessionId,
        fromPhoneNumber: call.from?.phoneNumber || null,
        fromPhoneNumberFormatted: formatPhoneNumber(call.from?.phoneNumber),
        fromName: call.from?.name || null,
        toPhoneNumber: call.to?.phoneNumber || null,
        toPhoneNumberFormatted: formatPhoneNumber(call.to?.phoneNumber),
        startTime: call.startTime,
        status: call.result,
        direction: call.direction,
        duration: call.duration,
      }));

    callLogCache = {
      calls: filteredCalls,
      fetchedAt: now,
    };

    const combinedCalls = [...realtimeCalls];
    for (const call of filteredCalls) {
      if (!combinedCalls.some(c => c.sessionId === call.sessionId)) {
        combinedCalls.push(call as any);
      }
    }

    combinedCalls.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

    return NextResponse.json({
      success: true,
      calls: combinedCalls.slice(0, 10),
      fetchedAt: new Date().toISOString(),
      source: subscriptionInfo.isActive ? "combined" : "calllog",
      subscriptionActive: subscriptionInfo.isActive,
    });

  } catch (error) {
    console.error("RingCentral API error:", error);
    
    const realtimeCalls = getRecentCalls(10);
    if (realtimeCalls.length > 0) {
      return NextResponse.json({
        success: true,
        calls: realtimeCalls,
        fetchedAt: new Date().toISOString(),
        source: "realtime_fallback",
        subscriptionActive: getSubscriptionInfo().isActive,
      });
    }
    
    if (callLogCache) {
      return NextResponse.json({
        success: true,
        calls: callLogCache.calls.slice(0, 10),
        fetchedAt: new Date(callLogCache.fetchedAt).toISOString(),
        source: "cached_fallback",
        subscriptionActive: getSubscriptionInfo().isActive,
      });
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error",
        calls: [] 
      },
      { status: 500 }
    );
  }
}
