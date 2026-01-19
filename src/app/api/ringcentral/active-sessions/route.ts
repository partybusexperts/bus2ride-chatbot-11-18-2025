import { NextRequest, NextResponse } from "next/server";
import { getValidAccessToken, getStoredTokens } from "@/lib/ringcentral-tokens";
import { addOrUpdateCall, formatPhoneNumber } from "@/lib/ringcentral-calls-store";

interface TelephonySession {
  id: string;
  creationTime: string;
  parties: Array<{
    id: string;
    direction: string;
    from?: {
      phoneNumber?: string;
      name?: string;
    };
    to?: {
      phoneNumber?: string;
      name?: string;
    };
    status?: {
      code?: string;
    };
  }>;
}

interface TelephonySessionsResponse {
  records: TelephonySession[];
}

export async function GET(request: NextRequest) {
  try {
    const tokens = getStoredTokens();
    if (!tokens) {
      return NextResponse.json({
        success: false,
        error: "Not connected to RingCentral",
        needsAuth: true,
        sessions: [],
      });
    }

    const accessToken = await getValidAccessToken();
    if (!accessToken) {
      return NextResponse.json({
        success: false,
        error: "RingCentral session expired",
        needsAuth: true,
        sessions: [],
      });
    }

    const baseUrl = process.env.RINGCENTRAL_BASE_URL || "https://platform.ringcentral.com";
    const url = `${baseUrl}/restapi/v1.0/account/~/telephony/sessions?direction=Inbound`;

    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Telephony sessions API error:", response.status, errorText);
      
      if (response.status === 401) {
        return NextResponse.json({
          success: false,
          error: "RingCentral session expired",
          needsAuth: true,
          sessions: [],
        });
      }
      
      return NextResponse.json({
        success: false,
        error: `API error: ${response.status}`,
        sessions: [],
      });
    }

    const data: TelephonySessionsResponse = await response.json();
    
    const activeCalls = [];
    
    for (const session of data.records || []) {
      for (const party of session.parties || []) {
        if (party.direction === "Inbound") {
          const status = party.status?.code || "Unknown";
          
          addOrUpdateCall({
            sessionId: session.id,
            telephonySessionId: session.id,
            status: status,
            direction: party.direction,
            from: party.from,
            to: party.to,
            startTime: session.creationTime,
          });
          
          activeCalls.push({
            sessionId: session.id,
            fromPhoneNumber: party.from?.phoneNumber || null,
            fromPhoneNumberFormatted: formatPhoneNumber(party.from?.phoneNumber),
            fromName: party.from?.name || null,
            toPhoneNumber: party.to?.phoneNumber || null,
            toPhoneNumberFormatted: formatPhoneNumber(party.to?.phoneNumber),
            status: status,
            direction: party.direction,
            startTime: session.creationTime,
          });
          
          console.log(`Active session: ${session.id} from ${party.from?.phoneNumber || 'Unknown'} - Status: ${status}`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      sessions: activeCalls,
      count: activeCalls.length,
      fetchedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error("Active sessions error:", error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      sessions: [],
    }, { status: 500 });
  }
}
