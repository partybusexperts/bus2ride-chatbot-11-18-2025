'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from "react";

type DetectedType = 
  | 'phone' | 'email' | 'zip' | 'city' | 'date' | 'time' 
  | 'passengers' | 'hours' | 'pickup_address' | 'destination' 
  | 'dropoff_address' | 'event_type' | 'name' | 'website' | 'unknown';

interface DetectedChip {
  id: string;
  type: DetectedType;
  value: string;
  confidence: number;
  original: string;
  confirmed: boolean;
}

type QuotedVehicle = {
  id: string;
  name: string;
  capacity?: string;
  priceDisplay: string;
  price: number;
  hours?: number;
};

type LeadStatus = 'new' | 'not_quoted' | 'quoted' | 'booked' | 'closed' | 'cancelled';

const LEAD_STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'not_quoted', label: 'Not Quoted' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'booked', label: 'Booked' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const TYPE_LABELS: Record<DetectedType, string> = {
  phone: 'Phone',
  email: 'Email',
  zip: 'ZIP Code',
  city: 'City',
  date: 'Event Date',
  time: 'Time',
  passengers: 'Passengers',
  hours: 'Hours',
  pickup_address: 'Pickup',
  destination: 'Destination',
  dropoff_address: 'Drop-off',
  event_type: 'Event',
  name: 'Name',
  website: 'Website',
  unknown: 'Unknown',
};

const TYPE_COLORS: Record<DetectedType, { bg: string; text: string; border: string }> = {
  phone: { bg: '#dbeafe', text: '#1e40af', border: '#3b82f6' },
  email: { bg: '#fce7f3', text: '#9d174d', border: '#ec4899' },
  zip: { bg: '#d1fae5', text: '#065f46', border: '#10b981' },
  city: { bg: '#d1fae5', text: '#065f46', border: '#10b981' },
  date: { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  time: { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  passengers: { bg: '#e0e7ff', text: '#3730a3', border: '#6366f1' },
  hours: { bg: '#e0e7ff', text: '#3730a3', border: '#6366f1' },
  pickup_address: { bg: '#dcfce7', text: '#166534', border: '#22c55e' },
  destination: { bg: '#fef9c3', text: '#854d0e', border: '#eab308' },
  dropoff_address: { bg: '#fee2e2', text: '#991b1b', border: '#ef4444' },
  event_type: { bg: '#f3e8ff', text: '#6b21a8', border: '#a855f7' },
  name: { bg: '#f1f5f9', text: '#475569', border: '#94a3b8' },
  website: { bg: '#cffafe', text: '#155e75', border: '#06b6d4' },
  unknown: { bg: '#f3f4f6', text: '#6b7280', border: '#9ca3af' },
};

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function getDayOfWeek(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr + "T12:00:00");
    if (isNaN(date.getTime())) return "";
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  } catch {
    return "";
  }
}

function calculateDaysUntilEvent(dateStr: string): number {
  if (!dateStr) return Infinity;
  try {
    const eventDate = new Date(dateStr + "T12:00:00");
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const diff = eventDate.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  } catch {
    return Infinity;
  }
}

