import { NextRequest } from "next/server";
import { callEventBus } from "@/lib/call-event-bus";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;
  let pingInterval: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (data: object) => {
        if (closed) return;
        try {
          const payload = JSON.stringify(data);
          controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        } catch (e) {
          console.error('[SSE] Send error:', e);
          closed = true;
        }
      };

      cleanup = callEventBus.addClient(sendEvent);

      pingInterval = setInterval(() => {
        if (closed) {
          if (pingInterval) clearInterval(pingInterval);
          return;
        }
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch (e) {
          console.error('[SSE] Ping error:', e);
          closed = true;
          if (cleanup) cleanup();
          if (pingInterval) clearInterval(pingInterval);
        }
      }, 15000);
    },
    cancel() {
      closed = true;
      if (cleanup) cleanup();
      if (pingInterval) clearInterval(pingInterval);
      console.log('[SSE] Client disconnected');
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
