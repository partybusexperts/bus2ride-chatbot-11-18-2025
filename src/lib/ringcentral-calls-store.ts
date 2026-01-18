interface IncomingCall {
  id: string;
  sessionId: string;
  fromPhoneNumber: string | null;
  fromPhoneNumberFormatted: string;
  fromName: string | null;
  toPhoneNumber: string | null;
  toPhoneNumberFormatted: string;
  status: string;
  direction: string;
  startTime: string;
  answeredAt: string | null;
  endedAt: string | null;
}

const MAX_CALLS = 20;
const CALL_EXPIRY_MS = 2 * 60 * 60 * 1000;

let calls: IncomingCall[] = [];
let subscriptionId: string | null = null;
let subscriptionExpiresAt: number | null = null;

type CallEventListener = (call: IncomingCall) => void;
const eventListeners: Map<string, CallEventListener> = new Map();

export function subscribeToCallEvents(callback: CallEventListener): string {
  const id = Math.random().toString(36).substring(2, 15);
  eventListeners.set(id, callback);
  return id;
}

export function unsubscribeFromCallEvents(id: string): void {
  eventListeners.delete(id);
}

function notifyListeners(call: IncomingCall): void {
  eventListeners.forEach((callback) => {
    try {
      callback(call);
    } catch (e) {
      console.error('Error notifying call event listener:', e);
    }
  });
}

export function formatPhoneNumber(phone: string | undefined | null): string {
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

export function addOrUpdateCall(callData: {
  sessionId: string;
  telephonySessionId?: string;
  status: string;
  direction: string;
  from?: { phoneNumber?: string; name?: string };
  to?: { phoneNumber?: string; name?: string };
  startTime?: string;
}): void {
  const sessionId = callData.telephonySessionId || callData.sessionId;
  const existingIndex = calls.findIndex(c => c.sessionId === sessionId);
  
  const callEntry: IncomingCall = {
    id: sessionId,
    sessionId: sessionId,
    fromPhoneNumber: callData.from?.phoneNumber || null,
    fromPhoneNumberFormatted: formatPhoneNumber(callData.from?.phoneNumber),
    fromName: callData.from?.name || null,
    toPhoneNumber: callData.to?.phoneNumber || null,
    toPhoneNumberFormatted: formatPhoneNumber(callData.to?.phoneNumber),
    status: callData.status,
    direction: callData.direction,
    startTime: callData.startTime || new Date().toISOString(),
    answeredAt: callData.status === 'Answered' ? new Date().toISOString() : (existingIndex >= 0 ? calls[existingIndex].answeredAt : null),
    endedAt: callData.status === 'Disconnected' ? new Date().toISOString() : null,
  };

  if (existingIndex >= 0) {
    calls[existingIndex] = { ...calls[existingIndex], ...callEntry };
  } else {
    calls.unshift(callEntry);
    if (calls.length > MAX_CALLS) {
      calls = calls.slice(0, MAX_CALLS);
    }
  }
  
  cleanupOldCalls();
  
  notifyListeners(callEntry);
}

function cleanupOldCalls(): void {
  const now = Date.now();
  calls = calls.filter(call => {
    const callTime = new Date(call.startTime).getTime();
    return now - callTime < CALL_EXPIRY_MS;
  });
}

export function getRecentCalls(limit: number = 10): IncomingCall[] {
  cleanupOldCalls();
  return calls
    .filter(c => c.direction === 'Inbound')
    .sort((a, b) => {
      const statusOrder: Record<string, number> = {
        'Proceeding': 0,
        'Ringing': 0,
        'Answered': 1,
        'Accepted': 1,
        'Disconnected': 2,
        'Missed': 2,
        'Voicemail': 2,
      };
      const aOrder = statusOrder[a.status] ?? 3;
      const bOrder = statusOrder[b.status] ?? 3;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
    })
    .slice(0, limit);
}

export function getAllCalls(): IncomingCall[] {
  cleanupOldCalls();
  return [...calls];
}

export function clearCalls(): void {
  calls = [];
}

export function setSubscriptionInfo(id: string, expiresIn: number): void {
  subscriptionId = id;
  subscriptionExpiresAt = Date.now() + (expiresIn * 1000);
}

export function getSubscriptionInfo(): { id: string | null; expiresAt: number | null; isActive: boolean } {
  const isActive = subscriptionId !== null && 
    subscriptionExpiresAt !== null && 
    subscriptionExpiresAt > Date.now();
  return { id: subscriptionId, expiresAt: subscriptionExpiresAt, isActive };
}

export function clearSubscription(): void {
  subscriptionId = null;
  subscriptionExpiresAt = null;
}
