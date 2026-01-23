type CallEventType = 'incoming_call' | 'call_removed' | 'connected' | 'ping';

interface CallData {
  id: string;
  fromPhoneNumber: string;
  fromPhoneNumberFormatted: string;
  fromName: string;
  toPhoneNumber: string;
  toPhoneNumberFormatted: string;
  status: string;
  startTime: string;
}

interface CallEvent {
  type: CallEventType;
  call?: CallData;
  id?: string;
  timestamp?: number;
}

type SSEWriter = (event: CallEvent) => void;

class CallEventBus {
  private clients: Set<SSEWriter> = new Set();

  addClient(writer: SSEWriter): () => void {
    this.clients.add(writer);
    console.log(`[EventBus] Client connected. Total clients: ${this.clients.size}`);
    
    writer({ type: 'connected', timestamp: Date.now() });
    
    return () => {
      this.clients.delete(writer);
      console.log(`[EventBus] Client disconnected. Total clients: ${this.clients.size}`);
    };
  }

  broadcast(event: CallEvent): void {
    console.log(`[EventBus] Broadcasting ${event.type} to ${this.clients.size} clients`);
    for (const writer of this.clients) {
      try {
        writer(event);
      } catch (error) {
        console.error('[EventBus] Error sending to client:', error);
        this.clients.delete(writer);
      }
    }
  }

  broadcastIncomingCall(call: CallData): void {
    this.broadcast({
      type: 'incoming_call',
      call,
      timestamp: Date.now(),
    });
  }

  broadcastCallRemoved(id: string): void {
    this.broadcast({
      type: 'call_removed',
      id,
      timestamp: Date.now(),
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }
}

export const callEventBus = new CallEventBus();

export function formatPhoneNumber(phone: string | undefined): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}
