import { NextRequest } from "next/server";
import { getStoredTokens } from "@/lib/ringcentral-tokens";
import { supabase } from "@/lib/supabase";

export const dynamic = 'force-dynamic';

interface ActiveCall {
  id: string;
  session_id: string;
  telephony_session_id: string;
  status: string;
  direction: string;
  from_phone: string | null;
  from_name: string | null;
  to_phone: string | null;
  to_name: string | null;
  start_time: string;
}

function formatCallForClient(call: ActiveCall) {
  return {
    id: call.id,
    sessionId: call.session_id,
    telephonySessionId: call.telephony_session_id,
    status: call.status,
    direction: call.direction,
    fromPhoneNumber: call.from_phone,
    fromPhoneNumberFormatted: call.from_phone || 'Unknown',
    fromName: call.from_name,
    toPhoneNumber: call.to_phone,
    toPhoneNumberFormatted: call.to_phone || 'Unknown',
    toName: call.to_name,
    startTime: call.start_time,
    result: call.status,
  };
}

async function getActiveCallsFromDb() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('active_ringing_calls')
    .select('*')
    .gte('created_at', fiveMinutesAgo)
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching active calls:', error);
    return [];
  }
  
  return (data || []).map(formatCallForClient);
}

export async function GET(request: NextRequest) {
  const tokens = getStoredTokens();
  
  const encoder = new TextEncoder();
  let closed = false;
  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let lastCallIds = new Set<string>();
  
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (eventType: string, data: any) => {
        if (closed) return;
        try {
          const payload = JSON.stringify({ type: eventType, ...data });
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch (e) {
          console.error('SSE send error:', e);
        }
      };
      
      if (!tokens) {
        sendEvent('auth_required', { message: 'Not connected to RingCentral' });
      } else {
        const calls = await getActiveCallsFromDb();
        sendEvent('init', { calls });
        lastCallIds = new Set(calls.map((c: { id: string }) => c.id));
      }
      
      pollInterval = setInterval(async () => {
        if (closed) {
          if (pollInterval) clearInterval(pollInterval);
          return;
        }
        
        try {
          const calls = await getActiveCallsFromDb();
          const currentIds = new Set(calls.map((c: { id: string }) => c.id));
          
          const newCalls = calls.filter((c: { id: string }) => !lastCallIds.has(c.id));
          const removedIds = [...lastCallIds].filter(id => !currentIds.has(id));
          
          for (const call of newCalls) {
            sendEvent('call_update', { call, action: 'add' });
          }
          
          for (const id of removedIds) {
            sendEvent('call_removed', { id });
          }
          
          lastCallIds = currentIds;
        } catch (e) {
          console.error('Poll error:', e);
        }
      }, 1000);
      
      const pingInterval = setInterval(() => {
        if (closed) {
          clearInterval(pingInterval);
          return;
        }
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch (e) {
          clearInterval(pingInterval);
        }
      }, 15000);
      
      request.signal.addEventListener('abort', () => {
        closed = true;
        if (pollInterval) clearInterval(pollInterval);
        clearInterval(pingInterval);
      });
    },
    cancel() {
      closed = true;
      if (pollInterval) clearInterval(pollInterval);
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
