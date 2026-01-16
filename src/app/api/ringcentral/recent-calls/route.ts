import { NextRequest, NextResponse } from "next/server";

interface RingCentralTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

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

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) {
    return cachedToken.token;
  }

  const clientId = process.env.RINGCENTRAL_CLIENT_ID?.trim();
  const clientSecret = process.env.RINGCENTRAL_CLIENT_SECRET?.trim();
  const jwtToken = process.env.RINGCENTRAL_JWT_TOKEN?.trim();

  if (!clientId || !clientSecret || !jwtToken) {
    throw new Error("Missing RingCentral credentials (CLIENT_ID, CLIENT_SECRET, or JWT_TOKEN)");
  }

  // Debug: Check JWT format
  const jwtPreview = jwtToken.substring(0, 30);
  const dotCount = (jwtToken.match(/\./g) || []).length;
  console.log(`JWT Debug: "${jwtPreview}...", dots: ${dotCount}, length: ${jwtToken.length}`);

  const tokenUrl = "https://platform.ringcentral.com/restapi/oauth/token";
  
  // JWT bearer grant flow
  const params = new URLSearchParams();
  params.append("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  params.append("assertion", jwtToken);

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${authHeader}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("RingCentral auth error:", response.status, errorText);
    let errorMessage = `Failed to authenticate with RingCentral: ${response.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error_description) {
        errorMessage = `RingCentral: ${errorJson.error_description}`;
      } else if (errorJson.message) {
        errorMessage = `RingCentral: ${errorJson.message}`;
      }
    } catch (e) {
      // Use default error message
    }
    throw new Error(errorMessage);
  }

  const data: RingCentralTokenResponse = await response.json();
  
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };

  return data.access_token;
}

function formatPhoneNumber(phone: string | undefined): string {
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
    const accessToken = await getAccessToken();

    const callLogUrl = new URL("https://platform.ringcentral.com/restapi/v1.0/account/~/extension/~/call-log");
    callLogUrl.searchParams.set("direction", "Inbound");
    callLogUrl.searchParams.set("perPage", "10");
    callLogUrl.searchParams.set("view", "Simple");
    
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    callLogUrl.searchParams.set("dateFrom", oneHourAgo.toISOString());

    const response = await fetch(callLogUrl.toString(), {
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("RingCentral call log error:", errorText);
      throw new Error(`Failed to fetch call log: ${response.status}`);
    }

    const data: CallLogResponse = await response.json();

    const filteredCalls = data.records
      .filter(call => 
        call.direction === "Inbound" && 
        (call.result === "Accepted" || call.result === "Ringing" || call.result === "In Progress")
      )
      .slice(0, 5)
      .map(call => ({
        id: call.id,
        fromPhoneNumber: call.from?.phoneNumber || null,
        fromPhoneNumberFormatted: formatPhoneNumber(call.from?.phoneNumber),
        fromName: call.from?.name || null,
        toPhoneNumber: call.to?.phoneNumber || null,
        toPhoneNumberFormatted: formatPhoneNumber(call.to?.phoneNumber),
        startTime: call.startTime,
        result: call.result,
        duration: call.duration,
      }));

    return NextResponse.json({
      success: true,
      calls: filteredCalls,
      fetchedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error("RingCentral API error:", error);
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
