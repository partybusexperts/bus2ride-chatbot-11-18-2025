import { NextRequest, NextResponse } from "next/server";
import { addOrUpdateCall, removeCall } from "@/lib/ringcentral-calls-store";

interface TelephonySessionParty {
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
}

interface TelephonySessionBody {
  telephonySessionId: string;
  sessionId?: string;
  parties?: TelephonySessionParty[];
  origin?: {
    type?: string;
  };
  creationTime?: string;
}

interface WebhookNotification {
  uuid: string;
  event: string;
  timestamp: string;
  subscriptionId: string;
  body?: TelephonySessionBody;
}

const RINGING_STATES = ['Proceeding', 'Setup', 'Ringing'];
const ENDED_STATES = ['Answered', 'Disconnected', 'Missed', 'Voicemail', 'Gone', 'Parked'];

export async function POST(request: NextRequest) {
  try {
    const validationToken = request.headers.get("Validation-Token");
    if (validationToken) {
      console.log("RingCentral webhook validation request received");
      return new NextResponse(null, {
        status: 200,
        headers: {
          "Validation-Token": validationToken,
        },
      });
    }

    const notification: WebhookNotification = await request.json();
    const receivedAt = Date.now();
    
    console.log(`[${new Date().toISOString()}] Webhook received in ${Date.now() - receivedAt}ms`);

    if (notification.body) {
      const body = notification.body;
      const sessionId = body.telephonySessionId || body.sessionId || "";
      
      if (body.parties && body.parties.length > 0) {
        for (const party of body.parties) {
          if (party.direction === "Inbound") {
            const status = party.status?.code || "Unknown";
            
            if (RINGING_STATES.includes(status)) {
              addOrUpdateCall({
                sessionId: sessionId,
                telephonySessionId: body.telephonySessionId,
                status: 'Ringing',
                direction: party.direction,
                from: party.from,
                to: party.to,
                startTime: body.creationTime || notification.timestamp,
              });
              
              console.log(`[RINGING] Inbound call from ${party.from?.phoneNumber || 'Unknown'} - Session: ${sessionId}`);
            } else if (ENDED_STATES.includes(status)) {
              removeCall(sessionId);
              console.log(`[ENDED] Call ended: ${sessionId} - Status: ${status}`);
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true, processedAt: Date.now() });

  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ success: false, error: "Processing error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: "Webhook endpoint active",
    timestamp: new Date().toISOString(),
  });
}