export default function CallPad() {
  const [smartInput, setSmartInput] = useState("");
  const [chips, setChips] = useState<DetectedChip[]>([]);
  const [parsingInput, setParsingInput] = useState(false);
  
  const [confirmedData, setConfirmedData] = useState({
    agentName: "",
    callerName: "",
    phone: "",
    email: "",
    cityOrZip: "",
    passengers: "",
    hours: "",
    eventType: "",
    date: "",
    pickupTime: "",
    pickupAddress: "",
    destination: "",
    dropoffAddress: "",
    websiteUrl: "",
    tripNotes: "",
    leadSource: "",
    tipIncluded: false,
    paidByCard: false,
    paidByCash: false,
  });
  
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [quotedVehicles, setQuotedVehicles] = useState<QuotedVehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [vehicleMessage, setVehicleMessage] = useState("");
  const [leadStatus, setLeadStatus] = useState<LeadStatus>('new');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const parseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const parseInput = useCallback(async (text: string) => {
    if (!text.trim()) return;
    
    setParsingInput(true);
    try {
      const res = await fetch("/api/parse-input", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, useAI: true }),
      });
      const data = await res.json();
      
      if (data.items && data.items.length > 0) {
        const newChips: DetectedChip[] = data.items.map((item: any) => ({
          id: generateId(),
          type: item.type,
          value: item.value,
          confidence: item.confidence,
          original: item.original || text,
          confirmed: false,
        }));
        setChips(prev => [...prev, ...newChips]);
        setSmartInput("");
      }
    } catch (err) {
      console.error("Parse error:", err);
    } finally {
      setParsingInput(false);
    }
  }, []);

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && smartInput.trim()) {
      e.preventDefault();
      parseInput(smartInput);
    }
  };

  useEffect(() => {
    if (parseTimeoutRef.current) {
      clearTimeout(parseTimeoutRef.current);
    }
    
    if (smartInput.trim().length >= 3) {
      parseTimeoutRef.current = setTimeout(() => {
        parseInput(smartInput);
      }, 1500);
    }
    
    return () => {
      if (parseTimeoutRef.current) clearTimeout(parseTimeoutRef.current);
    };
  }, [smartInput, parseInput]);

  const confirmChip = useCallback((chipId: string) => {
    setChips(prev => {
      const chip = prev.find(c => c.id === chipId);
      if (!chip) return prev;
      
      const fieldMap: Partial<Record<DetectedType, keyof typeof confirmedData>> = {
        phone: 'phone',
        email: 'email',
        zip: 'cityOrZip',
        city: 'cityOrZip',
        date: 'date',
        time: 'pickupTime',
        passengers: 'passengers',
        hours: 'hours',
        pickup_address: 'pickupAddress',
        destination: 'destination',
        dropoff_address: 'dropoffAddress',
        event_type: 'eventType',
        name: 'callerName',
        website: 'websiteUrl',
      };
      
      const field = fieldMap[chip.type];
      if (field) {
        setConfirmedData(prev => ({ ...prev, [field]: chip.value }));
      }
      
      return prev.map(c => c.id === chipId ? { ...c, confirmed: true } : c);
    });
  }, []);

  const rejectChip = useCallback((chipId: string) => {
    setChips(prev => prev.filter(c => c.id !== chipId));
  }, []);

  const changeChipType = useCallback((chipId: string, newType: DetectedType) => {
    setChips(prev => prev.map(c => c.id === chipId ? { ...c, type: newType } : c));
  }, []);

  const doVehicleSearch = useCallback(async (cityOrZip: string, passengers: number | null, hours: number | null) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (!cityOrZip.trim()) {
      setVehicles([]);
      setVehicleMessage("");
      return;
    }

    abortControllerRef.current = new AbortController();
    setLoadingVehicles(true);
    setVehicleMessage("Searching...");

    try {
      const res = await fetch("/api/get-vehicles-for-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cityOrZip, passengers, hours }),
        signal: abortControllerRef.current.signal,
      });

      const data = await res.json();
      setVehicles(data.vehicles || []);
      setVehicleMessage(data.message || "");
      setQuotedVehicles([]);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(err);
        setVehicleMessage("Error getting vehicles");
      }
    } finally {
      setLoadingVehicles(false);
    }
  }, []);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const cityOrZip = confirmedData.cityOrZip.trim();
    const passengers = Number(confirmedData.passengers) || null;
    const hours = Number(confirmedData.hours) || null;

    if (!cityOrZip) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setVehicles([]);
      setVehicleMessage("");
      setLoadingVehicles(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(() => {
      doVehicleSearch(cityOrZip, passengers, hours);
    }, 500);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [confirmedData.cityOrZip, confirmedData.passengers, confirmedData.hours, doVehicleSearch]);

  function toggleQuoted(vehicle: any) {
    setQuotedVehicles((prev) => {
      const exists = prev.find((v) => v.id === vehicle.id);
      if (exists) {
        return prev.filter((v) => v.id !== vehicle.id);
      }
      const qv: QuotedVehicle = {
        id: vehicle.id,
        name: vehicle.name,
        capacity: vehicle.capacity,
        priceDisplay: vehicle.priceDisplay,
        price: vehicle.price || 0,
        hours: vehicle.hours,
      };
      return [...prev, qv];
    });
  }

  function isQuoted(id: string) {
    return quotedVehicles.some((v) => v.id === id);
  }

  const dayOfWeek = useMemo(() => getDayOfWeek(confirmedData.date), [confirmedData.date]);
  const daysUntilEvent = useMemo(() => calculateDaysUntilEvent(confirmedData.date), [confirmedData.date]);
  
  const totalQuotedPrice = useMemo(() => {
    return quotedVehicles.reduce((sum, v) => sum + (v.price || 0), 0);
  }, [quotedVehicles]);

  const depositAmount = useMemo(() => {
    if (totalQuotedPrice === 0) return 0;
    return daysUntilEvent <= 7 ? totalQuotedPrice : Math.round(totalQuotedPrice * 0.5);
  }, [totalQuotedPrice, daysUntilEvent]);

  const depositPercentage = useMemo(() => {
    return daysUntilEvent <= 7 ? 100 : 50;
  }, [daysUntilEvent]);

  const balanceDue = useMemo(() => {
    return totalQuotedPrice - depositAmount;
  }, [totalQuotedPrice, depositAmount]);

  async function handleSaveToZoho() {
    setSaving(true);
    setSaveMessage("");

    const finalLeadStatus: LeadStatus = quotedVehicles.length > 0 ? 'quoted' : leadStatus;

    const snapshot = {
      ...confirmedData,
      passengers: confirmedData.passengers ? Number(confirmedData.passengers) : null,
      hours: confirmedData.hours ? Number(confirmedData.hours) : null,
      leadStatus: finalLeadStatus,
      dayOfWeek,
      quotedVehicles,
      totalQuotedPrice,
      depositAmount,
      depositPercentage,
      balanceDue,
      daysUntilEvent: daysUntilEvent === Infinity ? null : daysUntilEvent,
    };

    try {
      const res = await fetch("/api/zoho/save-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(snapshot),
      });

      if (!res.ok) throw new Error("Zoho error");
      setSaveMessage("Saved to Zoho");
      setLeadStatus(finalLeadStatus);
    } catch (err) {
      console.error(err);
      setSaveMessage("Error saving to Zoho");
    } finally {
      setSaving(false);
    }
  }

  const pendingChips = chips.filter(c => !c.confirmed);
  const confirmedChips = chips.filter(c => c.confirmed);

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: '6px',
    fontSize: '13px',
    outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    color: '#6b7280',
    marginBottom: '4px',
    display: 'block',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  return (
    <div style={{ background: '#f3f4f6', padding: '16px', borderRadius: '12px' }}>
      <div style={{ 
        background: 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)',
        padding: '16px 20px',
        borderRadius: '10px',
        marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input
            ref={inputRef}
            type="text"
            value={smartInput}
            onChange={(e) => setSmartInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Type anything: phone, address, city, date, passengers... (press Enter or wait)"
            style={{
              flex: 1,
              padding: '14px 18px',
              fontSize: '16px',
              border: 'none',
              borderRadius: '8px',
              outline: 'none',
              background: '#fff',
            }}
          />
          {parsingInput && (
            <div style={{ color: '#fff', fontSize: '14px' }}>Parsing...</div>
          )}
        </div>
        
        {pendingChips.length > 0 && (
          <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {pendingChips.map(chip => {
              const colors = TYPE_COLORS[chip.type];
              return (
                <div
                  key={chip.id}
                  style={{
                    background: colors.bg,
                    border: `2px solid ${colors.border}`,
                    borderRadius: '20px',
                    padding: '6px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <select
                    value={chip.type}
                    onChange={(e) => changeChipType(chip.id, e.target.value as DetectedType)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: colors.text,
                      cursor: 'pointer',
                    }}
                  >
                    {Object.entries(TYPE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: '13px', color: colors.text, fontWeight: 500 }}>
                    {chip.value}
                  </span>
                  <button
                    onClick={() => confirmChip(chip.id)}
                    style={{
                      background: '#16a34a',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '50%',
                      width: '22px',
                      height: '22px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title="Confirm"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => rejectChip(chip.id)}
                    style={{
                      background: '#dc2626',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '50%',
                      width: '22px',
                      height: '22px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    title="Reject"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 280px 1fr', gap: '16px', minHeight: '600px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ background: '#fff', padding: '14px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px', color: '#374151' }}>Agent & Caller</h3>
            <div style={{ display: 'grid', gap: '8px' }}>
              <div>
                <label style={labelStyle}>Agent Name</label>
                <input style={inputStyle} placeholder="Your name" value={confirmedData.agentName} onChange={(e) => setConfirmedData(prev => ({ ...prev, agentName: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Caller Name</label>
                <input style={inputStyle} placeholder="Customer name" value={confirmedData.callerName} onChange={(e) => setConfirmedData(prev => ({ ...prev, callerName: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input style={inputStyle} placeholder="Phone number" value={confirmedData.phone} onChange={(e) => setConfirmedData(prev => ({ ...prev, phone: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input style={inputStyle} placeholder="Email address" value={confirmedData.email} onChange={(e) => setConfirmedData(prev => ({ ...prev, email: e.target.value }))} />
              </div>
            </div>
          </div>

          <div style={{ background: '#fff', padding: '14px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px', color: '#374151' }}>Trip Details</h3>
            <div style={{ display: 'grid', gap: '8px' }}>
              <div>
                <label style={labelStyle}>City / ZIP</label>
                <input style={inputStyle} placeholder="Service area" value={confirmedData.cityOrZip} onChange={(e) => setConfirmedData(prev => ({ ...prev, cityOrZip: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={labelStyle}>Passengers</label>
                  <input style={inputStyle} type="number" placeholder="#" value={confirmedData.passengers} onChange={(e) => setConfirmedData(prev => ({ ...prev, passengers: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Hours</label>
                  <input style={inputStyle} type="number" placeholder="#" value={confirmedData.hours} onChange={(e) => setConfirmedData(prev => ({ ...prev, hours: e.target.value }))} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Event Type</label>
                <input style={inputStyle} placeholder="Prom, Wedding..." value={confirmedData.eventType} onChange={(e) => setConfirmedData(prev => ({ ...prev, eventType: e.target.value }))} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input style={inputStyle} type="date" value={confirmedData.date} onChange={(e) => setConfirmedData(prev => ({ ...prev, date: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Day</label>
                  <input style={{ ...inputStyle, background: '#f9fafb' }} value={dayOfWeek} readOnly />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Pickup Time</label>
                <input style={inputStyle} type="time" value={confirmedData.pickupTime} onChange={(e) => setConfirmedData(prev => ({ ...prev, pickupTime: e.target.value }))} />
              </div>
            </div>
          </div>

          <div style={{ background: '#fff', padding: '14px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px', color: '#374151' }}>Locations</h3>
            <div style={{ display: 'grid', gap: '8px' }}>
              <div>
                <label style={labelStyle}>Pickup Address</label>
                <input style={inputStyle} placeholder="Pickup location" value={confirmedData.pickupAddress} onChange={(e) => setConfirmedData(prev => ({ ...prev, pickupAddress: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Destination</label>
                <input style={inputStyle} placeholder="Where going" value={confirmedData.destination} onChange={(e) => setConfirmedData(prev => ({ ...prev, destination: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Drop-off Address</label>
                <input style={inputStyle} placeholder="Final drop-off" value={confirmedData.dropoffAddress} onChange={(e) => setConfirmedData(prev => ({ ...prev, dropoffAddress: e.target.value }))} />
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ background: '#fff', padding: '14px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px', color: '#374151' }}>
              Quoted Summary
              {quotedVehicles.length > 0 && (
                <span style={{ marginLeft: '8px', background: '#16a34a', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontSize: '11px' }}>
                  {quotedVehicles.length}
                </span>
              )}
            </h3>
            
            {quotedVehicles.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#6b7280', padding: '12px', background: '#f9fafb', borderRadius: '6px' }}>
                Click "Quote" on vehicles to add them here
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto' }}>
                {quotedVehicles.map(v => (
                  <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', padding: '6px 8px', background: '#ecfdf5', borderRadius: '4px' }}>
                    <span style={{ color: '#047857', fontWeight: 500 }}>{v.name}</span>
                    <span style={{ color: '#059669', fontWeight: 600 }}>{v.priceDisplay}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: '#fff', padding: '14px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px', color: '#374151' }}>Pricing</h3>
            <div style={{ display: 'grid', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#f9fafb', borderRadius: '6px' }}>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>Total</span>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>${totalQuotedPrice.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#fef3c7', borderRadius: '6px' }}>
                <span style={{ fontSize: '12px', color: '#92400e' }}>Deposit ({depositPercentage}%)</span>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#92400e' }}>${depositAmount.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#f9fafb', borderRadius: '6px' }}>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>Balance</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#374151' }}>${balanceDue.toLocaleString()}</span>
              </div>
              {daysUntilEvent <= 7 && daysUntilEvent !== Infinity && (
                <div style={{ fontSize: '11px', color: '#dc2626', background: '#fef2f2', padding: '6px 8px', borderRadius: '4px' }}>
                  Event within 7 days - 100% deposit required
                </div>
              )}
            </div>
          </div>

          <div style={{ background: '#fff', padding: '14px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px', color: '#374151' }}>Payment</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={confirmedData.tipIncluded} onChange={(e) => setConfirmedData(prev => ({ ...prev, tipIncluded: e.target.checked }))} />
                Tip Included
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={confirmedData.paidByCard} onChange={(e) => setConfirmedData(prev => ({ ...prev, paidByCard: e.target.checked }))} />
                Paid by Card
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                <input type="checkbox" checked={confirmedData.paidByCash} onChange={(e) => setConfirmedData(prev => ({ ...prev, paidByCash: e.target.checked }))} />
                Paid by Cash
              </label>
            </div>
          </div>

          <div style={{ background: '#fff', padding: '14px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px', color: '#374151' }}>Lead Status</h3>
            <select
              style={inputStyle}
              value={leadStatus}
              onChange={(e) => setLeadStatus(e.target.value as LeadStatus)}
            >
              {LEAD_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div style={{ background: '#fff', padding: '14px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px', color: '#374151' }}>Notes</h3>
            <textarea
              style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
              placeholder="Special requests..."
              value={confirmedData.tripNotes}
              onChange={(e) => setConfirmedData(prev => ({ ...prev, tripNotes: e.target.value }))}
            />
          </div>

          <button
            style={{
              padding: '12px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '14px',
              background: '#10b981',
              color: '#fff',
            }}
            onClick={handleSaveToZoho}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save to Zoho"}
          </button>
          
          {saveMessage && (
            <div style={{ 
              fontSize: '12px', 
              padding: '8px', 
              background: saveMessage.includes('Error') ? '#fef2f2' : '#f0fdf4', 
              color: saveMessage.includes('Error') ? '#dc2626' : '#16a34a', 
              borderRadius: '6px',
              textAlign: 'center'
            }}>
              {saveMessage}
            </div>
          )}
        </div>

        <div style={{ background: '#1e293b', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
              Vehicle Gallery
              {loadingVehicles && <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: '8px' }}>Searching...</span>}
            </h3>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              {vehicles.length} vehicles
            </div>
          </div>

          {vehicleMessage && (
            <div style={{ fontSize: '12px', color: '#60a5fa', marginBottom: '10px', padding: '8px', background: 'rgba(59,130,246,0.1)', borderRadius: '6px' }}>
              {vehicleMessage}
            </div>
          )}

          {vehicles.length === 0 ? (
            <div style={{ 
              flex: 1, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              color: '#94a3b8',
              fontSize: '14px',
            }}>
              {confirmedData.cityOrZip.trim() 
                ? (loadingVehicles ? "Searching..." : "No vehicles found")
                : "Enter a city or ZIP to see vehicles"}
            </div>
          ) : (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(3, 1fr)', 
              gap: '12px',
              flex: 1,
              overflowY: 'auto',
              alignContent: 'start',
            }}>
              {vehicles.map((v) => (
                <div
                  key={v.id}
                  style={{ 
                    background: isQuoted(v.id) ? '#065f46' : '#334155',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    border: isQuoted(v.id) ? '2px solid #10b981' : '1px solid #475569',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {v.image && (
                    <div style={{ height: '100px', overflow: 'hidden' }}>
                      <img 
                        src={v.image} 
                        alt={v.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  <div style={{ padding: '10px' }}>
                    <div style={{ fontWeight: 600, color: '#fff', fontSize: '13px', marginBottom: '6px', lineHeight: 1.3 }}>
                      {v.name}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                      {v.capacity && (
                        <span style={{ background: '#475569', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', color: '#cbd5e1' }}>
                          {v.capacity}
                        </span>
                      )}
                      {v.category && (
                        <span style={{ background: '#4338ca', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', color: '#c7d2fe' }}>
                          {v.category}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#34d399', marginBottom: '8px' }}>
                      {v.priceDisplay}
                    </div>
                    <button
                      onClick={() => toggleQuoted(v)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 600,
                        background: isQuoted(v.id) ? '#10b981' : '#3b82f6',
                        color: '#fff',
                      }}
                    >
                      {isQuoted(v.id) ? "✓ Quoted" : "Quote"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
