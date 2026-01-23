import { NextRequest, NextResponse } from "next/server";
import { callEventBus, formatPhoneNumber } from "@/lib/call-event-bus";

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
    
    console.log(`[${new Date().toISOString()}] Webhook received`);

    if (notification.body) {
      const body = notification.body;
      const telephonySessionId = body.telephonySessionId || body.sessionId || "";
      
      if (body.parties && body.parties.length > 0) {
        for (const party of body.parties) {
          if (party.direction === "Inbound") {
            const status = party.status?.code || "Unknown";
            const callId = `${telephonySessionId}:${party.id}`;
            
            if (RINGING_STATES.includes(status)) {
              const fromPhone = party.from?.phoneNumber || '';
              const toPhone = party.to?.phoneNumber || '';
              
              console.log(`[RINGING] Inbound call from ${fromPhone || 'Unknown'} - Session: ${telephonySessionId}`);
              
              callEventBus.broadcastIncomingCall({
                id: callId,
                fromPhoneNumber: fromPhone,
                fromPhoneNumberFormatted: formatPhoneNumber(fromPhone) || 'Unknown',
                fromName: party.from?.name || '',
                toPhoneNumber: toPhone,
                toPhoneNumberFormatted: formatPhoneNumber(toPhone) || 'Unknown',
                status: status,
                startTime: body.creationTime || notification.timestamp,
              });
              
            } else if (ENDED_STATES.includes(status)) {
              console.log(`[ENDED] Call ended: ${callId} - Status: ${status}`);
              callEventBus.broadcastCallRemoved(callId);
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
    connectedClients: callEventBus.getClientCount(),
  });
}
