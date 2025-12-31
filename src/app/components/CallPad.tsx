'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from "react";

type DetectedType = 
  | 'phone' | 'email' | 'zip' | 'city' | 'date' | 'time' 
  | 'passengers' | 'hours' | 'pickup_address' | 'destination' 
  | 'dropoff_address' | 'event_type' | 'vehicle_type' | 'name' | 'website' | 'unknown';

interface DetectedChip {
  id: string;
  type: DetectedType;
  value: string;
  confidence: number;
  original: string;
  confirmed: boolean;
  autoPopulated: boolean;
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

const AGENTS = [
  { id: '', name: 'Select Agent...' },
  { id: 'agent1', name: 'Floyd' },
  { id: 'agent2', name: 'Marcus' },
  { id: 'agent3', name: 'Sarah' },
  { id: 'agent4', name: 'Jennifer' },
  { id: 'agent5', name: 'David' },
  { id: 'agent6', name: 'Other' },
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
  vehicle_type: 'Vehicle Type',
  name: 'Customer Name',
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
  vehicle_type: { bg: '#fef3c7', text: '#78350f', border: '#d97706' },
  name: { bg: '#f1f5f9', text: '#475569', border: '#94a3b8' },
  website: { bg: '#cffafe', text: '#155e75', border: '#06b6d4' },
  unknown: { bg: '#f3f4f6', text: '#6b7280', border: '#9ca3af' },
};

const AUTO_POPULATE_THRESHOLD = 0.8;

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

function parseDateString(dateStr: string): string {
  const lower = dateStr.toLowerCase().trim();
  const months: Record<string, string> = {
    jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
    apr: '04', april: '04', may: '05', jun: '06', june: '06',
    jul: '07', july: '07', aug: '08', august: '08', sep: '09', september: '09',
    oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12',
  };
  
  const currentYear = new Date().getFullYear();
  
  for (const [name, num] of Object.entries(months)) {
    if (lower.startsWith(name)) {
      const dayMatch = lower.match(/(\d{1,2})/);
      if (dayMatch) {
        const day = dayMatch[1].padStart(2, '0');
        return `${currentYear}-${num}-${day}`;
      }
    }
  }
  
  const slashMatch = lower.match(/^(\d{1,2})\/(\d{1,2})(\/(\d{2,4}))?$/);
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, '0');
    const day = slashMatch[2].padStart(2, '0');
    let year = currentYear.toString();
    if (slashMatch[4]) {
      year = slashMatch[4].length === 2 ? '20' + slashMatch[4] : slashMatch[4];
    }
    return `${year}-${month}-${day}`;
  }
  
  return '';
}

