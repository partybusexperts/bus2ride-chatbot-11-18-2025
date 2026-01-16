'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from "react";

type DetectedType = 
  | 'phone' | 'email' | 'zip' | 'city' | 'date' | 'time' 
  | 'passengers' | 'hours' | 'pickup_address' | 'destination' 
  | 'dropoff_address' | 'event_type' | 'vehicle_type' | 'name' | 'website' | 'stop' | 'agent' | 'place' | 'unknown';

interface HistoryCity {
  value: string;
  addedAt: number;
  active: boolean;
}

interface DetectedChip {
  id: string;
  type: DetectedType;
  value: string;
  confidence: number;
  original: string;
  confirmed: boolean;
  autoPopulated: boolean;
  normalizedCity?: string; // For suburbs, the major metro to use for vehicle search
  displayCity?: string; // For display when different from normalizedCity (e.g., "Washington DC" for display, "Washington" for search)
  isRemote?: boolean; // True if location is 1+ hour from nearest major metro
}

type QuotedVehicle = {
  id: string;
  name: string;
  capacity?: string;
  priceDisplay: string;
  price: number;
  hours?: number;
};

type LeadStatus = 'quoted' | 'not_quoted' | 'spam' | 'not_interested' | 'pending_closed' | 'closed' | 'cancellation';

const LEAD_STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'quoted', label: 'Quoted' },
  { value: 'not_quoted', label: 'Not Quoted' },
  { value: 'spam', label: 'Spam' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'pending_closed', label: 'Pending Closed' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancellation', label: 'Cancellation' },
];

const AGENTS = [
  { id: '', name: 'Select Agent...' },
  { id: 'agent1', name: 'Floyd' },
  { id: 'agent2', name: 'Rob' },
  { id: 'agent3', name: 'Camille' },
  { id: 'agent4', name: 'Shiela' },
  { id: 'agent5', name: 'Henrietta' },
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
  destination: 'Trip Note',
  dropoff_address: 'Drop-off',
  event_type: 'Event',
  vehicle_type: 'Vehicle Type',
  name: 'Customer Name',
  website: 'Website',
  place: 'Place/Venue',
  stop: 'Trip Stop',
  agent: 'Agent',
  unknown: 'Trip Note',
};

