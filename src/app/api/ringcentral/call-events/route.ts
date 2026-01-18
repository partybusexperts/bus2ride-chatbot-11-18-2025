import { NextRequest } from "next/server";
import { getStoredTokens } from "@/lib/ringcentral-tokens";
import { subscribeToCallEvents, unsubscribeFromCallEvents, getRecentCalls } from "@/lib/ringcentral-calls-store";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const tokens = getStoredTokens();
  
  const encoder = new TextEncoder();
  let clientId: string | null = null;
  let closed = false;
  
  const stream = new ReadableStream({
    start(controller) {
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
        const calls = getRecentCalls(15);
        sendEvent('init', { calls });
      }
      
      clientId = subscribeToCallEvents((call) => {
        sendEvent('call_update', { call });
      });
      
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
        clearInterval(pingInterval);
        if (clientId) {
          unsubscribeFromCallEvents(clientId);
        }
      });
    },
    cancel() {
      closed = true;
      if (clientId) {
        unsubscribeFromCallEvents(clientId);
      }
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
