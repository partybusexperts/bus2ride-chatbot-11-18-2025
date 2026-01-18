import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken, getStoredTokens } from "@/lib/ringcentral-tokens";
import { addOrUpdateCall, getRecentCalls, formatPhoneNumber } from "@/lib/ringcentral-calls-store";

interface ActiveCallParty {
  id: string;
  direction: string;
  from?: { phoneNumber?: string; name?: string };
  to?: { phoneNumber?: string; name?: string };
  status?: { code?: string };
}

interface ActiveCallRecord {
  id: string;
  telephonySessionId: string;
  serverId: string;
  origin?: { type?: string };
  parties?: ActiveCallParty[];
  creationTime?: string;
}

interface ActiveCallsResponse {
  records: ActiveCallRecord[];
}

interface CachedActiveCalls {
  calls: any[];
  fetchedAt: number;
}

let activeCallsCache: CachedActiveCalls | null = null;
const CACHE_TTL_MS = 3000;

export async function GET(request: NextRequest) {
  try {
    const tokens = getStoredTokens();
    if (!tokens) {
      return NextResponse.json({
        success: false,
        error: "Not connected to RingCentral",
        needsAuth: true,
        calls: [],
      });
    }

    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return NextResponse.json({
        success: false,
        error: "Session expired",
        needsAuth: true,
        calls: [],
      });
    }

    const now = Date.now();
    if (activeCallsCache && (now - activeCallsCache.fetchedAt) < CACHE_TTL_MS) {
      return NextResponse.json({
        success: true,
        calls: activeCallsCache.calls,
        fetchedAt: new Date(activeCallsCache.fetchedAt).toISOString(),
        source: "cached",
      });
    }

    const baseUrl = process.env.RINGCENTRAL_BASE_URL || "https://platform.ringcentral.com";
    const activeCallsUrl = `${baseUrl}/restapi/v1.0/account/~/extension/~/active-calls?direction=Inbound&view=Simple`;

    const response = await fetch(activeCallsUrl, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        if (activeCallsCache) {
          return NextResponse.json({
            success: true,
            calls: activeCallsCache.calls,
            fetchedAt: new Date(activeCallsCache.fetchedAt).toISOString(),
            source: "cached_ratelimit",
          });
        }
        return NextResponse.json({
          success: true,
          calls: getRecentCalls(10).filter(c => 
            c.status === 'Proceeding' || c.status === 'Ringing' || c.status === 'Answered'
          ),
          source: "memory_fallback",
        });
      }
      
      if (response.status === 401) {
        return NextResponse.json({
          success: false,
          error: "Session expired",
          needsAuth: true,
          calls: [],
        });
      }
      
      throw new Error(`Active calls API error: ${response.status}`);
    }

    const data: ActiveCallsResponse = await response.json();

    const activeCalls = data.records
      .filter(record => record.parties?.some(p => p.direction === 'Inbound'))
      .map(record => {
        const inboundParty = record.parties?.find(p => p.direction === 'Inbound');
        const status = inboundParty?.status?.code || 'Active';
        
        addOrUpdateCall({
          sessionId: record.telephonySessionId,
          telephonySessionId: record.telephonySessionId,
          status: status,
          direction: 'Inbound',
          from: inboundParty?.from,
          to: inboundParty?.to,
          startTime: record.creationTime,
        });

        return {
          id: record.id,
          sessionId: record.telephonySessionId,
          telephonySessionId: record.telephonySessionId,
          fromPhoneNumber: inboundParty?.from?.phoneNumber || null,
          fromPhoneNumberFormatted: formatPhoneNumber(inboundParty?.from?.phoneNumber),
          fromName: inboundParty?.from?.name || null,
          toPhoneNumber: inboundParty?.to?.phoneNumber || null,
          toPhoneNumberFormatted: formatPhoneNumber(inboundParty?.to?.phoneNumber),
          status: status,
          direction: 'Inbound',
          startTime: record.creationTime || new Date().toISOString(),
          isActive: true,
        };
      });

    activeCallsCache = {
      calls: activeCalls,
      fetchedAt: now,
    };

    return NextResponse.json({
      success: true,
      calls: activeCalls,
      fetchedAt: new Date().toISOString(),
      source: "api",
    });

  } catch (error) {
    console.error("Active calls API error:", error);
    
    if (activeCallsCache) {
      return NextResponse.json({
        success: true,
        calls: activeCallsCache.calls,
        fetchedAt: new Date(activeCallsCache.fetchedAt).toISOString(),
        source: "cached_error",
      });
    }
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      calls: [],
    }, { status: 500 });
  }
}