const SECTION_STYLES = {
  agentCustomer: { bg: '#eff6ff', border: '#3b82f6', title: '#1e40af' },
  tripDetails: { bg: '#f0fdf4', border: '#22c55e', title: '#166534' },
  locations: { bg: '#fefce8', border: '#eab308', title: '#854d0e' },
  quotedSummary: { bg: '#faf5ff', border: '#a855f7', title: '#6b21a8' },
  payment: { bg: '#ecfeff', border: '#06b6d4', title: '#0e7490' },
  leadStatus: { bg: '#fef2f2', border: '#ef4444', title: '#991b1b' },
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
  place: { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  stop: { bg: '#fce7f3', text: '#9d174d', border: '#ec4899' },
  agent: { bg: '#dbeafe', text: '#1e40af', border: '#3b82f6' },
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
  const [modalPriceType, setModalPriceType] = useState<'standard' | 'prom' | 'before5pm' | 'aprilmay' | 'transfer'>('standard');
  const [modalHours, setModalHours] = useState<number>(4);
  
  const [confirmedData, setConfirmedData] = useState({
    agentName: "",
    callerName: "",
    phone: "",
    email: "",
    cityOrZip: "", // For vehicle search (e.g., "Washington")
    displayCityOrZip: "", // For display (e.g., "Washington DC") - only set when different from cityOrZip
    searchedCity: "", // Original city/suburb entered (for display)
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
  const [leadStatus, setLeadStatus] = useState<LeadStatus>('quoted');
  const [zohoLeadUrl, setZohoLeadUrl] = useState<string | null>(null);
  const [selectedFieldsToUpdate, setSelectedFieldsToUpdate] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [photoModalVehicle, setPhotoModalVehicle] = useState<any>(null);
  const [photoModalIndex, setPhotoModalIndex] = useState(0);
  const [vehicleRecommendation, setVehicleRecommendation] = useState<string>("");
  const [loadingRecommendation, setLoadingRecommendation] = useState(false);
  
  const [sortBy, setSortBy] = useState<'price_low' | 'price_high' | 'capacity_high' | 'capacity_low'>('price_low');
  const [rateHours, setRateHours] = useState<number>(4); // Default to 4 hours
  const [vehicleFilters, setVehicleFilters] = useState({
    partyBus: true,
    limo: true,
    shuttle: true,
    carSuv: true,
    oneWayTransfer: false,
  });
  const [historyCities, setHistoryCities] = useState<HistoryCity[]>([]);
  const [lookingUpPlace, setLookingUpPlace] = useState(false);
  const [cityDisambiguation, setCityDisambiguation] = useState<{ city: string; options: string[] } | null>(null);
  const [remoteLocationWarning, setRemoteLocationWarning] = useState<string | null>(null);
  
  const [zohoExistingLead, setZohoExistingLead] = useState<any>(null);
  const [zohoUpdateConfirmation, setZohoUpdateConfirmation] = useState<{
    show: boolean;
    lead: any;
    changes: Array<{ field: string; fieldKey: string; oldValue: string; newValue: string }>;
  } | null>(null);

  const AMBIGUOUS_CITIES: Record<string, string[]> = {
    'westmont': ['IL', 'NJ', 'CA', 'PA'],
    'springfield': ['IL', 'MA', 'MO', 'OH', 'OR', 'NJ'],
    'clinton': ['IA', 'MD', 'MA', 'MI', 'MS', 'NJ', 'NY', 'NC', 'OK', 'SC', 'TN'],
    'franklin': ['IN', 'KY', 'MA', 'NJ', 'NC', 'OH', 'PA', 'TN', 'VA', 'WI'],
    'madison': ['AL', 'CT', 'GA', 'IN', 'MS', 'NJ', 'WI'],
    'georgetown': ['DC', 'DE', 'KY', 'SC', 'TX'],
    'greenville': ['MI', 'MS', 'NC', 'OH', 'PA', 'SC', 'TX'],
    'bristol': ['CT', 'PA', 'RI', 'TN', 'VA'],
    'auburn': ['AL', 'CA', 'IN', 'ME', 'MA', 'NY', 'WA'],
    'oxford': ['AL', 'CT', 'MA', 'MI', 'MS', 'NC', 'OH', 'PA'],
    'riverside': ['CA', 'IL', 'NJ', 'OH'],
    'fairfield': ['CA', 'CT', 'IA', 'OH', 'TX'],
    'manchester': ['CT', 'NH', 'NJ', 'TN'],
    'columbia': ['MD', 'MO', 'PA', 'SC', 'TN'],
    'lexington': ['KY', 'MA', 'NC', 'SC', 'VA'],
  };
  
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const parseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const CITY_NAMES = [
    'phoenix', 'scottsdale', 'mesa', 'tempe', 'glendale', 'chandler', 'gilbert',
    'peoria', 'surprise', 'goodyear', 'avondale', 'tucson', 'las vegas', 'denver',
    'chicago', 'dallas', 'houston', 'austin', 'san antonio', 'los angeles',
    'san diego', 'san francisco', 'seattle', 'portland', 'atlanta', 'miami',
    'orlando', 'tampa', 'boston', 'new york', 'philadelphia', 'detroit',
  ];

  const extractCityFromText = (text: string): string | null => {
    const lower = text.toLowerCase();
    for (const city of CITY_NAMES) {
      if (lower.includes(city)) {
        return city.charAt(0).toUpperCase() + city.slice(1);
      }
    }
    return null;
  };

  const lookupPlace = useCallback(async (placeName: string, context: 'pickup' | 'dropoff' | 'stop' = 'stop', overrideLocation?: string) => {
    const extractedCity = extractCityFromText(placeName);
    const nearLocation = overrideLocation || extractedCity || confirmedData.cityOrZip || 'Arizona';
    setLookingUpPlace(true);
    try {
      const res = await fetch('/api/places/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ placeName, nearLocation, context }),
      });
      const data = await res.json();
      
      if (data.found && data.fullAddress) {
        const formattedAddress = data.name ? `${data.name} - ${data.fullAddress}` : data.fullAddress;
        
        // Directly apply the address to the appropriate field
        if (context === 'pickup') {
          setConfirmedData(prevData => {
            const updates: Partial<typeof prevData> = { pickupAddress: formattedAddress };
            if (!prevData.cityOrZip && data.city) {
              updates.cityOrZip = data.state ? `${data.city}, ${data.state}` : data.city;
            }
            return { ...prevData, ...updates };
          });
        } else if (context === 'dropoff') {
          setConfirmedData(prevData => {
            const updates: Partial<typeof prevData> = { dropoffAddress: formattedAddress };
            if (!prevData.cityOrZip && data.city) {
              updates.cityOrZip = data.state ? `${data.city}, ${data.state}` : data.city;
            }
            return { ...prevData, ...updates };
          });
        } else {
          const stopNote = `Stop: ${formattedAddress}`;
          setConfirmedData(prevData => {
            const updates: Partial<typeof prevData> = {
              tripNotes: prevData.tripNotes ? `${prevData.tripNotes}\n${stopNote}` : stopNote,
            };
            if (!prevData.cityOrZip && data.city) {
              updates.cityOrZip = data.state ? `${data.city}, ${data.state}` : data.city;
            }
            return { ...prevData, ...updates };
          });
        }
        return data;
      }
      return null;
    } catch (error) {
      console.error('Place lookup error:', error);
      return null;
    } finally {
      setLookingUpPlace(false);
    }
  }, [confirmedData.cityOrZip]);

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
    
    if (chip.type === 'city' || chip.type === 'zip') {
      const lowerCity = chip.value.toLowerCase().trim();
      
      // Check if state is already specified (e.g., "madison wi", "madison, wi")
      const hasStateSpecified = /\b(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)\b/i.test(lowerCity) ||
        /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i.test(lowerCity);
      
      // Only show disambiguation if state is NOT already specified
      const cityNameOnly = lowerCity.replace(/,?\s*(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\s*$/i, '').trim();
      const ambiguousOptions = AMBIGUOUS_CITIES[cityNameOnly];
      
      if (ambiguousOptions && chip.type === 'city' && !chip.normalizedCity && !hasStateSpecified) {
        setCityDisambiguation({ city: chip.value, options: ambiguousOptions });
        return;
      }
      
      setHistoryCities(prev => {
        const newHistory = prev.map(c => ({ ...c, active: false }));
        const existing = newHistory.find(c => c.value.toLowerCase() === chip.value.toLowerCase());
        if (!existing) {
          newHistory.push({ value: chip.value, addedAt: Date.now(), active: true });
        } else {
          existing.active = true;
        }
        return newHistory;
      });
      
      // Use normalized city (major metro) for vehicle search, but show original for display
      // e.g., "mesa az" shows as Mesa AZ but searches vehicles for Phoenix
      // For ZIP codes, show "ZIP XXXXX" and the metro area it maps to
      const searchCity = chip.normalizedCity || chip.value;
      // displayCityOrZip is what we show in "SHOWING: X RATES"
      // - For formatting variations: "Washington DC" includes "Washington" → show "Washington DC"
      // - For different metros: "Arlington" doesn't include "Dallas" → show "Dallas"
      const isFormattingVariation = chip.displayCity && chip.normalizedCity && 
        (chip.displayCity.toLowerCase().includes(chip.normalizedCity.toLowerCase()) ||
         chip.normalizedCity.toLowerCase().includes(chip.displayCity.toLowerCase()));
      const displayForRates = isFormattingVariation 
        ? (chip.displayCity || chip.value)  // Formatting variation: show nicer name (e.g., Washington DC)
        : (chip.normalizedCity || chip.displayCity || chip.value); // Different metro: show rates city (e.g., Dallas)
      const wasNormalized = chip.normalizedCity && chip.normalizedCity.toLowerCase() !== chip.value.toLowerCase();
      const isZipCode = chip.type === 'zip';
      
      // Update cityOrZip (for vehicle search), displayCityOrZip (for display), searchedCity (original for display), and pickupAddress
      setConfirmedData(prev => ({ 
        ...prev, 
        cityOrZip: searchCity, // Use normalized city for vehicle search
        displayCityOrZip: displayForRates, // Use appropriate display city for UI
        // For ZIP codes: always show "ZIP XXXXX" format even if we don't know the metro
        // For cities: only set if different from normalized
        searchedCity: isZipCode ? `ZIP ${chip.value}` : (wasNormalized ? chip.value : ''),
        pickupAddress: isZipCode ? '' : chip.value // Don't set pickup address for ZIPs
      }));
      
      // Show notification if city was normalized
      if (wasNormalized) {
        console.log(`[City Normalization] "${chip.value}" → searching vehicles for "${chip.normalizedCity}"${chip.displayCity ? ` (display: ${chip.displayCity})` : ''}`);
      }
      
      // Show warning if this is a remote location (1+ hour from nearest major metro)
      if (chip.isRemote) {
        setRemoteLocationWarning(`"${chip.value}" is over 1 hour from ${chip.normalizedCity || 'the nearest major city'}. Confirm with manager about travel surcharge.`);
      } else {
        setRemoteLocationWarning(null);
      }
      
      setCityDisambiguation(null);
      return;
    }
    
    if (chip.type === 'stop') {
      // Add stop directly to trip notes
      setConfirmedData(prev => ({
        ...prev,
        tripNotes: prev.tripNotes ? `${prev.tripNotes}\nStop: ${chip.value}` : `Stop: ${chip.value}`,
      }));
      return;
    }
    
    if (chip.type === 'pickup_address') {
      // Known major cities that should trigger vehicle search directly
      const KNOWN_MAJOR_CITIES = [
        'phoenix', 'scottsdale', 'mesa', 'tempe', 'glendale', 'chandler', 'gilbert',
        'denver', 'chicago', 'dallas', 'houston', 'austin', 'san antonio', 'los angeles',
        'san diego', 'san francisco', 'seattle', 'portland', 'atlanta', 'miami',
        'orlando', 'tampa', 'boston', 'new york', 'philadelphia', 'detroit',
        'minneapolis', 'las vegas', 'grand rapids', 'nashville', 'charlotte',
        'fort worth', 'plano', 'irving', 'arlington', 'frisco',
        'tucson', 'albuquerque', 'salt lake city', 'oklahoma city',
      ];
      
      const lowerValue = chip.value.toLowerCase().trim();
      const isKnownCity = KNOWN_MAJOR_CITIES.includes(lowerValue) || 
                          KNOWN_MAJOR_CITIES.some(c => lowerValue.startsWith(c + ' ') || lowerValue.startsWith(c + ','));
      
      // First set the field with original value (e.g., "Mesa")
      setConfirmedData(prev => ({
        ...prev,
        pickupAddress: chip.value,
        tripNotes: prev.tripNotes ? `${prev.tripNotes}\nPU: ${chip.value}` : `PU: ${chip.value}`,
      }));
      
      // If the pickup location is a known city/suburb, also trigger a vehicle search
      if (chip.normalizedCity) {
        // Suburb that normalizes to major metro (e.g., mesa → Phoenix)
        setConfirmedData(prev => ({
          ...prev,
          cityOrZip: chip.normalizedCity!,
          searchedCity: chip.value, // Track original suburb
        }));
        console.log(`[Pickup City Normalization] "${chip.value}" → searching vehicles for "${chip.normalizedCity}"`);
        
        // Show warning if this is a remote location
        if (chip.isRemote) {
          setRemoteLocationWarning(`"${chip.value}" is over 1 hour from ${chip.normalizedCity}. Confirm with manager about travel surcharge.`);
        }
      } else if (isKnownCity) {
        // Known major city - use as-is for vehicle search
        setConfirmedData(prev => ({
          ...prev,
          cityOrZip: chip.value,
        }));
        console.log(`[Pickup City Detected] "${chip.value}" is a known city → searching vehicles`);
      }
      
      // Try to look up real address - will only update if found
      lookupPlace(chip.value, 'pickup');
      return;
    }
    
    if (chip.type === 'dropoff_address') {
      // First set the field with original value (e.g., "Mesa")
      // Only replace with real address if lookup finds one
      setConfirmedData(prev => ({
        ...prev,
        dropoffAddress: chip.value,
        tripNotes: prev.tripNotes ? `${prev.tripNotes}\nDO: ${chip.value}` : `DO: ${chip.value}`,
      }));
      // Try to look up real address - will only update if found
      lookupPlace(chip.value, 'dropoff');
      return;
    }
    
    if (chip.type === 'destination' || chip.type === 'unknown') {
      setConfirmedData(prev => ({
        ...prev,
        tripNotes: prev.tripNotes ? `${prev.tripNotes}\n${chip.value}` : chip.value,
      }));
      return;
    }
    
    if (chip.type === 'agent') {
      setConfirmedData(prev => ({ ...prev, agentName: chip.value }));
      return;
    }
    
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
  }, [lookupPlace]);

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
          let shouldAutoPopulate = item.confidence >= AUTO_POPULATE_THRESHOLD && item.type !== 'unknown';
          
          // Don't auto-populate dates in the past - require agent confirmation
          if (item.type === 'date' && shouldAutoPopulate) {
            const parsedDate = parseDateString(item.value);
            if (parsedDate) {
              const daysUntil = calculateDaysUntilEvent(parsedDate);
              if (daysUntil < 0) {
                shouldAutoPopulate = false;
              }
            }
          }
          
          return {
            id: generateId(),
            type: item.type,
            value: item.value,
            confidence: item.confidence,
            original: item.original || text,
            confirmed: shouldAutoPopulate,
            autoPopulated: shouldAutoPopulate,
            ...(item.normalizedCity && { normalizedCity: item.normalizedCity }),
            ...(item.displayCity && { displayCity: item.displayCity }),
            ...(item.isRemote && { isRemote: item.isRemote }),
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
  }, [applyChipToData, confirmedData.cityOrZip]);

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && smartInput.trim()) {
      e.preventDefault();
      parseInput(smartInput);
    }
  };

  const clearAll = useCallback(() => {
    setSmartInput("");
    setChips([]);
    setConfirmedData({
      agentName: "",
      callerName: "",
      phone: "",
      email: "",
      cityOrZip: "",
      displayCityOrZip: "",
      searchedCity: "",
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
    setVehicles([]);
    setQuotedVehicles([]);
    setVehicleMessage("");
    setLeadStatus('quoted');
    setZohoLeadUrl(null);
    setSaveMessage("");
    setHistoryCities([]);
    setRemoteLocationWarning(null);
    setVehicleRecommendation("");
    setCityDisambiguation(null);
    setSelectedVehicle(null);
  }, []);


  const confirmChip = useCallback((chipId: string) => {
    setChips(prev => {
      const chip = prev.find(c => c.id === chipId);
      if (!chip) return prev;
      
      applyChipToData(chip);
      
      return prev.map(c => c.id === chipId ? { ...c, confirmed: true } : c);
    });
  }, [applyChipToData]);

  const rejectChip = useCallback((chipId: string) => {
    setChips(prev => {
      const chip = prev.find(c => c.id === chipId);
      if (chip && chip.confirmed) {
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
          dropoff_address: 'dropoffAddress',
          event_type: 'eventType',
          vehicle_type: 'vehicleType',
          name: 'callerName',
          website: 'websiteUrl',
          agent: 'agentName',
        };
        const field = fieldMap[chip.type];
        if (field) {
          setConfirmedData(prevData => ({ ...prevData, [field]: '' }));
        }
        if (chip.type === 'city' || chip.type === 'zip') {
          setConfirmedData(prevData => {
            // Clear cityOrZip and pickupAddress if pickupAddress matches the city
            const newData = { ...prevData, cityOrZip: '' };
            if (prevData.pickupAddress.toLowerCase().trim() === chip.value.toLowerCase().trim()) {
              newData.pickupAddress = '';
            }
            return newData;
          });
          setHistoryCities(prevHistory => prevHistory.filter(c => c.value.toLowerCase() !== chip.value.toLowerCase()));
          setCityDisambiguation(null);
        }
      }
      return prev.filter(c => c.id !== chipId);
    });
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
          ? `${prev.tripNotes}\n${unknownNotes}` 
          : unknownNotes
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
      console.log('[Vehicle Search Response]', cityOrZip, 'returned', data.vehicles?.length || 0, 'vehicles');
      setVehicles(data.vehicles || []);
      setVehicleMessage(data.message || "");
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

  // Sync rateHours with hours field - when hours changes on left panel, update the rate focus on right
  useEffect(() => {
    const hours = Number(confirmedData.hours);
    if (hours >= 1 && hours <= 24) {
      setRateHours(hours);
    }
  }, [confirmedData.hours]);

  function toggleQuoted(vehicle: any) {
    const wasQuoted = quotedVehicles.some(v => v.id === vehicle.id);
    
    if (!wasQuoted) {
      const displayPrice = vehicle.displayPrice;
      const fallbackPrice = vehicle.price;
      
      const hasValidDisplayPrice = typeof displayPrice === 'number' && Number.isFinite(displayPrice) && displayPrice > 0;
      const hasValidFallbackPrice = typeof fallbackPrice === 'number' && Number.isFinite(fallbackPrice) && fallbackPrice > 0;
      
      if (!hasValidDisplayPrice && !hasValidFallbackPrice) {
        console.warn('Cannot add vehicle with no valid price:', vehicle.name, 'displayPrice:', displayPrice, 'price:', fallbackPrice);
        return;
      }
    }
    
    const effectivePrice = (typeof vehicle.displayPrice === 'number' && vehicle.displayPrice > 0) 
      ? vehicle.displayPrice 
      : (typeof vehicle.price === 'number' && vehicle.price > 0) 
        ? vehicle.price 
        : 0;
    
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
        price: effectivePrice,
        hours: vehicle.displayHours || vehicle.hours || rateHours,
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
  
  const totalQuotedPrice = useMemo(() => {
    return quotedVehicles.reduce((sum, v) => sum + (v.price || 0), 0);
  }, [quotedVehicles]);

  const depositPercentage = useMemo(() => {
    return daysUntilEvent <= 7 ? 100 : 50;
  }, [daysUntilEvent]);

  const depositAmount = useMemo(() => {
    if (totalQuotedPrice === 0) return 0;
    return daysUntilEvent <= 7 ? totalQuotedPrice : Math.round(totalQuotedPrice * 0.5);
  }, [totalQuotedPrice, daysUntilEvent]);

  const balanceDue = useMemo(() => {
    return totalQuotedPrice - depositAmount;
  }, [totalQuotedPrice, depositAmount]);

  const getVehiclePrice = useCallback((v: any, hours: number): number => {
    // Try exact hour match first (standard pricing)
    const exactKey = `price_${hours}hr`;
    if (v[exactKey]) {
      const numPrice = Number(v[exactKey]);
      if (!isNaN(numPrice) && numPrice > 0) return numPrice;
    }
    
    // Try to find available standard tiers and calculate
    const availableTiers = [3, 4, 5, 6, 7, 8, 9, 10].filter(h => {
      const key = `price_${h}hr`;
      return v[key] && Number(v[key]) > 0;
    });
    
    if (availableTiers.length >= 2) {
      // Calculate hourly rate from two consecutive tiers for accuracy
      const sortedTiers = availableTiers.sort((a, b) => a - b);
      const lower = sortedTiers[0];
      const upper = sortedTiers[sortedTiers.length - 1];
      const lowerPrice = Number(v[`price_${lower}hr`]);
      const upperPrice = Number(v[`price_${upper}hr`]);
      const hourlyRate = (upperPrice - lowerPrice) / (upper - lower);
      
      // Calculate price for requested hours
      if (hours <= lower) {
        return lowerPrice;
      } else if (hours >= upper) {
        return Math.round(upperPrice + hourlyRate * (hours - upper));
      } else {
        return Math.round(lowerPrice + hourlyRate * (hours - lower));
      }
    } else if (availableTiers.length === 1) {
      // Only one tier available, use implied hourly rate
      const tier = availableTiers[0];
      const tierPrice = Number(v[`price_${tier}hr`]);
      const impliedHourlyRate = tierPrice / tier;
      return Math.round(impliedHourlyRate * hours);
    }
    
    // Fallback to base price or 4hr price
    const fallback = v.price_4hr || v.price || 0;
    const numPrice = Number(fallback);
    return isNaN(numPrice) ? 0 : numPrice;
  }, []);

  const filteredVehicles = useMemo(() => {
    let filtered = vehicles.filter(v => {
      // Use 'categories' (plural) from API, fallback to 'category' for compatibility
      const category = (v.categories || v.category || '').toLowerCase();
      // Use 'vehicle_title' from API, fallback to 'name' for compatibility
      const name = (v.vehicle_title || v.name || '').toLowerCase();
      
      // TRUST Supabase categories - if it says "party bus", it's a party bus
      const isPartyBus = category.includes('party bus') || category.includes('limo bus') || 
                         name.includes('party bus') || name.includes('limo bus');
      const isCarSuv = category.includes('sedan') || category.includes('suv') || 
                       category.includes('hummer') || category.includes('escalade') ||
                       name.includes('sedan') || name.includes('suv') || name.includes('escalade');
      // Party buses are NOT limos, even if they have "limo" in the name/category
      const isLimo = !isPartyBus && !isCarSuv && (
        category.includes('limousine') || 
        (category.includes('limo') && !category.includes('shuttle') && !category.includes('coach')) ||
        name.includes('limousine') || name.includes('stretch limo')
      );
      // Shuttle/Coach - anything with shuttle or coach that isn't already categorized
      const isShuttle = !isPartyBus && !isLimo && !isCarSuv && (
                        category.includes('shuttle') || category.includes('executive') || 
                        category.includes('coach') || category.includes('charter') ||
                        name.includes('shuttle') || name.includes('coach') ||
                        (name.includes('sprinter') && !name.includes('limo')));
      const isTransfer = v.is_transfer === true || v.is_transfer === 'true';
      
      if (vehicleFilters.oneWayTransfer && !isTransfer) return false;
      
      // If vehicle doesn't match any category, show it if any filter is on (don't exclude uncategorized vehicles)
      const isUncategorized = !isPartyBus && !isLimo && !isShuttle && !isCarSuv;
      
      if (isPartyBus && !vehicleFilters.partyBus) return false;
      if (isLimo && !vehicleFilters.limo) return false;
      if (isShuttle && !vehicleFilters.shuttle) return false;
      if (isCarSuv && !vehicleFilters.carSuv) return false;
      
      // Show uncategorized vehicles if all filters are enabled (default state)
      if (isUncategorized) {
        return vehicleFilters.partyBus && vehicleFilters.limo && vehicleFilters.shuttle && vehicleFilters.carSuv;
      }
      
      return true;
    }).map(v => {
      const displayPrice = getVehiclePrice(v, rateHours);
      return {
        ...v,
        displayPrice,
        priceDisplay: displayPrice > 0 ? `$${displayPrice.toLocaleString()}` : 'Call for price',
        displayHours: rateHours,
      };
    });
    
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'price_low':
          return (a.displayPrice || 0) - (b.displayPrice || 0);
        case 'price_high':
          return (b.displayPrice || 0) - (a.displayPrice || 0);
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
  }, [vehicles, vehicleFilters, sortBy, rateHours, getVehiclePrice]);

  const hasTransferVehicles = useMemo(() => {
    return vehicles.some(v => v.is_transfer === true || v.is_transfer === 'true' || (v.transfer_price != null && Number(v.transfer_price) > 0));
  }, [vehicles]);

  // All available hour options - show 3-10 which covers all pricing tiers
  // (standard 3-10, prom 6-10, before5pm 3-7)
  const availableHourOptions = useMemo(() => {
    const baseHours = [3, 4, 5, 6, 7, 8, 9, 10];
    
    // Add the current rateHours if not already in the list (for custom values)
    if (rateHours >= 1 && rateHours <= 24 && !baseHours.includes(rateHours)) {
      return [...baseHours, rateHours].sort((a, b) => a - b);
    }
    
    return baseHours;
  }, [rateHours]);

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
            description: vehicle.description || vehicle.short_description || '',
            custom_instructions: vehicle.custom_instructions || vehicle.instructions || '',
            price_3hr: vehicle.price_3hr,
            price_4hr: vehicle.price_4hr,
            price_5hr: vehicle.price_5hr,
            price_6hr: vehicle.price_6hr,
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
    setZohoLeadUrl(null);

    const finalLeadStatus: LeadStatus = quotedVehicles.length > 0 ? 'quoted' : leadStatus;
    const day = confirmedData.date ? getDayOfWeek(confirmedData.date) : "";

    const callData = {
      callerName: confirmedData.callerName,
      phone: confirmedData.phone,
      email: confirmedData.email,
      cityOrZip: confirmedData.cityOrZip,
      pickupAddress: confirmedData.pickupAddress,
      dropoffAddress: confirmedData.dropoffAddress,
      date: confirmedData.date,
      day,
      pickupTime: confirmedData.pickupTime,
      passengers: confirmedData.passengers,
      hours: confirmedData.hours,
      eventType: confirmedData.eventType,
      vehicleType: confirmedData.vehicleType,
      tripNotes: confirmedData.tripNotes,
      quotedVehicles,
      totalQuoted: totalQuotedPrice,
      deposit: depositAmount,
      balance: balanceDue,
      leadStatus: finalLeadStatus,
      agent: confirmedData.agentName,
      tipIncluded: confirmedData.tipIncluded,
      paidByCard: confirmedData.paidByCard,
      paidByCash: confirmedData.paidByCash,
      leadSource: confirmedData.leadSource,
    };

    try {
      // First, check if lead exists by phone or email
      if (confirmedData.phone || confirmedData.email) {
        const findRes = await fetch("/api/zoho/find-lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: confirmedData.phone, email: confirmedData.email }),
        });
        
        const findData = await findRes.json();
        
        if (findData.found && findData.leads?.length > 0) {
          const existingLead = findData.leads[0];
          setZohoExistingLead(existingLead);
          
          // Calculate what fields will change
          const changes: Array<{ field: string; fieldKey: string; oldValue: string; newValue: string }> = [];
          
          // Map lead status to display value
          const mapLeadStatusForDisplay = (status: string): string => {
            const statusMap: Record<string, string> = {
              quoted: "Quoted",
              not_quoted: "Not Quoted",
              spam: "Spam",
              not_interested: "Not Interested",
              pending_closed: "Pending Closed",
              closed: "Closed",
              cancellation: "Cancellation",
            };
            return statusMap[status?.toLowerCase()] || "Quoted";
          };
          
          // Helper to normalize values for comparison
          const normalizeForCompare = (val: string, fieldType?: string): string => {
            if (!val) return '';
            const str = String(val).trim().toLowerCase();
            
            // Normalize time formats (18:00 vs 6:00 PM vs 6pm)
            if (fieldType === 'time') {
              // Convert 24-hour to comparable format
              const match24 = str.match(/^(\d{1,2}):(\d{2})$/);
              if (match24) {
                return `${parseInt(match24[1])}:${match24[2]}`;
              }
              // Convert 12-hour to comparable format
              const match12 = str.match(/^(\d{1,2}):?(\d{2})?\s*([ap])\.?m?\.?$/i);
              if (match12) {
                let hour = parseInt(match12[1]);
                const min = match12[2] || '00';
                const meridiem = match12[3].toLowerCase();
                if (meridiem === 'p' && hour < 12) hour += 12;
                if (meridiem === 'a' && hour === 12) hour = 0;
                return `${hour}:${min}`;
              }
            }
            
            // Normalize numbers
            if (fieldType === 'number') {
              const num = parseInt(str);
              return isNaN(num) ? str : String(num);
            }
            
            // Normalize phone (remove non-digits)
            if (fieldType === 'phone') {
              return str.replace(/\D/g, '').slice(-10);
            }
            
            return str;
          };
          
          // Convert 24-hour to 12-hour for display
          const formatTimeFor12Hour = (time24: string): string => {
            if (!time24) return '';
            const match = time24.match(/^(\d{1,2}):(\d{2})$/);
            if (match) {
              let hour = parseInt(match[1]);
              const min = match[2];
              const meridiem = hour >= 12 ? 'PM' : 'AM';
              if (hour > 12) hour -= 12;
              if (hour === 0) hour = 12;
              return `${hour}:${min} ${meridiem}`;
            }
            return time24;
          };
          
          const fieldMappings: Array<{ label: string; fieldKey: string; zohoField: string; newValue: string; fieldType?: string }> = [
            { label: 'Customer Name', fieldKey: 'callerName', zohoField: 'Last_Name', newValue: confirmedData.callerName },
            { label: 'Phone', fieldKey: 'phone', zohoField: 'Phone', newValue: confirmedData.phone, fieldType: 'phone' },
            { label: 'Email', fieldKey: 'email', zohoField: 'Email', newValue: confirmedData.email },
            { label: 'Pickup Address', fieldKey: 'pickupAddress', zohoField: 'Pick_Up_Address', newValue: confirmedData.pickupAddress },
            { label: 'Drop-Off Address', fieldKey: 'dropoffAddress', zohoField: 'Drop_Off_Address', newValue: confirmedData.dropoffAddress },
            { label: 'Passengers', fieldKey: 'passengers', zohoField: 'Party_Sizes', newValue: confirmedData.passengers, fieldType: 'number' },
            { label: 'Hours', fieldKey: 'hours', zohoField: 'Amount_Of_Hours', newValue: confirmedData.hours, fieldType: 'number' },
            { label: 'Event Type', fieldKey: 'eventType', zohoField: 'Event_Types', newValue: confirmedData.eventType },
            { label: 'Event Date', fieldKey: 'date', zohoField: 'Date_Of_Events', newValue: confirmedData.date },
            { label: 'Pickup Time', fieldKey: 'pickupTime', zohoField: 'Pick_Up_Time', newValue: confirmedData.pickupTime, fieldType: 'time' },
            { label: 'Trip Notes', fieldKey: 'tripNotes', zohoField: 'Where_Are_They_Going', newValue: confirmedData.tripNotes },
            { label: 'Lead Status', fieldKey: 'leadStatus', zohoField: 'Status', newValue: mapLeadStatusForDisplay(finalLeadStatus) },
          ];
          
          for (const mapping of fieldMappings) {
            const oldValueRaw = existingLead[mapping.zohoField] || '';
            const newValueRaw = mapping.newValue || '';
            
            // Skip if no new value
            if (!newValueRaw) continue;
            
            // Normalize both for comparison
            const oldNorm = normalizeForCompare(String(oldValueRaw), mapping.fieldType);
            const newNorm = normalizeForCompare(newValueRaw, mapping.fieldType);
            
            // Only add if values are actually different
            if (oldNorm !== newNorm) {
              // Format display values nicely
              let displayNew = newValueRaw;
              let displayOld = String(oldValueRaw);
              
              if (mapping.fieldType === 'time') {
                displayNew = formatTimeFor12Hour(newValueRaw) || newValueRaw;
              }
              
              changes.push({
                field: mapping.label,
                fieldKey: mapping.fieldKey,
                oldValue: displayOld || '(empty)',
                newValue: displayNew,
              });
            }
          }
          
          if (changes.length > 0) {
            // Show confirmation dialog with all fields pre-selected
            setSelectedFieldsToUpdate(new Set(changes.map(c => c.fieldKey)));
            setZohoUpdateConfirmation({
              show: true,
              lead: existingLead,
              changes,
            });
            setSaving(false);
            return;
          } else {
            // No changes, just update with trip notes
            const saveRes = await fetch("/api/zoho/save-call", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ mode: "update", leadId: existingLead.id, data: callData }),
            });
            
            if (!saveRes.ok) throw new Error("Zoho update error");
            setSaveMessage("Updated existing lead in Zoho");
            setLeadStatus(finalLeadStatus);
            setSaving(false);
            return;
          }
        }
      }
      
      // No existing lead found, create new
      const saveRes = await fetch("/api/zoho/save-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "create", data: callData }),
      });

      const result = await saveRes.json();
      if (!saveRes.ok || result.success === false) {
        throw new Error(result.error || "Zoho create error");
      }
      if (result.leadUrl) {
        setZohoLeadUrl(result.leadUrl);
      }
      setSaveMessage(`New lead created in Zoho`);
      setLeadStatus(finalLeadStatus);
    } catch (err) {
      console.error(err);
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setSaveMessage(`Error: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  }
  
  async function confirmZohoUpdate() {
    if (!zohoUpdateConfirmation?.lead) return;
    
    setSaving(true);
    const finalLeadStatus: LeadStatus = quotedVehicles.length > 0 ? 'quoted' : leadStatus;
    const day = confirmedData.date ? getDayOfWeek(confirmedData.date) : "";
    
    const callData = {
      callerName: confirmedData.callerName,
      phone: confirmedData.phone,
      email: confirmedData.email,
      cityOrZip: confirmedData.cityOrZip,
      pickupAddress: confirmedData.pickupAddress,
      dropoffAddress: confirmedData.dropoffAddress,
      date: confirmedData.date,
      day,
      pickupTime: confirmedData.pickupTime,
      passengers: confirmedData.passengers,
      hours: confirmedData.hours,
      eventType: confirmedData.eventType,
      vehicleType: confirmedData.vehicleType,
      tripNotes: confirmedData.tripNotes,
      quotedVehicles,
      totalQuoted: totalQuotedPrice,
      deposit: depositAmount,
      balance: balanceDue,
      leadStatus: finalLeadStatus,
      agent: confirmedData.agentName,
      tipIncluded: confirmedData.tipIncluded,
      paidByCard: confirmedData.paidByCard,
      paidByCash: confirmedData.paidByCash,
      leadSource: confirmedData.leadSource,
    };
    
    const fieldsToUpdate = Array.from(selectedFieldsToUpdate);
    
    try {
      const saveRes = await fetch("/api/zoho/save-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          mode: "update", 
          leadId: zohoUpdateConfirmation.lead.id, 
          fieldsToUpdate: fieldsToUpdate.length > 0 ? fieldsToUpdate : undefined,
          data: callData 
        }),
      });
      
      const result = await saveRes.json();
      if (!saveRes.ok || result.success === false) {
        throw new Error(result.error || "Zoho update error");
      }
      if (result.leadUrl) {
        setZohoLeadUrl(result.leadUrl);
      }
      setSaveMessage(`Lead updated in Zoho (${fieldsToUpdate.length} field${fieldsToUpdate.length !== 1 ? 's' : ''} changed)`);
      setLeadStatus(finalLeadStatus);
    } catch (err) {
      console.error(err);
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      setSaveMessage(`Error: ${errorMsg}`);
    } finally {
      setSaving(false);
      setZohoUpdateConfirmation(null);
      setSelectedFieldsToUpdate(new Set());
    }
  }
  
  function cancelZohoUpdate() {
    setZohoUpdateConfirmation(null);
    setSelectedFieldsToUpdate(new Set());
    setSaveMessage("Update cancelled");
  }
  
  function toggleFieldSelection(fieldKey: string) {
    setSelectedFieldsToUpdate(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fieldKey)) {
        newSet.delete(fieldKey);
      } else {
        newSet.add(fieldKey);
      }
      return newSet;
    });
  }
  
  function selectAllFields() {
    if (zohoUpdateConfirmation?.changes) {
      setSelectedFieldsToUpdate(new Set(zohoUpdateConfirmation.changes.map(c => c.fieldKey)));
    }
  }
  
  function deselectAllFields() {
    setSelectedFieldsToUpdate(new Set());
  }

  const pendingChips = chips.filter(c => !c.confirmed);
  const autoPopulatedChips = chips.filter(c => c.autoPopulated);

  const getInputStyle = (value: string): React.CSSProperties => ({
    width: '100%',
    padding: '8px 10px',
    border: value?.trim() ? '2px solid #22c55e' : '2px solid #fca5a5',
    borderRadius: '6px',
    fontSize: '13px',
    outline: 'none',
    background: value?.trim() ? '#f0fdf4' : '#fef2f2',
  });

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
    <div style={{ background: '#f3f4f6', padding: '16px', borderRadius: '12px', paddingTop: '110px' }}>
      <div style={{ 
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #2d5a87 100%)',
        padding: '16px 20px',
        borderRadius: '0 0 10px 10px',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        maxHeight: '150px',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={clearAll}
            style={{
              padding: '14px 18px',
              fontSize: '14px',
              fontWeight: 700,
              border: 'none',
              borderRadius: '8px',
              background: '#dc2626',
              color: '#fff',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            }}
            title="Clear all fields and start fresh"
          >
            NEW CALL
          </button>
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
          <div style={{ marginTop: '10px' }}>
            {pendingChips.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
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
            
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {chips.map(chip => {
                const colors = TYPE_COLORS[chip.type];
                const isAutoPopulated = chip.autoPopulated && chip.confirmed;
                const isLowConfidence = chip.confidence < 0.8 && !chip.confirmed;
                const isUncertain = chip.confidence < 0.6;
                
                const getBorderColor = () => {
                  if (isAutoPopulated) return '#16a34a';
                  if (isUncertain) return '#dc2626';
                  if (isLowConfidence) return '#f59e0b';
                  return colors.border;
                };
                
                const getBgColor = () => {
                  if (isUncertain) return '#fef2f2';
                  if (isLowConfidence) return '#fffbeb';
                  return colors.bg;
                };
                
                return (
                  <div
                    key={chip.id}
                    style={{
                      background: getBgColor(),
                      border: `1px solid ${getBorderColor()}`,
                      borderRadius: '12px',
                      padding: '3px 8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      opacity: chip.confirmed ? 0.8 : 1,
                      fontSize: '11px',
                    }}
                  >
                    {isUncertain && !chip.confirmed && (
                      <span style={{ fontSize: '12px', color: '#dc2626' }} title="Low confidence - please verify">&#9888;</span>
                    )}
                    {isLowConfidence && !isUncertain && !chip.confirmed && (
                      <span style={{ fontSize: '12px', color: '#f59e0b' }} title="Verify this detection">?</span>
                    )}
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
                          'pickup_address', 'dropoff_address', 'stop', 'website'
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
                    {chip.confirmed && (
                      <button
                        onClick={() => rejectChip(chip.id)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          color: '#9ca3af',
                          fontSize: '14px',
                          lineHeight: 1,
                          marginLeft: '2px',
                        }}
                        title="Remove"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {cityDisambiguation && (
          <div style={{ 
            marginTop: '10px', 
            padding: '10px 14px', 
            background: '#fef3c7', 
            borderRadius: '8px',
            border: '2px solid #f59e0b',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <span style={{ fontSize: '13px', color: '#92400e', fontWeight: 700 }}>
              Which {cityDisambiguation.city}?
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {cityDisambiguation.options.map(state => (
                <button
                  key={state}
                  onClick={() => {
                    const fullCity = `${cityDisambiguation.city}, ${state}`;
                    const cityOnly = cityDisambiguation.city.charAt(0).toUpperCase() + cityDisambiguation.city.slice(1).toLowerCase();
                    setHistoryCities(prev => {
                      const newHistory = prev.map(c => ({ ...c, active: false }));
                      newHistory.push({ value: fullCity, addedAt: Date.now(), active: true });
                      return newHistory;
                    });
                    setConfirmedData(prev => ({ ...prev, cityOrZip: cityOnly, searchedCity: fullCity }));
                    setCityDisambiguation(null);
                  }}
                  style={{
                    padding: '6px 14px',
                    fontSize: '14px',
                    fontWeight: 700,
                    background: '#fff',
                    border: '2px solid #d97706',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: '#92400e',
                  }}
                >
                  {state}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCityDisambiguation(null)}
              style={{
                padding: '4px 8px',
                fontSize: '16px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#92400e',
                marginLeft: 'auto',
              }}
            >
              ×
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 280px 1fr', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ background: SECTION_STYLES.agentCustomer.bg, padding: '14px', borderRadius: '10px', border: `2px solid ${SECTION_STYLES.agentCustomer.border}` }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px', color: SECTION_STYLES.agentCustomer.title }}>Agent & Customer</h3>
            <div style={{ display: 'grid', gap: '8px' }}>
              <div>
                <label style={labelStyle}>Agent</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {AGENTS.filter(a => a.id !== '').map(agent => (
                    <button
                      key={agent.id}
                      onClick={() => setConfirmedData(prev => ({ ...prev, agentName: agent.name }))}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: confirmedData.agentName === agent.name ? '2px solid #3b82f6' : '1px solid #d1d5db',
                        background: confirmedData.agentName === agent.name ? '#dbeafe' : '#fff',
                        color: confirmedData.agentName === agent.name ? '#1e40af' : '#374151',
                        fontSize: '12px',
                        fontWeight: confirmedData.agentName === agent.name ? 700 : 500,
                        cursor: 'pointer',
                      }}
                    >
                      {agent.name}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Customer Name</label>
                <input style={getInputStyle(confirmedData.callerName)} placeholder="Customer name" value={confirmedData.callerName} onChange={(e) => setConfirmedData(prev => ({ ...prev, callerName: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input style={getInputStyle(confirmedData.phone)} placeholder="Phone number" value={confirmedData.phone} onChange={(e) => setConfirmedData(prev => ({ ...prev, phone: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input style={getInputStyle(confirmedData.email)} placeholder="Email address" value={confirmedData.email} onChange={(e) => setConfirmedData(prev => ({ ...prev, email: e.target.value }))} />
              </div>
            </div>
          </div>

          <div style={{ background: SECTION_STYLES.tripDetails.bg, padding: '14px', borderRadius: '10px', border: `2px solid ${SECTION_STYLES.tripDetails.border}` }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px', color: SECTION_STYLES.tripDetails.title }}>Trip Details</h3>
            <div style={{ display: 'grid', gap: '8px' }}>
              <div>
                <label style={labelStyle}>City / ZIP</label>
                <input style={getInputStyle(confirmedData.cityOrZip)} placeholder="Service area" value={confirmedData.cityOrZip} onChange={(e) => setConfirmedData(prev => ({ ...prev, cityOrZip: e.target.value }))} />
                {historyCities.filter(c => !c.active).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                    {historyCities.filter(c => !c.active).map((city) => (
                      <span 
                        key={city.addedAt}
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: '#e5e7eb',
                          color: '#6b7280',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        {city.value}
                        <button
                          onClick={() => setHistoryCities(prev => prev.filter(c => c.addedAt !== city.addedAt))}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: 0,
                            color: '#9ca3af',
                            fontSize: '12px',
                            lineHeight: 1,
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {lookingUpPlace && (
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                    Looking up place...
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={labelStyle}>Passengers</label>
                  <input style={getInputStyle(confirmedData.passengers)} type="number" placeholder="#" value={confirmedData.passengers} onChange={(e) => setConfirmedData(prev => ({ ...prev, passengers: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Hours</label>
                  <input style={getInputStyle(confirmedData.hours)} type="number" placeholder="#" value={confirmedData.hours} onChange={(e) => setConfirmedData(prev => ({ ...prev, hours: e.target.value }))} />
                  {(() => {
                    const hoursValue = Number(confirmedData.hours);
                    return Number.isFinite(hoursValue) && hoursValue > 12;
                  })() && (
                    <div style={{ fontSize: '11px', color: '#dc2626', background: '#fef2f2', padding: '4px 8px', borderRadius: '4px', marginTop: '4px' }}>
                      Over 12 hours - verify this is correct (not a phone number?)
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={labelStyle}>Event Type</label>
                  <input style={getInputStyle(confirmedData.eventType)} placeholder="Prom, Wedding..." value={confirmedData.eventType} onChange={(e) => setConfirmedData(prev => ({ ...prev, eventType: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Vehicle Type</label>
                  <input style={getInputStyle(confirmedData.vehicleType)} placeholder="Party Bus, Limo..." value={confirmedData.vehicleType} onChange={(e) => setConfirmedData(prev => ({ ...prev, vehicleType: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input style={getInputStyle(confirmedData.date)} type="date" value={confirmedData.date} onChange={(e) => setConfirmedData(prev => ({ ...prev, date: e.target.value }))} />
                </div>
                <div>
                  <label style={labelStyle}>Day</label>
                  <input style={{ ...inputStyle, background: '#f9fafb' }} value={dayOfWeek} readOnly />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Pickup Time</label>
                <input style={getInputStyle(confirmedData.pickupTime)} type="time" value={confirmedData.pickupTime} onChange={(e) => setConfirmedData(prev => ({ ...prev, pickupTime: e.target.value }))} />
              </div>
            </div>
          </div>

          {remoteLocationWarning && (
            <div style={{ 
              background: '#fef3c7', 
              border: '2px solid #f59e0b', 
              borderRadius: '10px', 
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
            }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: '#92400e', fontSize: '13px', marginBottom: '4px' }}>
                  REMOTE LOCATION - 1+ HOUR AWAY
                </div>
                <div style={{ fontSize: '12px', color: '#78350f' }}>
                  {remoteLocationWarning}
                </div>
              </div>
              <button
                onClick={() => setRemoteLocationWarning(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '16px',
                  color: '#92400e',
                  padding: '0',
                }}
              >
                ×
              </button>
            </div>
          )}

          <div style={{ background: SECTION_STYLES.locations.bg, padding: '14px', borderRadius: '10px', border: `2px solid ${SECTION_STYLES.locations.border}` }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px', color: SECTION_STYLES.locations.title }}>Locations</h3>
            <div style={{ display: 'grid', gap: '8px' }}>
              <div>
                <label style={labelStyle}>Pickup Address</label>
                <input style={getInputStyle(confirmedData.pickupAddress)} placeholder="Pickup location" value={confirmedData.pickupAddress} onChange={(e) => setConfirmedData(prev => ({ ...prev, pickupAddress: e.target.value }))} />
              </div>
              <div>
                <label style={labelStyle}>Drop-off Address</label>
                <input style={getInputStyle(confirmedData.dropoffAddress)} placeholder="Final drop-off" value={confirmedData.dropoffAddress} onChange={(e) => setConfirmedData(prev => ({ ...prev, dropoffAddress: e.target.value }))} />
              </div>
            </div>
          </div>

          <div style={{ background: '#fff', padding: '14px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px', color: '#374151' }}>Trip Notes</h3>
            <textarea
              style={{ 
                ...inputStyle, 
                minHeight: '120px', 
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
              placeholder="Stops, special requests, venue details, any other notes..."
              value={confirmedData.tripNotes}
              onChange={(e) => setConfirmedData(prev => ({ ...prev, tripNotes: e.target.value }))}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ background: SECTION_STYLES.quotedSummary.bg, padding: '14px', borderRadius: '10px', border: `2px solid ${SECTION_STYLES.quotedSummary.border}` }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px', color: SECTION_STYLES.quotedSummary.title }}>
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
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '6px 8px', background: '#ecfdf5', borderRadius: '4px' }}>
                    <button
                      onClick={() => setQuotedVehicles(prev => prev.filter(qv => qv.id !== v.id))}
                      style={{
                        background: '#dc2626',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '50%',
                        width: '18px',
                        height: '18px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >✕</button>
                    <span style={{ color: '#047857', fontWeight: 500, flex: 1 }}>{v.name}</span>
                    <span style={{ color: '#059669', fontWeight: 600 }}>{v.priceDisplay}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ background: SECTION_STYLES.payment.bg, padding: '14px', borderRadius: '10px', border: `2px solid ${SECTION_STYLES.payment.border}` }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px', color: SECTION_STYLES.payment.title }}>Payment</h3>
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

          <div style={{ background: SECTION_STYLES.leadStatus.bg, padding: '14px', borderRadius: '10px', border: `2px solid ${SECTION_STYLES.leadStatus.border}` }}>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px', color: SECTION_STYLES.leadStatus.title }}>Lead Status</h3>
            <select
              style={inputStyle}
              value={leadStatus}
              onChange={(e) => setLeadStatus(e.target.value as LeadStatus)}
            >
              {LEAD_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <div style={{ marginTop: '10px' }}>
              <label style={labelStyle}>Lead Source</label>
              <select
                style={getInputStyle(confirmedData.leadSource)}
                value={confirmedData.leadSource}
                onChange={(e) => setConfirmedData(prev => ({ ...prev, leadSource: e.target.value }))}
              >
                <option value="">Select source...</option>
                <option value="Brandon Call">Brandon Call</option>
                <option value="Online Form Formspree">Online Form Formspree</option>
                <option value="Chat">Chat</option>
                <option value="Unknown Call">Unknown Call</option>
                <option value="Organic Call">Organic Call</option>
                <option value="Organic Form">Organic Form</option>
                <option value="Bend Form">Bend Form</option>
                <option value="Text">Text</option>
              </select>
            </div>
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
              {zohoLeadUrl && (
                <a 
                  href={zohoLeadUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ 
                    display: 'block', 
                    marginTop: '4px', 
                    color: '#3b82f6', 
                    textDecoration: 'underline',
                    fontWeight: 500,
                  }}
                >
                  View Lead in Zoho →
                </a>
              )}
            </div>
          )}
        </div>

        <div style={{ background: '#1e293b', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
          {/* Prominent City Banner */}
          {confirmedData.cityOrZip && (
            <div style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              flexWrap: 'wrap',
            }}>
              {(() => {
              const isZipSearch = confirmedData.searchedCity?.startsWith('ZIP ');
              const zipNumber = isZipSearch ? confirmedData.searchedCity.replace('ZIP ', '') : '';
              const cityOrZipIsJustZip = isZipSearch && confirmedData.cityOrZip === zipNumber;
              const hasServiceArea = !cityOrZipIsJustZip && confirmedData.cityOrZip;
              
              if (isZipSearch) {
                return (
                  <>
                    <span style={{ fontSize: '11px', color: '#93c5fd', fontWeight: 500 }}>SEARCHED:</span>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: '#bfdbfe', letterSpacing: '0.5px' }}>
                      {confirmedData.searchedCity.toUpperCase()}
                    </span>
                    <span style={{ fontSize: '16px', color: '#93c5fd', fontWeight: 500 }}>→</span>
                    <span style={{ fontSize: '11px', color: '#93c5fd', fontWeight: 500 }}>SHOWING:</span>
                    {hasServiceArea ? (
                      <>
                        <span style={{ fontSize: '22px', fontWeight: 700, color: '#fff', letterSpacing: '0.5px' }}>
                          {(confirmedData.displayCityOrZip || confirmedData.cityOrZip).toUpperCase()}
                        </span>
                        <span style={{ fontSize: '11px', color: '#fcd34d', fontWeight: 500, marginLeft: '4px' }}>RATES</span>
                      </>
                    ) : (
                      <span style={{ fontSize: '18px', fontWeight: 700, color: '#fca5a5', letterSpacing: '0.5px' }}>
                        NO SERVICE AREA
                      </span>
                    )}
                  </>
                );
              } else if (confirmedData.searchedCity && confirmedData.searchedCity.toLowerCase() !== confirmedData.cityOrZip.toLowerCase()) {
                return (
                  <>
                    <span style={{ fontSize: '11px', color: '#93c5fd', fontWeight: 500 }}>SEARCHED:</span>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: '#bfdbfe', letterSpacing: '0.5px' }}>
                      {confirmedData.searchedCity.toUpperCase()}
                    </span>
                    <span style={{ fontSize: '16px', color: '#93c5fd', fontWeight: 500 }}>→</span>
                    <span style={{ fontSize: '11px', color: '#93c5fd', fontWeight: 500 }}>SHOWING:</span>
                    <span style={{ fontSize: '22px', fontWeight: 700, color: '#fff', letterSpacing: '0.5px' }}>
                      {(confirmedData.displayCityOrZip || confirmedData.cityOrZip).toUpperCase()}
                    </span>
                    <span style={{ fontSize: '11px', color: '#fcd34d', fontWeight: 500, marginLeft: '4px' }}>RATES</span>
                  </>
                );
              } else {
                return (
                  <>
                    <span style={{ fontSize: '12px', color: '#93c5fd', fontWeight: 500 }}>SEARCHING:</span>
                    <span style={{ fontSize: '22px', fontWeight: 700, color: '#fff', letterSpacing: '0.5px' }}>
                      {(confirmedData.displayCityOrZip || confirmedData.cityOrZip).toUpperCase()}
                    </span>
                  </>
                );
              }
            })()}
              <span style={{ fontSize: '12px', color: '#93c5fd', marginLeft: 'auto' }}>
                {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} found
              </span>
            </div>
          )}
          
          {!confirmedData.cityOrZip && (
            <div style={{
              background: '#374151',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '12px',
              textAlign: 'center',
            }}>
              <span style={{ fontSize: '14px', color: '#9ca3af' }}>Vehicles will appear here once a city is entered</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
              Vehicle Gallery
              {loadingVehicles && <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: '8px' }}>Searching...</span>}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                onClick={() => {
                  const searchQuery = `${confirmedData.passengers || 20} passenger party bus limo rental ${confirmedData.cityOrZip || ''}`;
                  const alertMsg = `MANAGER ALERT:\n\nCustomer needs:\n- ${confirmedData.passengers || '?'} passengers\n- ${confirmedData.eventType || 'Event'}\n- ${confirmedData.cityOrZip || 'Unknown location'}\n- ${confirmedData.date || 'Date TBD'}\n\nSearch vendors for availability.\n\nSearch query: "${searchQuery}"`;
                  if (confirm(alertMsg + '\n\nOpen web search?')) {
                    window.open(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`, '_blank');
                  }
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#f59e0b',
                  color: '#fff',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="Search web for more vehicles & alert manager"
              >
                Find More Vehicles
              </button>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                {filteredVehicles.length} of {vehicles.length} vehicles
              </div>
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
              onChange={(e) => {
                const newHours = parseInt(e.target.value);
                setRateHours(newHours);
                setConfirmedData(prev => ({ ...prev, hours: String(newHours) }));
              }}
            >
              {/* Dynamically show all available hour options from vehicles */}
              {availableHourOptions.map(h => (
                <option key={h} value={h}>{h} Hour Rate</option>
              ))}
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
                  checked={vehicleFilters.carSuv}
                  onChange={(e) => setVehicleFilters(prev => ({ ...prev, carSuv: e.target.checked }))}
                />
                Car/SUV
              </label>
              {hasTransferVehicles && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', color: vehicleFilters.oneWayTransfer ? '#fbbf24' : '#94a3b8', fontSize: '11px', cursor: 'pointer', fontWeight: vehicleFilters.oneWayTransfer ? 600 : 400 }}>
                  <input 
                    type="checkbox" 
                    checked={vehicleFilters.oneWayTransfer}
                    onChange={(e) => setVehicleFilters(prev => ({ ...prev, oneWayTransfer: e.target.checked }))}
                  />
                  One Way Transfer
                </label>
              )}
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
          ) : (() => {
            // Categorize vehicles - TRUST the Supabase categories field first
            const isPartyBus = (v: typeof filteredVehicles[0]) => {
              const cat = (v.categories || v.category || '').toLowerCase();
              const name = (v.vehicle_title || v.name || '').toLowerCase();
              // If category says party bus, it's a party bus - period
              return cat.includes('party bus') || cat.includes('limo bus') ||
                     name.includes('party bus') || name.includes('limo bus');
            };
            const isLimo = (v: typeof filteredVehicles[0]) => {
              // Party buses are NOT limos, even if they have "limo" in category
              if (isPartyBus(v)) return false;
              const cat = (v.categories || v.category || '').toLowerCase();
              const name = (v.vehicle_title || v.name || '').toLowerCase();
              // Check category first - trust Supabase data
              if (cat.includes('limousine') || (cat.includes('limo') && !cat.includes('shuttle') && !cat.includes('coach'))) {
                return true;
              }
              // Then check name for limo indicators
              return name.includes('limousine') || name.includes('stretch limo') ||
                     name.includes('hummer') || name.includes('escalade') || name.includes('navigator') ||
                     name.includes('chrysler') || name.includes('lincoln') || name.includes('rolls') ||
                     name.includes('bentley') || name.includes('sedan') || name.includes('suv') ||
                     name.includes('towncar') || name.includes('town car') || name.includes('cadillac');
            };
            const isCoach = (v: typeof filteredVehicles[0]) => {
              return !isPartyBus(v) && !isLimo(v);
            };
            
            const partyBuses = filteredVehicles.filter(isPartyBus);
            const limos = filteredVehicles.filter(isLimo);
            const coaches = filteredVehicles.filter(isCoach);
            
            const openPricingModal = (v: typeof filteredVehicles[0]) => {
              setSelectedVehicle(v);
              const hasStd = [3, 4, 5, 6, 7, 8, 9, 10].some(h => v[`price_${h}hr`]);
              const hasProm = [6, 7, 8, 9, 10].some(h => v[`prom_price_${h}hr`]);
              const hasB5 = [3, 4, 5, 6, 7].some(h => v[`before5pm_${h}hr`]);
              const hasAM = [5, 6, 7, 8, 9].some(h => v[`april_may_weekend_${h}hr`]);
              const hasTr = !!v.transfer_price;
              
              let defaultType: 'standard' | 'prom' | 'before5pm' | 'aprilmay' | 'transfer' = 'standard';
              let defaultHours = rateHours;
              
              if (hasStd) {
                defaultType = 'standard';
                const stdHours = [3, 4, 5, 6, 7, 8, 9, 10].filter(h => v[`price_${h}hr`]);
                defaultHours = stdHours.includes(rateHours) ? rateHours : (stdHours[0] || 4);
              } else if (hasProm) {
                defaultType = 'prom';
                const promHours = [6, 7, 8, 9, 10].filter(h => v[`prom_price_${h}hr`]);
                defaultHours = promHours[0] || 6;
              } else if (hasB5) {
                defaultType = 'before5pm';
                const b5Hours = [3, 4, 5, 6, 7].filter(h => v[`before5pm_${h}hr`]);
                defaultHours = b5Hours[0] || 4;
              } else if (hasAM) {
                defaultType = 'aprilmay';
                const amHours = [5, 6, 7, 8, 9].filter(h => v[`april_may_weekend_${h}hr`]);
                defaultHours = amHours[0] || 5;
              } else if (hasTr) {
                defaultType = 'transfer';
                defaultHours = 0;
              }
              
              setModalPriceType(defaultType);
              setModalHours(defaultHours);
            };
            
            const renderVehicleCard = (v: typeof filteredVehicles[0]) => (
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
                      style={{ height: '140px', overflow: 'hidden', cursor: 'pointer' }}
                      onClick={() => openPricingModal(v)}
                    >
                      <img 
                        src={v.image} 
                        alt={v.name}
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'auto' }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  <div style={{ padding: '10px' }}>
                    <div 
                      style={{ fontWeight: 600, color: '#fff', fontSize: '13px', marginBottom: '6px', lineHeight: 1.3, cursor: 'pointer' }}
                      onClick={() => openPricingModal(v)}
                    >
                      {v.name}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '6px' }}>
                      {v.capacity && (
                        <span style={{ background: '#475569', padding: '2px 5px', borderRadius: '3px', fontSize: '9px', color: '#cbd5e1' }}>
                          {v.capacity}
                        </span>
                      )}
                      {[6, 7, 8, 9, 10].some(h => v[`prom_price_${h}hr`]) && (
                        <span style={{ background: '#7c3aed', padding: '2px 5px', borderRadius: '3px', fontSize: '9px', color: '#e9d5ff', fontWeight: 600 }}>
                          PROM
                        </span>
                      )}
                      {[3, 4, 5, 6, 7].some(h => v[`before5pm_${h}hr`]) && (
                        <span style={{ background: '#0891b2', padding: '2px 5px', borderRadius: '3px', fontSize: '9px', color: '#cffafe', fontWeight: 600 }}>
                          &lt;5PM
                        </span>
                      )}
                      {[5, 6, 7, 8, 9].some(h => v[`april_may_weekend_${h}hr`]) && (
                        <span style={{ background: '#ca8a04', padding: '2px 5px', borderRadius: '3px', fontSize: '9px', color: '#fef9c3', fontWeight: 600 }}>
                          APR/MAY
                        </span>
                      )}
                      {v.transfer_price && (
                        <span style={{ background: '#059669', padding: '2px 5px', borderRadius: '3px', fontSize: '9px', color: '#d1fae5', fontWeight: 600 }}>
                          XFER
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#34d399', marginBottom: '6px' }}>
                      {v.priceDisplay}
                    </div>
                    {v.custom_instructions && (
                      <div style={{ 
                        fontSize: '10px', 
                        fontWeight: 700,
                        color: '#fff', 
                        marginBottom: '6px', 
                        padding: '6px 8px', 
                        background: 'linear-gradient(135deg, #dc2626 0%, #ea580c 100%)', 
                        borderRadius: '6px',
                        border: '2px solid #fbbf24',
                        lineHeight: 1.4,
                        animation: 'pulseAlert 1.5s ease-in-out infinite',
                        boxShadow: '0 0 10px rgba(251,191,36,0.5)',
                      }}>
                        <span style={{ marginRight: '4px' }}>⚠️</span>
                        {v.custom_instructions.length > 50 ? v.custom_instructions.substring(0, 50) + '...' : v.custom_instructions}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => {
                          if (!isQuoted(v.id) && (!v.displayPrice || v.displayPrice <= 0)) {
                            alert('This vehicle requires a call for pricing. Please use the $ button to view details.');
                            return;
                          }
                          toggleQuoted(v);
                        }}
                        disabled={!isQuoted(v.id) && (!v.displayPrice || v.displayPrice <= 0)}
                        style={{
                          flex: 1,
                          padding: '8px',
                          borderRadius: '6px',
                          border: 'none',
                          cursor: (!isQuoted(v.id) && (!v.displayPrice || v.displayPrice <= 0)) ? 'not-allowed' : 'pointer',
                          fontSize: '12px',
                          fontWeight: 600,
                          background: isQuoted(v.id) ? '#10b981' : (v.displayPrice && v.displayPrice > 0 ? '#3b82f6' : '#9ca3af'),
                          color: '#fff',
                          opacity: (!isQuoted(v.id) && (!v.displayPrice || v.displayPrice <= 0)) ? 0.6 : 1,
                        }}
                      >
                        {isQuoted(v.id) ? "Quoted" : (v.displayPrice && v.displayPrice > 0 ? "Quote" : "Call")}
                      </button>
                      <button
                        onClick={() => openPricingModal(v)}
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
            );
            
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', alignItems: 'start' }}>
                {/* Party Buses Column */}
                <div>
                  <div style={{ 
                    fontSize: '11px', 
                    fontWeight: 700, 
                    color: '#f472b6', 
                    marginBottom: '6px', 
                    textAlign: 'center',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Party Buses ({partyBuses.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {partyBuses.map(v => renderVehicleCard(v))}
                  </div>
                </div>
                {/* Limos Column */}
                <div>
                  <div style={{ 
                    fontSize: '11px', 
                    fontWeight: 700, 
                    color: '#a78bfa', 
                    marginBottom: '6px', 
                    textAlign: 'center',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Limousines ({limos.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {limos.map(v => renderVehicleCard(v))}
                  </div>
                </div>
                {/* Coach/Shuttle Column */}
                <div>
                  <div style={{ 
                    fontSize: '11px', 
                    fontWeight: 700, 
                    color: '#60a5fa', 
                    marginBottom: '6px', 
                    textAlign: 'center',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Shuttle/Coach ({coaches.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {coaches.map(v => renderVehicleCard(v))}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {selectedVehicle && (() => {
        const allPhotos = [
          selectedVehicle.image,
          selectedVehicle.image_2,
          selectedVehicle.image_3,
          ...(selectedVehicle.gallery_all ? selectedVehicle.gallery_all.split(',').map((u: string) => u.trim()) : [])
        ].filter(Boolean);
        
        const hasStandardPricing = [3, 4, 5, 6, 7, 8, 9, 10].some(h => selectedVehicle[`price_${h}hr`]);
        const hasPromPricing = [6, 7, 8, 9, 10].some(h => selectedVehicle[`prom_price_${h}hr`]);
        const hasBefore5pmPricing = [3, 4, 5, 6, 7].some(h => selectedVehicle[`before5pm_${h}hr`]);
        const hasAprilMayPricing = [5, 6, 7, 8, 9].some(h => selectedVehicle[`april_may_weekend_${h}hr`]);
        const hasTransferPricing = !!selectedVehicle.transfer_price;
        
        const getAvailableHours = (type: string): number[] => {
          switch(type) {
            case 'standard': return [3, 4, 5, 6, 7, 8, 9, 10].filter(h => selectedVehicle[`price_${h}hr`]);
            case 'prom': return [6, 7, 8, 9, 10].filter(h => selectedVehicle[`prom_price_${h}hr`]);
            case 'before5pm': return [3, 4, 5, 6, 7].filter(h => selectedVehicle[`before5pm_${h}hr`]);
            case 'aprilmay': return [5, 6, 7, 8, 9].filter(h => selectedVehicle[`april_may_weekend_${h}hr`]);
            default: return [];
          }
        };
        
        const getModalPrice = (): number => {
          if (modalPriceType === 'transfer') return Number(selectedVehicle.transfer_price) || 0;
          const prefix = modalPriceType === 'standard' ? 'price_' 
            : modalPriceType === 'prom' ? 'prom_price_' 
            : modalPriceType === 'before5pm' ? 'before5pm_' 
            : 'april_may_weekend_';
          const val = selectedVehicle[`${prefix}${modalHours}hr`];
          return Number(val) || 0;
        };
        
        const modalPrice = getModalPrice();
        // Default to 50% deposit. Only use 100% if date is set AND event is within 7 days
        const useFullDeposit = daysUntilEvent !== Infinity && daysUntilEvent <= 7;
        const modalDeposit = useFullDeposit ? modalPrice : Math.round(modalPrice * 0.5);
        const modalBalance = modalPrice - modalDeposit;
        
        const getComparableVehicles = () => {
          const currentCap = parseInt(selectedVehicle.capacity) || 0;
          const currentCategory = (selectedVehicle.categories || selectedVehicle.category || '').toLowerCase();
          
          const pool = vehicles.filter(v => v.id !== selectedVehicle.id);
          const scored = pool.map(v => {
            const cap = parseInt(v.capacity) || 0;
            const cat = (v.categories || v.category || '').toLowerCase();
            const price = getVehiclePrice(v, modalHours);
            
            let score = 0;
            const capDiff = Math.abs(cap - currentCap);
            if (capDiff <= 5) score += 30;
            else if (capDiff <= 10) score += 20;
            else if (capDiff <= 20) score += 10;
            
            if (cat === currentCategory) score += 25;
            else if ((cat.includes('limo') && currentCategory.includes('limo')) ||
                     (cat.includes('bus') && currentCategory.includes('bus'))) score += 15;
            
            const priceDiff = Math.abs(price - modalPrice);
            if (modalPrice > 0 && priceDiff / modalPrice < 0.2) score += 20;
            else if (modalPrice > 0 && priceDiff / modalPrice < 0.4) score += 10;
            
            if (price > 0) score += 5;
            
            return { vehicle: v, score, price };
          });
          
          return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            .map(s => ({ ...s.vehicle, displayPrice: s.price }));
        };
        
        const comparableVehicles = getComparableVehicles();
        
        return (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
          onClick={() => setSelectedVehicle(null)}
        >
          <div 
            style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '1100px',
              width: '95%',
              maxHeight: '90vh',
              overflow: 'auto',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Fixed close button that stays visible when scrolling */}
            <button
              onClick={() => setSelectedVehicle(null)}
              style={{
                position: 'sticky',
                top: 0,
                right: 0,
                float: 'right',
                background: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 700,
                zIndex: 10,
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}
            >
              ✕ Close
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#111827', margin: 0 }}>
                  {selectedVehicle.name}
                </h2>
                <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
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
              </div>
              <button
                onClick={() => setSelectedVehicle(null)}
                style={{
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  cursor: 'pointer',
                  fontSize: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                &#10005;
              </button>
            </div>

            {/* CUSTOM INSTRUCTIONS - ALWAYS FIRST AND PROMINENT */}
            {(selectedVehicle.description || selectedVehicle.custom_instructions) && (
              <div style={{ 
                marginBottom: '20px', 
                padding: '18px', 
                background: 'linear-gradient(135deg, #dc2626 0%, #ea580c 100%)', 
                borderRadius: '14px', 
                border: '4px solid #fbbf24',
                animation: 'pulseAlert 1.5s ease-in-out infinite',
                boxShadow: '0 0 25px rgba(251,191,36,0.7)',
              }}>
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#fff', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  <span style={{ fontSize: '24px' }}>⚠️</span> 
                  READ THIS FIRST - CUSTOM INSTRUCTIONS
                  <span style={{ fontSize: '24px' }}>⚠️</span>
                </div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', lineHeight: 1.7, textAlign: 'center', textShadow: '0 2px 4px rgba(0,0,0,0.4)' }}>
                  {selectedVehicle.custom_instructions || selectedVehicle.description}
                </div>
              </div>
            )}
            
            {allPhotos.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: allPhotos.length === 1 ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                  {allPhotos.slice(0, 4).map((photo, idx) => (
                    <img 
                      key={idx}
                      src={photo} 
                      alt={`${selectedVehicle.name} ${idx + 1}`}
                      loading="lazy"
                      style={{ 
                        width: '100%', 
                        height: '160px', 
                        objectFit: 'cover', 
                        borderRadius: '8px',
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        setPhotoModalVehicle(selectedVehicle);
                        setPhotoModalIndex(idx);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '20px' }}>
              {hasStandardPricing && (
                <div style={{ background: '#f0fdf4', padding: '16px', borderRadius: '10px', border: '2px solid #86efac', marginBottom: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#166534', marginBottom: '10px' }}>STANDARD RATES</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '8px' }}>
                    {[3, 4, 5, 6, 7, 8, 9, 10].map(h => {
                      const price = selectedVehicle[`price_${h}hr`];
                      if (!price) return null;
                      const isSelected = modalPriceType === 'standard' && modalHours === h;
                      return (
                        <button
                          key={h}
                          onClick={() => { setModalPriceType('standard'); setModalHours(h); }}
                          style={{
                            padding: '10px 8px',
                            borderRadius: '8px',
                            border: isSelected ? '3px solid #16a34a' : '1px solid #bbf7d0',
                            background: isSelected ? '#dcfce7' : '#fff',
                            cursor: 'pointer',
                            textAlign: 'center',
                          }}
                        >
                          <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 500 }}>{h} hours</div>
                          <div style={{ fontSize: '16px', fontWeight: 700, color: '#166534' }}>${Number(price).toLocaleString()}</div>
                          <div style={{ fontSize: '10px', color: '#059669' }}>${Math.round(Number(price) / h)}/hr</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {hasPromPricing && (
                <div style={{ background: '#faf5ff', padding: '16px', borderRadius: '10px', border: '2px solid #c4b5fd', marginBottom: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#5b21b6', marginBottom: '10px' }}>PROM RATES</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '8px' }}>
                    {[6, 7, 8, 9, 10].map(h => {
                      const price = selectedVehicle[`prom_price_${h}hr`];
                      if (!price) return null;
                      const isSelected = modalPriceType === 'prom' && modalHours === h;
                      return (
                        <button
                          key={h}
                          onClick={() => { setModalPriceType('prom'); setModalHours(h); }}
                          style={{
                            padding: '10px 8px',
                            borderRadius: '8px',
                            border: isSelected ? '3px solid #7c3aed' : '1px solid #ddd6fe',
                            background: isSelected ? '#ede9fe' : '#fff',
                            cursor: 'pointer',
                            textAlign: 'center',
                          }}
                        >
                          <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 500 }}>{h} hours</div>
                          <div style={{ fontSize: '16px', fontWeight: 700, color: '#5b21b6' }}>${Number(price).toLocaleString()}</div>
                          <div style={{ fontSize: '10px', color: '#7c3aed' }}>${Math.round(Number(price) / h)}/hr</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {hasBefore5pmPricing && (
                <div style={{ background: '#fff7ed', padding: '16px', borderRadius: '10px', border: '2px solid #fdba74', marginBottom: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#9a3412', marginBottom: '10px' }}>BEFORE 5PM RATES (Daytime Discount)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '8px' }}>
                    {[3, 4, 5, 6, 7].map(h => {
                      const price = selectedVehicle[`before5pm_${h}hr`];
                      if (!price) return null;
                      const isSelected = modalPriceType === 'before5pm' && modalHours === h;
                      return (
                        <button
                          key={h}
                          onClick={() => { setModalPriceType('before5pm'); setModalHours(h); }}
                          style={{
                            padding: '10px 8px',
                            borderRadius: '8px',
                            border: isSelected ? '3px solid #ea580c' : '1px solid #fed7aa',
                            background: isSelected ? '#ffedd5' : '#fff',
                            cursor: 'pointer',
                            textAlign: 'center',
                          }}
                        >
                          <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 500 }}>{h} hours</div>
                          <div style={{ fontSize: '16px', fontWeight: 700, color: '#9a3412' }}>${Number(price).toLocaleString()}</div>
                          <div style={{ fontSize: '10px', color: '#ea580c' }}>${Math.round(Number(price) / h)}/hr</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {hasAprilMayPricing && (
                <div style={{ background: '#fdf2f8', padding: '16px', borderRadius: '10px', border: '2px solid #f9a8d4', marginBottom: '12px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#9d174d', marginBottom: '10px' }}>APRIL/MAY WEEKEND RATES</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: '8px' }}>
                    {[5, 6, 7, 8, 9].map(h => {
                      const price = selectedVehicle[`april_may_weekend_${h}hr`];
                      if (!price) return null;
                      const isSelected = modalPriceType === 'aprilmay' && modalHours === h;
                      return (
                        <button
                          key={h}
                          onClick={() => { setModalPriceType('aprilmay'); setModalHours(h); }}
                          style={{
                            padding: '10px 8px',
                            borderRadius: '8px',
                            border: isSelected ? '3px solid #db2777' : '1px solid #fbcfe8',
                            background: isSelected ? '#fce7f3' : '#fff',
                            cursor: 'pointer',
                            textAlign: 'center',
                          }}
                        >
                          <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 500 }}>{h} hours</div>
                          <div style={{ fontSize: '16px', fontWeight: 700, color: '#9d174d' }}>${Number(price).toLocaleString()}</div>
                          <div style={{ fontSize: '10px', color: '#db2777' }}>${Math.round(Number(price) / h)}/hr</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {hasTransferPricing && (
                <div 
                  onClick={() => setModalPriceType('transfer')}
                  style={{ 
                    background: modalPriceType === 'transfer' ? '#fef9c3' : '#fffbeb', 
                    padding: '16px', 
                    borderRadius: '10px', 
                    border: modalPriceType === 'transfer' ? '3px solid #eab308' : '2px solid #fcd34d',
                    cursor: 'pointer',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#854d0e', marginBottom: '6px' }}>ONE WAY TRANSFER</div>
                  <div style={{ fontSize: '24px', fontWeight: 700, color: '#78350f' }}>
                    ${Number(selectedVehicle.transfer_price).toLocaleString()}
                  </div>
                  <div style={{ fontSize: '11px', color: '#a16207' }}>Click to select for quote</div>
                </div>
              )}
              
              {/* Hours adjuster - only show for non-transfer */}
              {modalPriceType !== 'transfer' && (
                <div style={{ background: '#f0f9ff', padding: '16px', borderRadius: '10px', border: '2px solid #0ea5e9', marginTop: '16px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#0369a1', marginBottom: '10px', textAlign: 'center' }}>ADJUST HOURS</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                    <button
                      onClick={() => {
                        const availableHours = modalPriceType === 'standard' 
                          ? [3, 4, 5, 6, 7, 8, 9, 10].filter(h => selectedVehicle[`price_${h}hr`])
                          : modalPriceType === 'prom'
                          ? [6, 7, 8, 9, 10].filter(h => selectedVehicle[`prom_price_${h}hr`])
                          : modalPriceType === 'before5pm'
                          ? [3, 4, 5, 6, 7].filter(h => selectedVehicle[`before5pm_${h}hr`])
                          : [5, 6, 7, 8, 9].filter(h => selectedVehicle[`april_may_weekend_${h}hr`]);
                        const currentIdx = availableHours.indexOf(modalHours);
                        if (currentIdx > 0) setModalHours(availableHours[currentIdx - 1]);
                      }}
                      style={{
                        background: '#0369a1',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        width: '50px',
                        height: '50px',
                        fontSize: '28px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >−</button>
                    <div style={{ textAlign: 'center', minWidth: '100px' }}>
                      <div style={{ fontSize: '42px', fontWeight: 700, color: '#0369a1' }}>{modalHours}</div>
                      <div style={{ fontSize: '14px', color: '#64748b', fontWeight: 600 }}>HOURS</div>
                    </div>
                    <button
                      onClick={() => {
                        const availableHours = modalPriceType === 'standard' 
                          ? [3, 4, 5, 6, 7, 8, 9, 10].filter(h => selectedVehicle[`price_${h}hr`])
                          : modalPriceType === 'prom'
                          ? [6, 7, 8, 9, 10].filter(h => selectedVehicle[`prom_price_${h}hr`])
                          : modalPriceType === 'before5pm'
                          ? [3, 4, 5, 6, 7].filter(h => selectedVehicle[`before5pm_${h}hr`])
                          : [5, 6, 7, 8, 9].filter(h => selectedVehicle[`april_may_weekend_${h}hr`]);
                        const currentIdx = availableHours.indexOf(modalHours);
                        if (currentIdx < availableHours.length - 1) setModalHours(availableHours[currentIdx + 1]);
                      }}
                      style={{
                        background: '#0369a1',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        width: '50px',
                        height: '50px',
                        fontSize: '28px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >+</button>
                  </div>
                </div>
              )}
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                <div style={{ background: '#ecfdf5', padding: '16px', borderRadius: '10px', border: '3px solid #10b981' }}>
                  <div style={{ fontSize: '11px', color: '#10b981', fontWeight: 600, marginBottom: '4px' }}>
                    SELECTED FOR QUOTE: {modalPriceType === 'transfer' ? 'ONE WAY TRANSFER' : `${modalPriceType.toUpperCase()} (${modalHours}HR)`}
                  </div>
                  <div style={{ fontSize: '36px', fontWeight: 700, color: '#111827' }}>
                    {modalPrice > 0 ? `$${modalPrice.toLocaleString()}` : 'Select a price above'}
                  </div>
                  {modalPriceType !== 'transfer' && modalPrice > 0 && (
                    <div style={{ fontSize: '14px', color: '#059669', marginTop: '4px', fontWeight: 600 }}>
                      ${Math.round(modalPrice / modalHours).toLocaleString()}/hour
                    </div>
                  )}
                </div>
                
                <div style={{ background: '#fef3c7', padding: '16px', borderRadius: '10px', border: '2px solid #f59e0b' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#92400e', marginBottom: '8px' }}>PAYMENT BREAKDOWN</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #fcd34d' }}>
                    <span style={{ color: '#78350f', fontSize: '14px', fontWeight: 600 }}>Deposit {useFullDeposit ? '(100%)' : '(50%)'}</span>
                    <span style={{ fontWeight: 700, color: '#b45309', fontSize: '20px' }}>
                      {modalPrice > 0 ? `$${modalDeposit.toLocaleString()}` : '---'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                    <span style={{ color: '#78350f', fontSize: '14px' }}>Balance Due</span>
                    <span style={{ fontWeight: 600, color: '#92400e', fontSize: '16px' }}>
                      {modalPrice > 0 ? `$${modalBalance.toLocaleString()}` : '---'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{ marginBottom: '16px', padding: '14px', background: '#f0f9ff', borderRadius: '10px', border: '2px solid #7dd3fc' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0369a1', marginBottom: '10px' }}>VEHICLE DETAILS FOR AGENT</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', fontSize: '14px' }}>
                <div><span style={{ color: '#64748b' }}>Capacity:</span> <strong style={{ color: '#0369a1' }}>{selectedVehicle.capacity || 'N/A'} passengers</strong></div>
                <div><span style={{ color: '#64748b' }}>Category:</span> <strong style={{ color: '#0369a1' }}>{selectedVehicle.category || 'N/A'}</strong></div>
                <div><span style={{ color: '#64748b' }}>City:</span> <strong style={{ color: '#0369a1' }}>{selectedVehicle.city || 'N/A'}</strong></div>
                {selectedVehicle.tags && <div><span style={{ color: '#64748b' }}>Features:</span> <strong style={{ color: '#0369a1' }}>{selectedVehicle.tags}</strong></div>}
              </div>
              {selectedVehicle.short_description && (
                <div style={{ marginTop: '10px', padding: '10px', background: '#e0f2fe', borderRadius: '6px', fontSize: '13px', color: '#0c4a6e', lineHeight: 1.5 }}>
                  <strong>Description:</strong> {selectedVehicle.short_description}
                </div>
              )}
            </div>

            {comparableVehicles.length > 0 && (
              <div style={{ marginBottom: '16px', padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '12px' }}>Similar Options for This Customer</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  {comparableVehicles.map((cv: any) => (
                    <div 
                      key={cv.id}
                      onClick={() => {
                        const hasStd = [3, 4, 5, 6, 7, 8, 9, 10].some(h => cv[`price_${h}hr`]);
                        const hasProm = [6, 7, 8, 9, 10].some(h => cv[`prom_price_${h}hr`]);
                        const hasB5 = [3, 4, 5, 6, 7].some(h => cv[`before5pm_${h}hr`]);
                        const hasAM = [5, 6, 7, 8, 9].some(h => cv[`april_may_weekend_${h}hr`]);
                        const hasTr = !!cv.transfer_price;
                        
                        let defType: 'standard' | 'prom' | 'before5pm' | 'aprilmay' | 'transfer' = 'standard';
                        let defHours = 4;
                        
                        if (hasStd) {
                          defType = 'standard';
                          const hrs = [3, 4, 5, 6, 7, 8, 9, 10].filter(h => cv[`price_${h}hr`]);
                          defHours = hrs[0] || 4;
                        } else if (hasProm) {
                          defType = 'prom';
                          const hrs = [6, 7, 8, 9, 10].filter(h => cv[`prom_price_${h}hr`]);
                          defHours = hrs[0] || 6;
                        } else if (hasB5) {
                          defType = 'before5pm';
                          const hrs = [3, 4, 5, 6, 7].filter(h => cv[`before5pm_${h}hr`]);
                          defHours = hrs[0] || 4;
                        } else if (hasAM) {
                          defType = 'aprilmay';
                          const hrs = [5, 6, 7, 8, 9].filter(h => cv[`april_may_weekend_${h}hr`]);
                          defHours = hrs[0] || 5;
                        } else if (hasTr) {
                          defType = 'transfer';
                          defHours = 0;
                        }
                        
                        setSelectedVehicle(cv);
                        setModalPriceType(defType);
                        setModalHours(defHours);
                      }}
                      style={{ 
                        background: '#fff', 
                        borderRadius: '10px', 
                        padding: '12px',
                        cursor: 'pointer',
                        border: '2px solid #e2e8f0',
                        transition: 'all 0.15s',
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.borderColor = '#3b82f6')}
                      onMouseOut={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
                    >
                      {cv.image && (
                        <img 
                          src={cv.image} 
                          alt={cv.name}
                          style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '6px', marginBottom: '8px' }}
                        />
                      )}
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', lineHeight: 1.3, marginBottom: '6px' }}>
                        {cv.name?.substring(0, 35)}{cv.name?.length > 35 ? '...' : ''}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>{cv.capacity} pass</span>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#059669' }}>
                          {cv.displayPrice > 0 ? `$${cv.displayPrice.toLocaleString()}` : 'Call'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => {
                if (modalPrice <= 0 && !isQuoted(selectedVehicle.id)) {
                  alert('This vehicle requires a call for pricing. Please contact management for a custom quote.');
                  return;
                }
                const vehicleWithModalPrice = {
                  ...selectedVehicle,
                  displayPrice: modalPrice,
                  priceDisplay: modalPrice > 0 ? `$${modalPrice.toLocaleString()}` : 'Call for price',
                  displayHours: modalPriceType === 'transfer' ? 'transfer' : modalHours,
                  priceType: modalPriceType,
                };
                toggleQuoted(vehicleWithModalPrice);
                setSelectedVehicle(null);
              }}
              disabled={modalPrice <= 0 && !isQuoted(selectedVehicle.id)}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '8px',
                border: 'none',
                cursor: modalPrice <= 0 && !isQuoted(selectedVehicle.id) ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                background: isQuoted(selectedVehicle.id) ? '#dc2626' : (modalPrice > 0 ? '#10b981' : '#9ca3af'),
                color: '#fff',
                opacity: modalPrice <= 0 && !isQuoted(selectedVehicle.id) ? 0.6 : 1,
              }}
            >
              {isQuoted(selectedVehicle.id) ? "Remove from Quote" : (modalPrice > 0 ? `Add to Quote - $${modalPrice.toLocaleString()}` : "Call for Price - Cannot Quote")}
            </button>
          </div>
        </div>
        );
      })()}

      {photoModalVehicle && (() => {
        const photos = [photoModalVehicle.image, photoModalVehicle.image_2, photoModalVehicle.image_3, photoModalVehicle.image_4].filter(Boolean);
        const currentIndex = Math.min(photoModalIndex, photos.length - 1);
        const pricingTiers = [
          { label: 'Standard', hours: [3, 4, 5, 6, 7, 8, 9, 10], prefix: 'price_' },
          { label: 'Prom', hours: [6, 7, 8, 9, 10], prefix: 'prom_price_' },
          { label: 'Before 5PM', hours: [3, 4, 5, 6, 7], prefix: 'before5pm_' },
          { label: 'After 5PM', hours: [3, 4, 5, 6, 7, 8], prefix: 'after5pm_' },
        ];
        const depositPercent = daysUntilEvent <= 7 ? 100 : 50;
        const customInstructions = photoModalVehicle.custom_instructions || photoModalVehicle.instructions || '';
        
        const findSimilarVehicle = (type: 'affordable' | 'premium' | 'larger' | 'smaller') => {
          let pool = [...filteredVehicles].filter(v => v.id !== photoModalVehicle.id);
          if (pool.length === 0) {
            pool = [...vehicles].filter(v => v.id !== photoModalVehicle.id);
          }
          const currentPrice = photoModalVehicle[`price_${rateHours}hr`] || photoModalVehicle.price || 0;
          const currentCap = photoModalVehicle.capacity || 0;
          
          if (type === 'affordable') {
            return pool.filter(v => (v[`price_${rateHours}hr`] || v.price || 0) < currentPrice)
              .sort((a, b) => (b[`price_${rateHours}hr`] || b.price || 0) - (a[`price_${rateHours}hr`] || a.price || 0))[0];
          } else if (type === 'premium') {
            return pool.filter(v => (v[`price_${rateHours}hr`] || v.price || 0) > currentPrice)
              .sort((a, b) => (a[`price_${rateHours}hr`] || a.price || 0) - (b[`price_${rateHours}hr`] || b.price || 0))[0];
          } else if (type === 'larger') {
            return pool.filter(v => (v.capacity || 0) > currentCap)
              .sort((a, b) => (a.capacity || 0) - (b.capacity || 0))[0];
          } else {
            return pool.filter(v => (v.capacity || 0) < currentCap)
              .sort((a, b) => (b.capacity || 0) - (a.capacity || 0))[0];
          }
        };
        
        return (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
            padding: '20px',
          }}
          onClick={() => { setPhotoModalVehicle(null); setPhotoModalIndex(0); }}
        >
          <div 
            style={{
              width: '100%',
              maxWidth: '900px',
              maxHeight: '90vh',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              background: '#1e293b',
              borderRadius: '16px',
              padding: '20px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#fff', margin: 0 }}>
                {photoModalVehicle.name}
                {photoModalVehicle.capacity && <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: '8px' }}>({photoModalVehicle.capacity} pax)</span>}
              </h2>
              <button
                onClick={() => { setPhotoModalVehicle(null); setPhotoModalIndex(0); }}
                style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', fontSize: '18px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >&#10005;</button>
            </div>

            {/* CUSTOM INSTRUCTIONS - FIRST AND PROMINENT */}
            {customInstructions && (
              <div style={{ 
                background: 'linear-gradient(135deg, #dc2626 0%, #ea580c 100%)', 
                border: '4px solid #fbbf24', 
                borderRadius: '14px', 
                padding: '16px', 
                marginBottom: '16px', 
                animation: 'pulseAlert 1.5s ease-in-out infinite',
                boxShadow: '0 0 25px rgba(251,191,36,0.7)',
              }}>
                <div style={{ fontSize: '14px', fontWeight: 900, color: '#fff', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '20px' }}>⚠️</span> 
                  READ THIS - CUSTOM INSTRUCTIONS
                  <span style={{ fontSize: '20px' }}>⚠️</span>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', lineHeight: 1.6, textAlign: 'center', textShadow: '0 2px 4px rgba(0,0,0,0.4)' }}>{customInstructions}</div>
              </div>
            )}
            
            {photos.length > 0 && (
              <div style={{ position: 'relative', marginBottom: '16px' }}>
                <img 
                  src={photos[currentIndex]} 
                  alt={photoModalVehicle.name}
                  style={{ width: '100%', height: '450px', objectFit: 'cover', borderRadius: '12px' }}
                  onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%23334155" width="100" height="100"/></svg>'; }}
                />
                {photos.length > 1 && (
                  <>
                    <button onClick={() => setPhotoModalIndex((currentIndex - 1 + photos.length) % photos.length)} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', color: '#fff', fontSize: '20px', cursor: 'pointer' }}>&lt;</button>
                    <button onClick={() => setPhotoModalIndex((currentIndex + 1) % photos.length)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.7)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', color: '#fff', fontSize: '20px', cursor: 'pointer' }}>&gt;</button>
                    <div style={{ position: 'absolute', bottom: '10px', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '6px' }}>
                      {photos.map((_, i) => (
                        <button key={i} onClick={() => setPhotoModalIndex(i)} style={{ width: '10px', height: '10px', borderRadius: '50%', border: 'none', background: i === currentIndex ? '#fff' : 'rgba(255,255,255,0.4)', cursor: 'pointer' }} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              {pricingTiers.map(tier => {
                const prices = tier.hours.map(h => {
                  const key = `${tier.prefix}${h}hr`;
                  const price = photoModalVehicle[key];
                  return price ? { hours: h, price } : null;
                }).filter(Boolean);
                if (prices.length === 0) return null;
                return (
                  <div key={tier.label} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' }}>{tier.label}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {prices.map((p: any) => (
                        <span key={p.hours} style={{ background: p.hours === rateHours ? '#10b981' : 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', color: '#fff' }}>
                          {p.hours}hr: ${p.price.toLocaleString()}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <div style={{ flex: 1, minWidth: '150px', background: depositPercent === 100 ? 'rgba(220,38,38,0.2)' : 'rgba(234,179,8,0.2)', borderRadius: '10px', padding: '12px', border: `1px solid ${depositPercent === 100 ? '#dc2626' : '#eab308'}` }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: depositPercent === 100 ? '#fca5a5' : '#fde047', textTransform: 'uppercase' }}>Deposit Required</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: '#fff' }}>{depositPercent}%</div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{depositPercent === 100 ? 'Within 7 days' : 'More than 7 days out'}</div>
              </div>
              {photoModalVehicle.category && (
                <div style={{ flex: 1, minWidth: '150px', background: 'rgba(99,102,241,0.2)', borderRadius: '10px', padding: '12px', border: '1px solid #6366f1' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#a5b4fc', textTransform: 'uppercase' }}>Category</div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: '#fff' }}>{photoModalVehicle.category}</div>
                </div>
              )}
            </div>
            
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {[
                { label: 'More Affordable', type: 'affordable' as const, icon: '💰' },
                { label: 'More Premium', type: 'premium' as const, icon: '✨' },
                { label: 'Smaller', type: 'smaller' as const, icon: '⬇️' },
                { label: 'Larger', type: 'larger' as const, icon: '⬆️' },
              ].map(btn => {
                const similar = findSimilarVehicle(btn.type);
                return (
                  <button
                    key={btn.type}
                    onClick={() => { if (similar) { setPhotoModalVehicle(similar); setPhotoModalIndex(0); } }}
                    disabled={!similar}
                    style={{
                      flex: 1,
                      minWidth: '100px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: similar ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
                      color: similar ? '#fff' : '#64748b',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: similar ? 'pointer' : 'not-allowed',
                    }}
                  >
                    {btn.icon} {btn.label}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => { toggleQuoted(photoModalVehicle); }}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: 600,
                background: isQuoted(photoModalVehicle.id) ? '#dc2626' : '#10b981',
                color: '#fff',
              }}
            >
              {isQuoted(photoModalVehicle.id) ? "Remove from Quote" : "Quote This Vehicle"}
            </button>
          </div>
        </div>
        );
      })()}

      {zohoUpdateConfirmation?.show && (
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
            zIndex: 10000,
          }}
          onClick={() => cancelZohoUpdate()}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '600px',
              width: '95%',
              maxHeight: '85vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: '#1f2937' }}>
              Existing Customer Found
            </h2>
            <p style={{ fontSize: '14px', color: '#6b7280', marginBottom: '12px' }}>
              This phone/email matches an existing lead. Select which fields to update:
            </p>
            
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button
                onClick={selectAllFields}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #3b82f6',
                  background: '#eff6ff',
                  color: '#1d4ed8',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Select All
              </button>
              <button
                onClick={deselectAllFields}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  background: '#f9fafb',
                  color: '#6b7280',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Deselect All
              </button>
            </div>
            
            <div style={{ 
              background: '#f9fafb', 
              border: '1px solid #e5e7eb', 
              borderRadius: '8px', 
              marginBottom: '16px',
              overflow: 'hidden',
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '40px 140px 1fr 30px 1fr',
                padding: '10px 12px',
                background: '#f3f4f6',
                borderBottom: '1px solid #e5e7eb',
                fontSize: '11px',
                fontWeight: 600,
                color: '#6b7280',
                textTransform: 'uppercase',
              }}>
                <span></span>
                <span>Field</span>
                <span>Current Value</span>
                <span></span>
                <span>New Value</span>
              </div>
              
              {zohoUpdateConfirmation.changes.map((change, idx) => {
                const isSelected = selectedFieldsToUpdate.has(change.fieldKey);
                return (
                  <div 
                    key={idx} 
                    onClick={() => toggleFieldSelection(change.fieldKey)}
                    style={{ 
                      display: 'grid',
                      gridTemplateColumns: '40px 140px 1fr 30px 1fr',
                      padding: '12px',
                      borderBottom: idx < zohoUpdateConfirmation.changes.length - 1 ? '1px solid #e5e7eb' : 'none',
                      background: isSelected ? '#f0fdf4' : '#fff',
                      cursor: 'pointer',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <input 
                        type="checkbox" 
                        checked={isSelected}
                        onChange={() => toggleFieldSelection(change.fieldKey)}
                        onClick={(e) => e.stopPropagation()}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                      {change.field}
                    </div>
                    <div style={{ 
                      fontSize: '13px', 
                      color: '#dc2626', 
                      textDecoration: isSelected ? 'line-through' : 'none',
                      opacity: isSelected ? 0.6 : 1,
                      wordBreak: 'break-word',
                    }}>
                      {change.oldValue}
                    </div>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      color: isSelected ? '#22c55e' : '#d1d5db',
                      fontSize: '16px',
                    }}>
                      →
                    </div>
                    <div style={{ 
                      fontSize: '13px', 
                      color: isSelected ? '#16a34a' : '#9ca3af',
                      fontWeight: isSelected ? 500 : 400,
                      wordBreak: 'break-word',
                    }}>
                      {change.newValue}
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div style={{ 
              fontSize: '13px', 
              color: '#6b7280', 
              marginBottom: '16px',
              padding: '10px',
              background: '#f0f9ff',
              borderRadius: '6px',
              border: '1px solid #bae6fd',
            }}>
              <strong>{selectedFieldsToUpdate.size}</strong> of {zohoUpdateConfirmation.changes.length} fields selected for update
            </div>
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => cancelZohoUpdate()}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  color: '#374151',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => confirmZohoUpdate()}
                disabled={saving || selectedFieldsToUpdate.size === 0}
                style={{
                  flex: 1,
                  padding: '12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: selectedFieldsToUpdate.size > 0 ? '#10b981' : '#9ca3af',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: saving || selectedFieldsToUpdate.size === 0 ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Updating...' : `Update ${selectedFieldsToUpdate.size} Field${selectedFieldsToUpdate.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