function parseTimeString(timeStr: string): string {
  const lower = timeStr.toLowerCase().trim();
  const match = lower.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (match) {
    let hour = parseInt(match[1], 10);
    const minute = match[2] || '00';
    const period = match[3]?.toLowerCase();
    
    if (period === 'pm' && hour < 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    
    return `${hour.toString().padStart(2, '0')}:${minute}`;
  }
  return '';
}

export default function CallPad() {
  const [smartInput, setSmartInput] = useState("");
  const [chips, setChips] = useState<DetectedChip[]>([]);
  const [parsingInput, setParsingInput] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);
  
  const [confirmedData, setConfirmedData] = useState({
    agentName: "",
    callerName: "",
    phone: "",
    email: "",
    cityOrZip: "",
    passengers: "",
    hours: "",
    eventType: "",
    vehicleType: "",
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
  const [photoModalVehicle, setPhotoModalVehicle] = useState<any>(null);
  const [vehicleRecommendation, setVehicleRecommendation] = useState<string>("");
  const [loadingRecommendation, setLoadingRecommendation] = useState(false);
  
  const [sortBy, setSortBy] = useState<'price_low' | 'price_high' | 'capacity_high' | 'capacity_low'>('price_low');
  const [rateHours, setRateHours] = useState<number>(4);
  const [vehicleFilters, setVehicleFilters] = useState({
    partyBus: true,
    limo: true,
    shuttle: true,
    other: true,
  });
  
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const parseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const applyChipToData = useCallback((chip: DetectedChip) => {
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
      vehicle_type: 'vehicleType',
      name: 'callerName',
      website: 'websiteUrl',
    };
    
    const field = fieldMap[chip.type];
    if (field) {
      let value = chip.value;
      if (chip.type === 'date') {
        value = parseDateString(chip.value) || chip.value;
      } else if (chip.type === 'time') {
        value = parseTimeString(chip.value) || chip.value;
      }
      setConfirmedData(prev => ({ ...prev, [field]: value }));
    }
  }, []);

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
        const newChips: DetectedChip[] = data.items.map((item: any) => {
          const shouldAutoPopulate = item.confidence >= AUTO_POPULATE_THRESHOLD && item.type !== 'unknown';
          return {
            id: generateId(),
            type: item.type,
            value: item.value,
            confidence: item.confidence,
            original: item.original || text,
            confirmed: shouldAutoPopulate,
            autoPopulated: shouldAutoPopulate,
          };
        });
        
        newChips.forEach(chip => {
          if (chip.autoPopulated) {
            applyChipToData(chip);
          }
        });
        
        setChips(prev => {
          const existingValues = new Set(prev.map(c => `${c.type}:${c.value.toLowerCase()}`));
          const uniqueNewChips = newChips.filter(c => !existingValues.has(`${c.type}:${c.value.toLowerCase()}`));
          return [...prev, ...uniqueNewChips];
        });
        setSmartInput("");
      }
    } catch (err) {
      console.error("Parse error:", err);
    } finally {
      setParsingInput(false);
    }
  }, [applyChipToData]);

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
    
    const trimmed = smartInput.trim();
    const segments = trimmed.split(',').map(s => s.trim()).filter(s => s.length > 0);
    const hasCompleteSegment = segments.some(s => s.length >= 4);
    
    if (hasCompleteSegment && trimmed.length >= 4) {
      parseTimeoutRef.current = setTimeout(() => {
        parseInput(smartInput);
      }, 2500);
    }
    
    return () => {
      if (parseTimeoutRef.current) clearTimeout(parseTimeoutRef.current);
    };
  }, [smartInput, parseInput]);

  const confirmChip = useCallback((chipId: string) => {
    setChips(prev => {
      const chip = prev.find(c => c.id === chipId);
      if (!chip) return prev;
      
      applyChipToData(chip);
      
      return prev.map(c => c.id === chipId ? { ...c, confirmed: true } : c);
    });
  }, [applyChipToData]);

  const rejectChip = useCallback((chipId: string) => {
    setChips(prev => prev.filter(c => c.id !== chipId));
  }, []);

  const confirmAllChips = useCallback(() => {
    const pendingChipsToConfirm = chips.filter(c => !c.confirmed && c.type !== 'unknown');
    const unknownChips = chips.filter(c => c.type === 'unknown' && !c.confirmed);
    
    pendingChipsToConfirm.forEach(chip => {
      applyChipToData(chip);
    });
    
    if (unknownChips.length > 0) {
      const unknownNotes = unknownChips.map(c => `[${c.value}]`).join(' ');
      setConfirmedData(prev => ({
        ...prev,
        tripNotes: prev.tripNotes 
          ? `${prev.tripNotes}\nUnknown: ${unknownNotes}` 
          : `Unknown: ${unknownNotes}`
      }));
    }
    
    setChips(prev => prev.map(c => ({ ...c, confirmed: true })));
  }, [chips, applyChipToData]);

  const rejectAllChips = useCallback(() => {
    setChips([]);
  }, []);

  const changeChipType = useCallback((chipId: string, newType: DetectedType) => {
    setChips(prev => {
      const chip = prev.find(c => c.id === chipId);
      if (!chip) return prev;
      
      const updatedChip = { ...chip, type: newType, confirmed: true, autoPopulated: false };
      applyChipToData(updatedChip);
      
      return prev.map(c => c.id === chipId ? updatedChip : c);
    });
  }, [applyChipToData]);

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
    const wasQuoted = quotedVehicles.some(v => v.id === vehicle.id);
    
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
    
    if (!wasQuoted) {
      getAIRecommendation(vehicle);
    }
  }

  function isQuoted(id: string) {
    return quotedVehicles.some((v) => v.id === id);
  }

  const dayOfWeek = useMemo(() => getDayOfWeek(confirmedData.date), [confirmedData.date]);
  const daysUntilEvent = useMemo(() => calculateDaysUntilEvent(confirmedData.date), [confirmedData.date]);
  
  const lastQuotedVehicle = useMemo(() => {
    return quotedVehicles.length > 0 ? quotedVehicles[quotedVehicles.length - 1] : null;
  }, [quotedVehicles]);

  const currentVehiclePrice = useMemo(() => {
    return lastQuotedVehicle?.price || 0;
  }, [lastQuotedVehicle]);

  const totalQuotedPrice = useMemo(() => {
    return quotedVehicles.reduce((sum, v) => sum + (v.price || 0), 0);
  }, [quotedVehicles]);

  const depositPercentage = useMemo(() => {
    return daysUntilEvent <= 7 ? 100 : 50;
  }, [daysUntilEvent]);

  const currentDepositAmount = useMemo(() => {
    if (currentVehiclePrice === 0) return 0;
    return daysUntilEvent <= 7 ? currentVehiclePrice : Math.round(currentVehiclePrice * 0.5);
  }, [currentVehiclePrice, daysUntilEvent]);

  const currentBalanceDue = useMemo(() => {
    return currentVehiclePrice - currentDepositAmount;
  }, [currentVehiclePrice, currentDepositAmount]);

  const depositAmount = useMemo(() => {
    if (totalQuotedPrice === 0) return 0;
    return daysUntilEvent <= 7 ? totalQuotedPrice : Math.round(totalQuotedPrice * 0.5);
  }, [totalQuotedPrice, daysUntilEvent]);

  const balanceDue = useMemo(() => {
    return totalQuotedPrice - depositAmount;
  }, [totalQuotedPrice, depositAmount]);

  const filteredVehicles = useMemo(() => {
    let filtered = vehicles.filter(v => {
      const category = (v.category || '').toLowerCase();
      const name = (v.name || '').toLowerCase();
      
      const isPartyBus = category.includes('party bus') || category.includes('limo bus') || 
                         name.includes('party bus') || name.includes('limo bus');
      const isLimo = !isPartyBus && (
        category.includes('limo') || category.includes('limousine') || 
        name.includes('limousine') || name.includes('stretch limo') ||
        (category.includes('sedan') || category.includes('suv') || category.includes('hummer'))
      );
      const isShuttle = category.includes('shuttle') || category.includes('sprinter') || 
                        category.includes('executive') || category.includes('coach') ||
                        category.includes('charter') || category.includes('mini coach') ||
                        name.includes('shuttle') || name.includes('sprinter') || name.includes('coach');
      
      if (isPartyBus && !vehicleFilters.partyBus) return false;
      if (isLimo && !vehicleFilters.limo) return false;
      if (isShuttle && !vehicleFilters.shuttle) return false;
      if (!isPartyBus && !isLimo && !isShuttle && !vehicleFilters.other) return false;
      
      return true;
    });
    
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'price_low':
          return (a.price || 0) - (b.price || 0);
        case 'price_high':
          return (b.price || 0) - (a.price || 0);
        case 'capacity_high':
          const capA = parseInt(a.capacity) || 0;
          const capB = parseInt(b.capacity) || 0;
          return capB - capA;
        case 'capacity_low':
          const capC = parseInt(a.capacity) || 0;
          const capD = parseInt(b.capacity) || 0;
          return capC - capD;
        default:
          return 0;
      }
    });
    
    return filtered;
  }, [vehicles, vehicleFilters, sortBy]);

  const getAIRecommendation = useCallback(async (vehicle: any) => {
    setLoadingRecommendation(true);
    setVehicleRecommendation("");
    
    try {
      const response = await fetch('/api/vehicle-recommendation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle: {
            name: vehicle.name,
            capacity: vehicle.capacity,
            category: vehicle.category,
            price: vehicle.priceDisplay,
            amenities: vehicle.amenities || [],
          },
          tripContext: {
            eventType: confirmedData.eventType,
            passengers: confirmedData.passengers,
            date: confirmedData.date,
            city: confirmedData.cityOrZip,
          }
        }),
      });
      
      if (!response.ok) throw new Error('Failed to get recommendation');
      const data = await response.json();
      setVehicleRecommendation(data.recommendation || "Great choice for your event!");
    } catch (error) {
      console.error('Error getting recommendation:', error);
      setVehicleRecommendation("This vehicle is a great choice for your event!");
    } finally {
      setLoadingRecommendation(false);
    }
  }, [confirmedData]);

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
  const autoPopulatedChips = chips.filter(c => c.autoPopulated);

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
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #2d5a87 100%)',
        padding: '16px 20px',
        borderRadius: '10px',
        marginBottom: '16px',
      }}>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
          gap: '12px',
          marginBottom: '16px',
          background: 'rgba(255,255,255,0.05)',
          padding: '12px',
          borderRadius: '8px',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '2px' }}>Location</div>
            <div style={{ fontSize: '14px', color: confirmedData.cityOrZip ? '#60a5fa' : '#475569', fontWeight: 600 }}>
              {confirmedData.cityOrZip || '---'}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '2px' }}>Event</div>
            <div style={{ fontSize: '14px', color: confirmedData.eventType ? '#a78bfa' : '#475569', fontWeight: 600 }}>
              {confirmedData.eventType || '---'}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '2px' }}>Date</div>
            <div style={{ fontSize: '14px', color: confirmedData.date ? '#fbbf24' : '#475569', fontWeight: 600 }}>
              {confirmedData.date ? `${confirmedData.date} (${dayOfWeek.slice(0,3)})` : '---'}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '2px' }}>Passengers</div>
            <div style={{ fontSize: '14px', color: confirmedData.passengers ? '#34d399' : '#475569', fontWeight: 600 }}>
              {confirmedData.passengers || '---'}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '2px' }}>Hours</div>
            <div style={{ fontSize: '14px', color: confirmedData.hours ? '#34d399' : '#475569', fontWeight: 600 }}>
              {confirmedData.hours || '---'}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '2px' }}>Vehicles</div>
            <div style={{ fontSize: '14px', color: vehicles.length > 0 ? '#22d3ee' : '#475569', fontWeight: 600 }}>
              {vehicles.length}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '2px' }}>Quoted</div>
            <div style={{ fontSize: '14px', color: quotedVehicles.length > 0 ? '#4ade80' : '#475569', fontWeight: 600 }}>
              {quotedVehicles.length}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '2px' }}>Current Price</div>
            <div style={{ fontSize: '14px', color: currentVehiclePrice > 0 ? '#4ade80' : '#475569', fontWeight: 700 }}>
              ${currentVehiclePrice.toLocaleString()}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '2px' }}>Deposit</div>
            <div style={{ fontSize: '14px', color: currentDepositAmount > 0 ? '#fbbf24' : '#475569', fontWeight: 700 }}>
              ${currentDepositAmount.toLocaleString()}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <input
            ref={inputRef}
            type="text"
            value={smartInput}
            onChange={(e) => setSmartInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Type: chicago, may 25th, wedding, pu at 9pm, 30 passengers... (comma-separated)"
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
        
        {(pendingChips.length > 0 || autoPopulatedChips.length > 0) && (
          <div style={{ marginTop: '12px' }}>
            {pendingChips.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <button
                  onClick={confirmAllChips}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#16a34a',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Confirm All
                </button>
                <button
                  onClick={rejectAllChips}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#dc2626',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Reject All
                </button>
              </div>
            )}
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {chips.map(chip => {
                const colors = TYPE_COLORS[chip.type];
                const isAutoPopulated = chip.autoPopulated && chip.confirmed;
                return (
                  <div
                    key={chip.id}
                    style={{
                      background: isAutoPopulated ? colors.bg : colors.bg,
                      border: `2px solid ${isAutoPopulated ? '#16a34a' : colors.border}`,
                      borderRadius: '20px',
                      padding: '6px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      opacity: chip.confirmed ? 0.8 : 1,
                    }}
                  >
                    {isAutoPopulated && (
                      <span style={{ fontSize: '12px', color: '#16a34a' }}>&#10003;</span>
                    )}
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
                      {(() => {
                        const priorityOrder: DetectedType[] = [
                          chip.type,
                          'name', 'phone', 'email', 'city', 'zip', 'date', 'time',
                          'passengers', 'hours', 'event_type', 'vehicle_type',
                          'pickup_address', 'destination', 'dropoff_address', 'website', 'unknown'
                        ];
                        const seen = new Set<string>();
                        const sortedTypes = priorityOrder.filter(t => {
                          if (seen.has(t)) return false;
                          seen.add(t);
                          return TYPE_LABELS[t] !== undefined;
                        });
                        return sortedTypes.map(key => (
                          <option key={key} value={key}>{TYPE_LABELS[key]}</option>
                        ));
                      })()}
                    </select>
                    <span style={{ fontSize: '13px', color: colors.text, fontWeight: 500 }}>
                      {chip.value}
                    </span>
                    {!chip.confirmed && (
                      <>
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
                          &#10003;
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
                          &#10005;
                        </button>
                      </>
                    )}
                    {chip.confirmed && !isAutoPopulated && (
                      <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600 }}>CONFIRMED</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 280px 1fr', gap: '16px', minHeight: '600px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ background: '#fff', padding: '14px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px', color: '#374151' }}>Agent & Customer</h3>
            <div style={{ display: 'grid', gap: '8px' }}>
              <div>
                <label style={labelStyle}>Agent</label>
                <select 
                  style={inputStyle} 
                  value={confirmedData.agentName} 
                  onChange={(e) => setConfirmedData(prev => ({ ...prev, agentName: e.target.value }))}
                >
                  {AGENTS.map(agent => (
                    <option key={agent.id} value={agent.name === 'Select Agent...' ? '' : agent.name}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Customer Name</label>
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
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px', color: '#374151' }}>
              Current Vehicle Pricing
              {lastQuotedVehicle && (
                <span style={{ marginLeft: '6px', fontWeight: 400, color: '#6b7280', fontSize: '11px' }}>
                  ({lastQuotedVehicle.name})
                </span>
              )}
            </h3>
            <div style={{ display: 'grid', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#f9fafb', borderRadius: '6px' }}>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>Price</span>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#111827' }}>${currentVehiclePrice.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#fef3c7', borderRadius: '6px' }}>
                <span style={{ fontSize: '12px', color: '#92400e' }}>Deposit ({depositPercentage}%)</span>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#92400e' }}>${currentDepositAmount.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#f9fafb', borderRadius: '6px' }}>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>Balance</span>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#374151' }}>${currentBalanceDue.toLocaleString()}</span>
              </div>
              {daysUntilEvent === 0 && (
                <div style={{ fontSize: '11px', color: '#fff', background: '#dc2626', padding: '8px 10px', borderRadius: '4px', fontWeight: 600 }}>
                  SAME DAY BOOKING - Ask for CASH payment or consult manager!
                </div>
              )}
              {daysUntilEvent > 0 && daysUntilEvent <= 7 && (
                <div style={{ fontSize: '11px', color: '#dc2626', background: '#fef2f2', padding: '6px 8px', borderRadius: '4px' }}>
                  Event within 7 days - 100% deposit required
                </div>
              )}
              {quotedVehicles.length > 1 && (
                <div style={{ fontSize: '11px', color: '#6b7280', background: '#f3f4f6', padding: '6px 8px', borderRadius: '4px', marginTop: '4px' }}>
                  {quotedVehicles.length} vehicles quoted (Total: ${totalQuotedPrice.toLocaleString()})
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

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              style={{
                flex: 1,
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
            
            <button
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '8px',
                border: 'none',
                cursor: quotedVehicles.length > 0 && confirmedData.email ? 'pointer' : 'not-allowed',
                fontWeight: 600,
                fontSize: '14px',
                background: quotedVehicles.length > 0 && confirmedData.email ? '#3b82f6' : '#9ca3af',
                color: '#fff',
                opacity: quotedVehicles.length > 0 && confirmedData.email ? 1 : 0.7,
              }}
              onClick={() => {
                if (quotedVehicles.length > 0 && confirmedData.email) {
                  alert('Send Quote feature coming soon! Will integrate with Zoho to email quote to customer.');
                } else if (quotedVehicles.length === 0) {
                  alert('Please quote at least one vehicle first.');
                } else {
                  alert('Please add customer email address.');
                }
              }}
            >
              Send Quote
            </button>
          </div>
          
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
              {filteredVehicles.length} of {vehicles.length} vehicles
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
            <select
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #475569', background: '#334155', color: '#fff', fontSize: '12px' }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="price_low">Price: Low to High</option>
              <option value="price_high">Price: High to Low</option>
              <option value="capacity_high">Capacity: High to Low</option>
              <option value="capacity_low">Capacity: Low to High</option>
            </select>
            
            <select
              style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #475569', background: '#334155', color: '#fff', fontSize: '12px' }}
              value={rateHours}
              onChange={(e) => setRateHours(parseInt(e.target.value))}
            >
              <option value={3}>3 Hour Rate</option>
              <option value={4}>4 Hour Rate</option>
              <option value={5}>5 Hour Rate</option>
              <option value={6}>6 Hour Rate</option>
              <option value={8}>8 Hour Rate</option>
            </select>
            
            <div style={{ display: 'flex', gap: '10px', marginLeft: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontSize: '11px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={vehicleFilters.partyBus}
                  onChange={(e) => setVehicleFilters(prev => ({ ...prev, partyBus: e.target.checked }))}
                />
                Party Bus
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontSize: '11px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={vehicleFilters.limo}
                  onChange={(e) => setVehicleFilters(prev => ({ ...prev, limo: e.target.checked }))}
                />
                Limo
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontSize: '11px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={vehicleFilters.shuttle}
                  onChange={(e) => setVehicleFilters(prev => ({ ...prev, shuttle: e.target.checked }))}
                />
                Shuttle
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontSize: '11px', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={vehicleFilters.other}
                  onChange={(e) => setVehicleFilters(prev => ({ ...prev, other: e.target.checked }))}
                />
                Other
              </label>
            </div>
          </div>

          {vehicleRecommendation && (
            <div style={{ 
              fontSize: '12px', 
              color: '#a5f3fc', 
              marginBottom: '10px', 
              padding: '10px', 
              background: 'rgba(34,211,238,0.1)', 
              borderRadius: '6px',
              border: '1px solid rgba(34,211,238,0.3)',
            }}>
              <strong style={{ color: '#22d3ee' }}>Agent Selling Points:</strong>
              <div style={{ marginTop: '4px', whiteSpace: 'pre-line' }}>
                {loadingRecommendation ? "Loading recommendations..." : vehicleRecommendation}
              </div>
            </div>
          )}

          {vehicleMessage && (
            <div style={{ fontSize: '12px', color: '#60a5fa', marginBottom: '10px', padding: '8px', background: 'rgba(59,130,246,0.1)', borderRadius: '6px' }}>
              {vehicleMessage}
            </div>
          )}

          {filteredVehicles.length === 0 ? (
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
              {filteredVehicles.map((v) => (
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
                    <div 
                      style={{ height: '100px', overflow: 'hidden', cursor: 'pointer' }}
                      onClick={() => setPhotoModalVehicle(v)}
                    >
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
                    <div 
                      style={{ fontWeight: 600, color: '#fff', fontSize: '13px', marginBottom: '6px', lineHeight: 1.3, cursor: 'pointer' }}
                      onClick={() => setPhotoModalVehicle(v)}
                    >
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
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => toggleQuoted(v)}
                        style={{
                          flex: 1,
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
                        {isQuoted(v.id) ? "Quoted" : "Quote"}
                      </button>
                      <button
                        onClick={() => setSelectedVehicle(v)}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: '#6366f1',
                          color: '#fff',
                        }}
                        title="View pricing details"
                      >
                        $
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedVehicle && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setSelectedVehicle(null)}
        >
          <div 
            style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#111827', margin: 0 }}>
                {selectedVehicle.name}
              </h2>
              <button
                onClick={() => setSelectedVehicle(null)}
                style={{
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  cursor: 'pointer',
                  fontSize: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                &#10005;
              </button>
            </div>
            
            {selectedVehicle.image && (
              <img 
                src={selectedVehicle.image} 
                alt={selectedVehicle.name}
                style={{ width: '100%', height: '200px', objectFit: 'cover', borderRadius: '8px', marginBottom: '16px' }}
              />
            )}

            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {selectedVehicle.capacity && (
                  <span style={{ background: '#e0e7ff', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', color: '#3730a3', fontWeight: 500 }}>
                    {selectedVehicle.capacity} passengers
                  </span>
                )}
                {selectedVehicle.category && (
                  <span style={{ background: '#f3e8ff', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', color: '#6b21a8', fontWeight: 500 }}>
                    {selectedVehicle.category}
                  </span>
                )}
                {selectedVehicle.city && (
                  <span style={{ background: '#d1fae5', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', color: '#065f46', fontWeight: 500 }}>
                    {selectedVehicle.city}
                  </span>
                )}
              </div>

              <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '12px' }}>All Pricing Tiers</h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                  <div style={{ background: '#fff', padding: '12px', borderRadius: '8px', border: '2px solid #10b981' }}>
                    <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 600, marginBottom: '4px' }}>STANDARD</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#111827' }}>{selectedVehicle.priceDisplay}</div>
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>{selectedVehicle.hours || 4} hours</div>
                  </div>
                  <div style={{ background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: '11px', color: '#ec4899', fontWeight: 600, marginBottom: '4px' }}>PROM RATE</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#111827' }}>
                      ${selectedVehicle.price ? Math.round(selectedVehicle.price * 1.15).toLocaleString() : '---'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>{selectedVehicle.hours || 4} hours (+15%)</div>
                  </div>
                  <div style={{ background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 600, marginBottom: '4px' }}>BEFORE 5 PM</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#111827' }}>
                      ${selectedVehicle.price ? Math.round(selectedVehicle.price * 0.9).toLocaleString() : '---'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>{selectedVehicle.hours || 4} hours (-10%)</div>
                  </div>
                  <div style={{ background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: '11px', color: '#8b5cf6', fontWeight: 600, marginBottom: '4px' }}>AFTER 5 PM</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: '#111827' }}>
                      ${selectedVehicle.price ? Math.round(selectedVehicle.price * 1.1).toLocaleString() : '---'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>{selectedVehicle.hours || 4} hours (+10%)</div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                    <span style={{ color: '#6b7280', fontSize: '13px' }}>Per Hour Rate</span>
                    <span style={{ fontWeight: 600, color: '#111827', fontSize: '13px' }}>
                      ${selectedVehicle.price && selectedVehicle.hours ? Math.round(selectedVehicle.price / selectedVehicle.hours) : '---'}/hr
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                    <span style={{ color: '#6b7280', fontSize: '13px' }}>Deposit ({depositPercentage}%)</span>
                    <span style={{ fontWeight: 600, color: '#92400e', fontSize: '13px' }}>
                      ${selectedVehicle.price ? Math.round(selectedVehicle.price * (depositPercentage / 100)).toLocaleString() : '---'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                    <span style={{ color: '#6b7280', fontSize: '13px' }}>Balance Due</span>
                    <span style={{ fontWeight: 600, color: '#374151', fontSize: '13px' }}>
                      ${selectedVehicle.price ? Math.round(selectedVehicle.price * ((100 - depositPercentage) / 100)).toLocaleString() : '---'}
                    </span>
                  </div>
                </div>
              </div>

              {selectedVehicle.description && (
                <div style={{ fontSize: '13px', color: '#6b7280', lineHeight: 1.6 }}>
                  {selectedVehicle.description}
                </div>
              )}

              <button
                onClick={() => {
                  toggleQuoted(selectedVehicle);
                  setSelectedVehicle(null);
                }}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  background: isQuoted(selectedVehicle.id) ? '#dc2626' : '#10b981',
                  color: '#fff',
                }}
              >
                {isQuoted(selectedVehicle.id) ? "Remove from Quote" : "Add to Quote"}
              </button>
            </div>
          </div>
        </div>
      )}

      {photoModalVehicle && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
          }}
          onClick={() => setPhotoModalVehicle(null)}
        >
          <div 
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', margin: 0 }}>
                {photoModalVehicle.name}
              </h2>
              <button
                onClick={() => setPhotoModalVehicle(null)}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  cursor: 'pointer',
                  fontSize: '18px',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                &#10005;
              </button>
            </div>
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'center' }}>
              {[photoModalVehicle.image, photoModalVehicle.image_2, photoModalVehicle.image_3, photoModalVehicle.image_4].filter(Boolean).map((img: string, idx: number) => (
                <img 
                  key={idx}
                  src={img} 
                  alt={`${photoModalVehicle.name} - ${idx + 1}`}
                  style={{ 
                    maxWidth: '45vw', 
                    maxHeight: '40vh', 
                    objectFit: 'contain', 
                    borderRadius: '8px',
                    background: '#1e293b',
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ))}
            </div>
            
            <div style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
              {photoModalVehicle.capacity && (
                <span style={{ background: 'rgba(255,255,255,0.2)', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', color: '#fff' }}>
                  {photoModalVehicle.capacity} passengers
                </span>
              )}
              {photoModalVehicle.category && (
                <span style={{ background: 'rgba(99,102,241,0.5)', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', color: '#fff' }}>
                  {photoModalVehicle.category}
                </span>
              )}
              <span style={{ background: 'rgba(16,185,129,0.5)', padding: '6px 12px', borderRadius: '20px', fontSize: '12px', color: '#fff', fontWeight: 600 }}>
                {photoModalVehicle.priceDisplay}
              </span>
            </div>
            
            <button
              onClick={() => {
                toggleQuoted(photoModalVehicle);
              }}
              style={{
                marginTop: '16px',
                padding: '12px 32px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                background: isQuoted(photoModalVehicle.id) ? '#dc2626' : '#10b981',
                color: '#fff',
              }}
            >
              {isQuoted(photoModalVehicle.id) ? "Remove from Quote" : "Quote This Vehicle"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
