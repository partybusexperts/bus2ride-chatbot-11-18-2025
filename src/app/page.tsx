'use client';

import Image from 'next/image';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import CallPad from './components/CallPad';

type Vehicle = {
  id: string;
  vehicle_title: string;
  short_description?: string | null;
  capacity?: number | null;
  city?: string | null;
  zips_raw?: string | null;
  categories?: string | null;
  category_slugs?: string | null;
  tags?: string | null;
  tag_slugs?: string | null;
  custom_instructions?: string | null;
  price_3hr?: number | null;
  price_4hr?: number | null;
  price_5hr?: number | null;
  price_6hr?: number | null;
  price_7hr?: number | null;
  price_8hr?: number | null;
  price_9hr?: number | null;
  price_10hr?: number | null;
  prom_price_6hr?: number | null;
  prom_price_7hr?: number | null;
  prom_price_8hr?: number | null;
  prom_price_9hr?: number | null;
  prom_price_10hr?: number | null;
  before5pm_3hr?: number | null;
  before5pm_4hr?: number | null;
  before5pm_5hr?: number | null;
  before5pm_6hr?: number | null;
  before5pm_7hr?: number | null;
  april_may_weekend_5hr?: number | null;
  april_may_weekend_6hr?: number | null;
  april_may_weekend_7hr?: number | null;
  april_may_weekend_8hr?: number | null;
  april_may_weekend_9hr?: number | null;
  transfer_price?: number | null;
  image_main?: string | null;
  image_2?: string | null;
  image_3?: string | null;
  gallery_all?: string | null;
  is_transfer?: boolean | null;
  active?: boolean | null;
};

type VehicleType = 'party-bus' | 'limo' | 'shuttle' | 'car' | 'transfer';
type RateType = 'standard' | 'prom' | 'before5pm' | 'phillyWeekend';
type PriceOption = { hours: number; price: number };
type VehicleMeta = {
  images: string[];
  rateOptions: Record<RateType, PriceOption[]>;
  availableRateTypes: RateType[];
  transferPrice: number | null;
};

const PRICE_FIELDS: Array<{ hours: number; key: keyof Vehicle }> = [
  { hours: 3, key: 'price_3hr' },
  { hours: 4, key: 'price_4hr' },
  { hours: 5, key: 'price_5hr' },
  { hours: 6, key: 'price_6hr' },
  { hours: 7, key: 'price_7hr' },
  { hours: 8, key: 'price_8hr' },
  { hours: 9, key: 'price_9hr' },
  { hours: 10, key: 'price_10hr' },
];

const PROM_FIELDS: Array<{ hours: number; key: keyof Vehicle }> = [
  { hours: 6, key: 'prom_price_6hr' },
  { hours: 7, key: 'prom_price_7hr' },
  { hours: 8, key: 'prom_price_8hr' },
  { hours: 9, key: 'prom_price_9hr' },
  { hours: 10, key: 'prom_price_10hr' },
];

const BEFORE5PM_FIELDS: Array<{ hours: number; key: keyof Vehicle }> = [
  { hours: 3, key: 'before5pm_3hr' },
  { hours: 4, key: 'before5pm_4hr' },
  { hours: 5, key: 'before5pm_5hr' },
  { hours: 6, key: 'before5pm_6hr' },
  { hours: 7, key: 'before5pm_7hr' },
];

const APRIL_MAY_WEEKEND_FIELDS: Array<{ hours: number; key: keyof Vehicle }> = [
  { hours: 5, key: 'april_may_weekend_5hr' },
  { hours: 6, key: 'april_may_weekend_6hr' },
  { hours: 7, key: 'april_may_weekend_7hr' },
  { hours: 8, key: 'april_may_weekend_8hr' },
  { hours: 9, key: 'april_may_weekend_9hr' },
];

const RATE_TYPE_FIELDS: Record<RateType, Array<{ hours: number; key: keyof Vehicle }>> = {
  standard: PRICE_FIELDS,
  prom: PROM_FIELDS,
  before5pm: BEFORE5PM_FIELDS,
  phillyWeekend: APRIL_MAY_WEEKEND_FIELDS,
};

const RATE_TYPE_LABELS: Record<RateType, string> = {
  standard: 'Standard',
  prom: 'Prom',
  before5pm: 'Before 5 PM',
  phillyWeekend: 'Apr/May Weekend',
};

const BEFORE5PM_CITIES = ['grand rapids', 'kalamazoo', 'battle creek'];

const CATEGORY_KEYWORDS: Record<VehicleType, RegExp[]> = {
  'party-bus': [/party/, /party ?bus/, /motorcoach/, /coach bus/],
  limo: [/limo/, /limousine/, /stretch/, /hummer/],
  shuttle: [/shuttle/, /mini ?bus/, /minibus/, /sprinter/, /coach/, /passenger van/],
  car: [/sedan/, /suv/, /suburban/, /escalade/, /town ?car/, /chauffeur/, /black car/, /tesla/],
  transfer: [],
};

const CATEGORY_PRIORITY: VehicleType[] = ['shuttle', 'party-bus', 'limo', 'car'];

function getCategoryTokens(v: Vehicle): string[] {
  return [v.category_slugs, v.categories, v.tag_slugs, v.tags]
    .filter(Boolean)
    .flatMap((value) =>
      String(value)
        .split(/[,/|]/)
        .map((token) => token.trim().toLowerCase())
        .filter(Boolean),
    );
}

function matchTypeFromTokens(tokens: string[]): VehicleType | null {
  for (const type of CATEGORY_PRIORITY) {
    const patterns = CATEGORY_KEYWORDS[type];
    if (!patterns.length) continue;
    if (tokens.some((token) => patterns.some((pattern) => pattern.test(token)))) {
      return type;
    }
  }
  return null;
}

function getVehicleType(v: Vehicle): VehicleType {
  const tokens = getCategoryTokens(v);
  const hasPartyBusToken = tokens.some((token) => /party ?bus|partybus/.test(token));
  const hasLimoToken = tokens.some((token) => /limo|limousine/.test(token));
  const hasSprinterToken = tokens.some((token) => /sprinter/.test(token));
  const hasLimoSprinterToken = tokens.some((token) => /limo[-\s]*sprinter|sprinter[-\s]*limo/.test(token));

  if (hasPartyBusToken || hasLimoSprinterToken || (hasLimoToken && hasSprinterToken)) {
    return 'party-bus';
  }

  const tokenMatch = matchTypeFromTokens(tokens);
  if (tokenMatch) return tokenMatch;

  const haystack = [
    v.vehicle_title,
    v.categories,
    v.category_slugs,
    v.tags,
    v.tag_slugs,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (haystack.match(/party ?bus|partybus|limo ?sprinter|sprinter ?limo/)) return 'party-bus';
  if (haystack.match(/shuttle|mini ?bus|sprinter|coach/)) return 'shuttle';
  if (haystack.match(/limo|limousine|stretch/)) return 'limo';

  if (
    haystack.match(/sedan|suv|suburban|escalade|town ?car|chauffeur|black car/) ||
    (typeof v.capacity === 'number' && v.capacity <= 14)
  ) {
    return 'car';
  }

  return 'car';
}

function getPriceOptions(v: Vehicle, rateType: RateType) {
  const fields = RATE_TYPE_FIELDS[rateType];

  return fields.reduce<Array<PriceOption>>((acc, { hours, key }) => {
    const value = v[key];
    if (typeof value === 'number' && !Number.isNaN(value)) {
      acc.push({ hours, price: value });
    }
    return acc;
  }, []);
}

function getImages(v: Vehicle): string[] {
  const parts: string[] = [];

  if (v.image_main) parts.push(v.image_main);
  if (v.image_2) parts.push(v.image_2);
  if (v.image_3) parts.push(v.image_3);

  return Array.from(new Set(parts));
}

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [visibleCategories, setVisibleCategories] = useState({
    partyBuses: true,
    limos: true,
    shuttles: true,
    cars: false,
    transfers: false,
  });
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [photoViewer, setPhotoViewer] = useState<{
    title: string;
    images: string[];
    index: number;
  } | null>(null);
  const [selectedHours, setSelectedHours] = useState<Record<string, number | null>>({});
  const [selectedRateTypes, setSelectedRateTypes] = useState<Record<string, RateType>>({});
  const [globalRateType, setGlobalRateType] = useState<RateType | null>(null);
  const [pricingPreviewId, setPricingPreviewId] = useState<string | null>(null);
  const [expandedRateBuckets, setExpandedRateBuckets] = useState<Record<string, boolean>>({});
  const [showCallPad, setShowCallPad] = useState(true);

  const before5pmEligible = useMemo(() => {
    if (!vehicles.length) return false;
    return vehicles.some((v) => {
      const city = (v.city ?? '').toLowerCase();
      return BEFORE5PM_CITIES.some((allowed) => city.includes(allowed));
    });
  }, [vehicles]);

  useEffect(() => {
    if (globalRateType === 'before5pm' && !before5pmEligible) {
      setGlobalRateType(null);
    }
  }, [before5pmEligible, globalRateType]);

  useEffect(() => {
    if (pricingPreviewId && !vehicles.some((vehicle) => vehicle.id === pricingPreviewId)) {
      setPricingPreviewId(null);
    }
  }, [pricingPreviewId, vehicles]);

  useEffect(() => {
    if (!pricingPreviewId) return;
    const handleScroll = () => setPricingPreviewId(null);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [pricingPreviewId]);

  useEffect(() => {
    setExpandedRateBuckets({});
    if (!pricingPreviewId) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const inTrigger = target.closest(`[data-pricing-trigger="${pricingPreviewId}"]`);
      const inPopover = target.closest(`[data-pricing-popover="${pricingPreviewId}"]`);
      if (!inTrigger && !inPopover) {
        setPricingPreviewId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [pricingPreviewId]);

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setVehicles([]);
    if (!query.trim()) {
      setError('Please enter a ZIP or city.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/vehicles?q=${encodeURIComponent(query)}`);
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }
      const data: { vehicles?: Vehicle[] } = await res.json();
      const fetchedVehicles = data.vehicles ?? [];
      setVehicles(fetchedVehicles);
      if (!fetchedVehicles.length) {
        setError('No vehicles found for that area.');
      }
    } catch (err) {
      console.error(err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const sortByCapacity = useCallback((list: Vehicle[]) => {
    return [...list].sort((a, b) => {
      const fallback = sortOrder === 'desc' ? -1 : Number.MAX_SAFE_INTEGER;
      const capA = typeof a.capacity === 'number' ? a.capacity : fallback;
      const capB = typeof b.capacity === 'number' ? b.capacity : fallback;
      if (sortOrder === 'desc') {
        return capB - capA;
      }
      return capA - capB;
    });
  }, [sortOrder]);

  const vehicleMeta = useMemo(() => {
    const meta: Record<string, VehicleMeta> = {};
    for (const v of vehicles) {
      const isPhiladelphiaVehicle = (v.city ?? '').toLowerCase().includes('philadelphia');
      const rateOptions: Record<RateType, PriceOption[]> = {
        standard: getPriceOptions(v, 'standard'),
        prom: getPriceOptions(v, 'prom'),
        before5pm: getPriceOptions(v, 'before5pm'),
        phillyWeekend: isPhiladelphiaVehicle ? getPriceOptions(v, 'phillyWeekend') : [],
      };
      const availableRateTypes = (Object.keys(rateOptions) as RateType[]).filter((rate) => {
        if (rate === 'before5pm' && !before5pmEligible) return false;
        if (rate === 'phillyWeekend' && !isPhiladelphiaVehicle) return false;
        return rateOptions[rate].length > 0;
      });
      const transferPrice =
        typeof v.transfer_price === 'number' && !Number.isNaN(v.transfer_price)
          ? v.transfer_price
          : null;

      meta[v.id] = {
        images: getImages(v),
        rateOptions,
        availableRateTypes,
        transferPrice,
      };
    }
    return meta;
  }, [vehicles, before5pmEligible]);

  const { partyBuses, limos, shuttles, cars, transfers } = useMemo(() => {
    const partyBuses: Vehicle[] = [];
    const limos: Vehicle[] = [];
    const shuttles: Vehicle[] = [];
    const cars: Vehicle[] = [];
    const transfers: Vehicle[] = [];

    for (const v of vehicles) {
      const type = getVehicleType(v);
      if (type === 'party-bus') partyBuses.push(v);
      else if (type === 'limo') limos.push(v);
      else if (type === 'shuttle') shuttles.push(v);
      else cars.push(v);

      if (v.is_transfer) {
        transfers.push(v);
      }
    }

    return {
      partyBuses: sortByCapacity(partyBuses),
      limos: sortByCapacity(limos),
      shuttles: sortByCapacity(shuttles),
      cars: sortByCapacity(cars),
      transfers: sortByCapacity(transfers),
    };
  }, [vehicles, sortByCapacity]);

  const hasStandardRates = useMemo(
    () => Object.values(vehicleMeta).some((meta) => meta.rateOptions.standard.length > 0),
    [vehicleMeta],
  );
  const hasPromRates = useMemo(
    () => Object.values(vehicleMeta).some((meta) => meta.rateOptions.prom.length > 0),
    [vehicleMeta],
  );
  const hasBefore5pmRates = useMemo(
    () => Object.values(vehicleMeta).some((meta) => meta.rateOptions.before5pm.length > 0),
    [vehicleMeta],
  );
  const hasTransferPricing = useMemo(
    () => vehicles.some((v) => typeof v.transfer_price === 'number' && !Number.isNaN(v.transfer_price)),
    [vehicles],
  );

  const hasPhillyWeekendRates = useMemo(
    () => Object.values(vehicleMeta).some((meta) => meta.rateOptions.phillyWeekend.length > 0),
    [vehicleMeta],
  );

  useEffect(() => {
    if (globalRateType === 'before5pm' && (!before5pmEligible || !hasBefore5pmRates)) {
      setGlobalRateType(null);
    } else if (globalRateType === 'phillyWeekend' && !hasPhillyWeekendRates) {
      setGlobalRateType(null);
    } else if (globalRateType === 'prom' && !hasPromRates) {
      setGlobalRateType(null);
    } else if (globalRateType === 'standard' && !hasStandardRates) {
      setGlobalRateType(null);
    }
  }, [globalRateType, before5pmEligible, hasBefore5pmRates, hasPromRates, hasStandardRates, hasPhillyWeekendRates]);

  useEffect(() => {
    if (!hasTransferPricing && visibleCategories.transfers) {
      setVisibleCategories((prev) => ({ ...prev, transfers: false }));
    }
  }, [hasTransferPricing, visibleCategories.transfers]);

  const columnContainerStyle: CSSProperties = {
    background: 'rgba(255,255,255,0.96)',
    borderRadius: 24,
    padding: '18px 20px',
    boxShadow: '0 25px 50px rgba(15,23,42,0.15)',
    border: '1px solid rgba(15,23,42,0.08)',
    minHeight: 220,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  };

  const columnStyle = {
    borderRadius: 16,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 16,
    maxHeight: '62vh',
    overflowY: 'auto' as const,
    paddingRight: 6,
    flex: 1,
  };

  const instructionBlockStyle: CSSProperties = {
    marginTop: 10,
    padding: '10px 12px',
    borderRadius: 12,
    border: '1px solid rgba(249,115,22,0.6)',
    background: 'rgba(249,115,22,0.12)',
    color: '#7c2d12',
    fontSize: 13,
    fontWeight: 600,
    animation: 'instructionPulse 2.4s ease-in-out infinite',
  };

  const instructionListStyle: CSSProperties = {
    margin: '6px 0 0',
    paddingLeft: 18,
    fontSize: 13,
    fontWeight: 500,
    lineHeight: 1.4,
  };

  const photoNavButtonStyle: CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    border: 'none',
    background: 'rgba(15,23,42,0.9)',
    color: 'white',
    borderRadius: 999,
    width: 44,
    height: 44,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 12px 24px rgba(15,23,42,0.35)',
  };

  const cardStyle: CSSProperties = {
    border: '1px solid rgba(15,23,42,0.08)',
    borderRadius: 16,
    padding: 16,
    background: 'linear-gradient(145deg, #ffffff, #f8fafc)',
    boxShadow: '0 25px 45px rgba(15,23,42,0.08)',
    fontSize: 14,
    position: 'relative',
    overflow: 'visible',
  };

  const openPhotoViewer = (title: string, images: string[], startIndex = 0) => {
    setPhotoViewer({ title, images, index: startIndex });
  };

  const closePhotoViewer = () => setPhotoViewer(null);

  const showPrev = () => {
    setPhotoViewer((current) => {
      if (!current || current.images.length <= 1) return current;
      return {
        ...current,
        index: (current.index - 1 + current.images.length) % current.images.length,
      };
    });
  };

  const showNext = () => {
    setPhotoViewer((current) => {
      if (!current || current.images.length <= 1) return current;
      return {
        ...current,
        index: (current.index + 1) % current.images.length,
      };
    });
  };

  const toggleRateExpansion = useCallback((vehicleId: string, rate: RateType) => {
    setExpandedRateBuckets((prev) => {
      const key = `${vehicleId}:${rate}`;
      return { ...prev, [key]: !prev[key] };
    });
  }, []);

  const renderColumn = (title: string, list: Vehicle[], category?: VehicleType) => (
    <div style={{ ...columnContainerStyle, marginBottom: 32 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#0f172a' }}>{title}</h2>
      <div style={columnStyle}>
        {list.map((v) => {
          const meta = vehicleMeta[v.id];
          const images = meta?.images ?? getImages(v);
          const availableRateTypes = meta?.availableRateTypes ?? [];
          const storedRateType = selectedRateTypes[v.id];
          const forcedRateType = globalRateType;
          let activeRateType: RateType | null = null;
          const instructionLines = (v.custom_instructions ?? '')
            .split(/\r?\n|•|;/)
            .map((line) => line.trim())
            .filter(Boolean);

          if (forcedRateType) {
            activeRateType = availableRateTypes.includes(forcedRateType)
              ? forcedRateType
              : availableRateTypes[0] ?? null;
          } else if (storedRateType && availableRateTypes.includes(storedRateType)) {
            activeRateType = storedRateType;
          } else {
            activeRateType = availableRateTypes[0] ?? null;
          }

          const priceOptions = activeRateType && meta ? meta.rateOptions[activeRateType] : [];
          const fallbackHour =
            priceOptions.find((opt) => opt.hours === 4)?.hours ?? priceOptions[0]?.hours ?? null;
          const storedHour = selectedHours[v.id];
          const hourIsValid = priceOptions.some((opt) => opt.hours === storedHour);
          const selectedHour = hourIsValid ? storedHour : fallbackHour ?? null;
          const activePrice = priceOptions.find((opt) => opt.hours === selectedHour) ?? null;
          const transferPrice =
            meta?.transferPrice ??
            (typeof v.transfer_price === 'number' && !Number.isNaN(v.transfer_price)
              ? v.transfer_price
              : null);
          const rateSummaryOrder: RateType[] = ['standard', 'prom', 'before5pm', 'phillyWeekend'];
          const popoverRateSections: RateType[] = rateSummaryOrder.filter((rate) => {
            if (rate === 'before5pm' && !before5pmEligible) return false;
            return (meta?.rateOptions[rate]?.length ?? 0) > 0;
          });
          const showPricingPopover = pricingPreviewId === v.id;
          const hasPopoverContent = popoverRateSections.length > 0 || transferPrice !== null;

          return (
            <div key={v.id} style={cardStyle}>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 4,
                  background: 'linear-gradient(90deg, #2563eb, #14b8a6)',
                }}
              />
              <div style={{ display: 'flex', gap: 12 }}>
                {images.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => openPhotoViewer(v.vehicle_title, images)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      cursor: 'pointer',
                    }}
                    aria-label={`View photos for ${v.vehicle_title}`}
                  >
                    <Image
                      src={images[0]}
                      alt={v.vehicle_title}
                      width={88}
                      height={72}
                      unoptimized
                      style={{
                        width: 88,
                        height: 72,
                        objectFit: 'cover',
                        borderRadius: 6,
                        border: '1px solid #e5e7eb',
                      }}
                    />
                  </button>
                ) : (
                  <div
                    style={{
                      width: 88,
                      height: 72,
                      borderRadius: 6,
                      border: '1px dashed #d1d5db',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      color: '#9ca3af',
                    }}
                  >
                    No photo
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{v.vehicle_title}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>
                    {v.city || 'City not set'}
                    {v.capacity ? ` • ${v.capacity} passengers` : ''}
                  </div>
                  {v.short_description && (
                    <div style={{ marginTop: 4, fontSize: 12, color: '#4b5563' }}>
                      {v.short_description}
                    </div>
                  )}
                  {instructionLines.length > 0 && (
                    <div style={instructionBlockStyle}>
                      <div
                        style={{
                          fontSize: 11,
                          letterSpacing: 1,
                          textTransform: 'uppercase',
                          color: '#7c2d12',
                        }}
                      >
                        Custom instructions
                      </div>
                      <ul
                        style={{
                          ...instructionListStyle,
                          listStyleType: 'disc',
                          listStylePosition: 'inside',
                        }}
                      >
                        {instructionLines.map((line, index) => (
                          <li key={`${v.id}-instruction-${index}`}>{line}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div style={{ marginTop: 10, position: 'relative' }}>
                    {priceOptions.length > 0 && activeRateType ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {availableRateTypes.length > 1 && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {availableRateTypes.map((rate: RateType) => {
                              const isActive = rate === activeRateType;
                              const isDisabled = Boolean(forcedRateType);
                              return (
                                <button
                                  key={`${v.id}-${rate}`}
                                  type="button"
                                  onClick={() => {
                                    if (forcedRateType) return;
                                    setSelectedRateTypes((prev) => ({
                                      ...prev,
                                      [v.id]: rate,
                                    }));
                                    setSelectedHours((prev) => ({
                                      ...prev,
                                      [v.id]: null,
                                    }));
                                  }}
                                  style={{
                                    border: '1px solid #d1d5db',
                                    borderRadius: 999,
                                    padding: '2px 10px',
                                    fontSize: 12,
                                    background: isActive ? '#111827' : 'white',
                                    color: isActive ? 'white' : '#111827',
                                    cursor: forcedRateType ? 'not-allowed' : 'pointer',
                                    opacity: isDisabled && !isActive ? 0.6 : 1,
                                  }}
                                  disabled={isDisabled}
                                >
                                  {RATE_TYPE_LABELS[rate]}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {forcedRateType && !availableRateTypes.includes(forcedRateType) && (
                          <div style={{ fontSize: 12, color: '#b45309' }}>
                            {RATE_TYPE_LABELS[forcedRateType]} pricing not available for this vehicle—showing {RATE_TYPE_LABELS[activeRateType]}.
                          </div>
                        )}
                        <label style={{ fontSize: 12, color: '#4b5563' }}>
                          {RATE_TYPE_LABELS[activeRateType]} hours
                          <select
                            style={{
                              marginLeft: 8,
                              padding: '2px 6px',
                              borderRadius: 4,
                              border: '1px solid #d1d5db',
                              fontSize: 13,
                            }}
                            value={selectedHour !== null ? String(selectedHour) : ''}
                            onChange={(e) =>
                              setSelectedHours((prev) => ({
                                ...prev,
                                [v.id]: Number(e.target.value),
                              }))
                            }
                          >
                            {priceOptions.map((opt) => (
                              <option key={`${v.id}-${activeRateType}-${opt.hours}`} value={String(opt.hours)}>
                                {opt.hours} hrs
                              </option>
                            ))}
                          </select>
                        </label>
                        {activePrice ? (
                          <div style={{ fontWeight: 600 }}>{`$${activePrice.price.toFixed(0)} (${activePrice.hours} hrs)`}</div>
                        ) : (
                          <div style={{ color: '#6b7280', fontSize: 13 }}>Select a duration to view pricing.</div>
                        )}
                      </div>
                    ) : (
                      <div style={{ marginTop: 4, fontWeight: 600 }}>
                        {category === 'transfer'
                          ? 'Hourly pricing not provided—use transfer rate or call dispatch.'
                          : 'Call for pricing'}
                      </div>
                    )}
                    {transferPrice !== null ? (
                      <div
                        style={{
                          marginTop: 8,
                          padding: '8px 10px',
                          borderRadius: 6,
                          background: '#fef3c7',
                          border: '1px solid #fde68a',
                          fontSize: 13,
                        }}
                      >
                        Transfer (one-way): <strong>${transferPrice.toFixed(0)}</strong>
                      </div>
                    ) : (
                      category === 'transfer' && (
                        <div style={{ marginTop: 8, fontSize: 12, color: '#a16207' }}>
                          Transfer rate not published—call for quote.
                        </div>
                      )
                    )}
                    {hasPopoverContent && (
                      <div
                        style={{
                          marginTop: 10,
                          display: 'flex',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <button
                          type="button"
                          data-pricing-trigger={v.id}
                          onClick={() =>
                            setPricingPreviewId((current) => (current === v.id ? null : v.id))
                          }
                          style={{
                            border: '1px solid rgba(15,23,42,0.12)',
                            borderRadius: 999,
                            padding: '4px 12px',
                            fontSize: 12,
                            background: showPricingPopover ? '#111827' : '#f3f4f6',
                            color: showPricingPopover ? 'white' : '#111827',
                            cursor: 'pointer',
                          }}
                          aria-pressed={showPricingPopover}
                        >
                          {showPricingPopover ? 'Hide quick pricing' : 'Quick pricing'}
                        </button>
                      </div>
                    )}
                    {showPricingPopover && (
                      <div
                        data-pricing-popover={v.id}
                        style={{
                          position: 'absolute',
                          top: 'calc(100% + 14px)',
                          right: 0,
                          width: 280,
                          maxWidth: '75vw',
                          borderRadius: 16,
                          border: '1px solid rgba(15,23,42,0.12)',
                          background: 'rgba(15,23,42,0.98)',
                          color: '#f8fafc',
                          boxShadow: '0 18px 35px rgba(8,13,26,0.55)',
                          padding: 10,
                          zIndex: 30,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                          transformOrigin: 'top right',
                          animation: 'fadeSlide 160ms ease-out',
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 12, letterSpacing: 0.3 }}>
                          Rate snapshot
                        </div>
                        {popoverRateSections.length === 0 ? (
                          <div style={{ fontSize: 12, color: '#9ca3af' }}>
                            Hourly pricing not provided for this vehicle.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {popoverRateSections.map((rate) => {
                              const rateOptions = meta?.rateOptions[rate] ?? [];
                              const rateKey = `${v.id}:${rate}`;
                              const baseHour = rate === 'prom' ? 8 : 6;
                              const primaryOptions = rateOptions.filter((opt) => {
                                if (rate === 'prom') {
                                  return opt.hours >= 6 && opt.hours <= baseHour;
                                }
                                return opt.hours >= 3 && opt.hours <= baseHour;
                              });
                              const fallbackCount = primaryOptions.length
                                ? primaryOptions.length
                                : Math.min(3, rateOptions.length);
                              const fallbackOptions = primaryOptions.length
                                ? primaryOptions
                                : rateOptions.slice(0, fallbackCount);
                              const showAll = Boolean(expandedRateBuckets[rateKey]);
                              const visibleOptions = showAll ? rateOptions : fallbackOptions;
                              const hiddenCount = Math.max(rateOptions.length - visibleOptions.length, 0);
                              const hasExtras = rateOptions.length > fallbackOptions.length;

                              return (
                                <div
                                  key={`${v.id}-popover-${rate}`}
                                  style={{
                                    flex: '1 1 120px',
                                    background: 'rgba(255,255,255,0.08)',
                                    borderRadius: 9,
                                    padding: '6px 6px',
                                    backdropFilter: 'blur(6px)',
                                  }}
                                >
                                  <div
                                    style={{
                                      fontSize: 11,
                                      letterSpacing: 0.5,
                                      textTransform: 'uppercase',
                                      color: '#cbd5f5',
                                      marginBottom: 4,
                                    }}
                                  >
                                    {RATE_TYPE_LABELS[rate]}
                                  </div>
                                  <div
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: 'auto auto',
                                      columnGap: 6,
                                      rowGap: 2,
                                      fontSize: 12,
                                    }}
                                  >
                                    {visibleOptions.map((opt: PriceOption) => (
                                      <Fragment key={`${rate}-${opt.hours}`}>
                                        <span>{opt.hours}h</span>
                                        <span style={{ textAlign: 'right', fontWeight: 600 }}>
                                          ${opt.price.toFixed(0)}
                                        </span>
                                      </Fragment>
                                    ))}
                                  </div>
                                  {hasExtras && !showAll && hiddenCount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => toggleRateExpansion(v.id, rate)}
                                      style={{
                                        marginTop: 6,
                                        border: 'none',
                                        background: 'transparent',
                                        color: '#a5b4fc',
                                        fontSize: 11,
                                        cursor: 'pointer',
                                        textDecoration: 'underline',
                                      }}
                                    >
                                      +{hiddenCount} more hours
                                    </button>
                                  )}
                                  {hasExtras && showAll && (
                                    <button
                                      type="button"
                                      onClick={() => toggleRateExpansion(v.id, rate)}
                                      style={{
                                        marginTop: 6,
                                        border: 'none',
                                        background: 'transparent',
                                        color: '#a5b4fc',
                                        fontSize: 11,
                                        cursor: 'pointer',
                                        textDecoration: 'underline',
                                      }}
                                    >
                                      Hide extra hours
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: 12,
                            paddingTop: 4,
                            borderTop: '1px solid rgba(255,255,255,0.08)',
                          }}
                        >
                          <span>Transfer</span>
                          {transferPrice !== null ? (
                            <strong style={{ fontSize: 13 }}>${transferPrice.toFixed(0)}</strong>
                          ) : (
                            <span style={{ color: '#9ca3af' }}>Not published</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {images.length > 0 && (
                    <button
                      type="button"
                      onClick={() => openPhotoViewer(v.vehicle_title, images)}
                      style={{
                        marginTop: 6,
                        background: '#111827',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        padding: '4px 8px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      View {images.length} photo{images.length > 1 ? 's' : ''}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const toggleCategory = (key: keyof typeof visibleCategories) => {
    setVisibleCategories((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const categoryOptions: Array<{
    key: keyof typeof visibleCategories;
    label: string;
    disabled?: boolean;
  }> = [
    { key: 'partyBuses', label: 'Party buses' },
    { key: 'limos', label: 'Limos' },
    { key: 'shuttles', label: 'Shuttle buses' },
    { key: 'cars', label: 'Cars' },
    { key: 'transfers', label: 'Transfers', disabled: !hasTransferPricing },
  ];

  const rateToggleOptions = useMemo(() => {
    const options: RateType[] = [];
    if (hasStandardRates) options.push('standard');
    if (hasPromRates) options.push('prom');
    if (before5pmEligible && hasBefore5pmRates) options.push('before5pm');
    if (hasPhillyWeekendRates) options.push('phillyWeekend');
    return options;
  }, [hasStandardRates, hasPromRates, before5pmEligible, hasBefore5pmRates, hasPhillyWeekendRates]);

  return (
    <>
      <style jsx global>{`
        @keyframes instructionPulse {
          0% {
            box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.5);
          }
          70% {
            box-shadow: 0 0 0 14px rgba(249, 115, 22, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(249, 115, 22, 0);
          }
        }
      `}</style>
      <div
        style={{
          minHeight: '100vh',
          background: 'linear-gradient(135deg, #04050a, #0f172a 45%, #1e1b4b)',
          padding: '50px 0 120px',
        }}
      >
      <main
        style={{
          maxWidth: 1500,
          margin: '0 auto',
          padding: '0 16px',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        }}
      >
        <section
          style={{
            borderRadius: 28,
            padding: '28px 32px',
            background: 'linear-gradient(130deg, #0f172a, #1e1b4b 60%, #312e81)',
            color: '#f8fafc',
            marginBottom: 24,
            boxShadow: '0 30px 60px rgba(6,10,24,0.55)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h1 style={{ fontSize: 34, marginBottom: 8, fontWeight: 700 }}>Bus2Ride Vehicle Finder</h1>
              <p style={{ marginBottom: 16, fontSize: 15, color: 'rgba(226,232,240,0.85)' }}>
                Plug in any ZIP/postal or city to preview the exact inventory, rates, and transfer coverage your chatbot presents to riders.
              </p>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, color: 'rgba(226,232,240,0.8)' }}>
                <span>Hover a card for instant rate cards & transfer intel.</span>
                <span>Toggle Standard / Prom / Before 5 PM globally or per vehicle.</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowCallPad(!showCallPad)}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                background: showCallPad ? '#ef4444' : '#10b981',
                color: 'white',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '14px',
                whiteSpace: 'nowrap',
              }}
            >
              {showCallPad ? 'Hide Call Pad' : 'Show Call Pad'}
            </button>
          </div>
        </section>

        {showCallPad && (
          <section style={{ marginBottom: 24 }}>
            <CallPad />
          </section>
        )}

        {!showCallPad && (
          <div
            style={{
              background: 'white',
              borderRadius: 22,
              padding: '20px 24px',
              boxShadow: '0 25px 60px rgba(15,23,42,0.15)',
              marginBottom: 24,
            }}
          >
            <form
              onSubmit={handleSearch}
              style={{ marginBottom: 0, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}
            >
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter ZIP/postal or city (e.g. 85249, R2C, Phoenix)"
                style={{
                  flex: '1 1 220px',
                  padding: '12px 16px',
                  fontSize: 16,
                  borderRadius: 999,
                  border: '1px solid #cbd5f5',
                  background: '#f8fafc',
                }}
              />
              <button
                type="submit"
                style={{
                  padding: '12px 22px',
                  fontSize: 16,
                  borderRadius: 999,
                  border: 'none',
                  background: 'linear-gradient(120deg, #2563eb, #7c3aed)',
                  color: 'white',
                  cursor: 'pointer',
                  boxShadow: '0 12px 25px rgba(79,70,229,0.35)',
                  whiteSpace: 'nowrap',
                  fontWeight: 600,
                }}
              >
                {loading ? 'Searching…' : 'Search'}
              </button>
            </form>
          </div>
        )}
      <section
        style={{
          border: '1px solid rgba(15,23,42,0.08)',
          borderRadius: 24,
          padding: '20px 24px',
          marginBottom: 24,
          background: 'rgba(255,255,255,0.9)',
          boxShadow: '0 25px 45px rgba(15,23,42,0.12)',
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 18, color: '#111827' }}>Results dashboard</div>
        <p style={{ fontSize: 13, color: '#4b5563', marginTop: 6 }}>
          Filter categories, lock a rate card focus, then hover any vehicle for compressed pricing intel.
        </p>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 12,
            fontSize: 13,
            color: '#111827',
          }}
        >
          {categoryOptions.map(({ key, label }) => (
            <label
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                borderRadius: 999,
                border: '1px solid rgba(15,23,42,0.12)',
                background: visibleCategories[key] ? '#111827' : 'white',
                color: visibleCategories[key] ? 'white' : '#111827',
                boxShadow: visibleCategories[key] ? '0 8px 18px rgba(17,24,39,0.2)' : 'none',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={visibleCategories[key]}
                onChange={() => toggleCategory(key)}
                style={{ accentColor: '#6366f1' }}
              />
              {label}
            </label>
          ))}
        </div>
        <div style={{
          marginTop: 12,
          fontSize: 13,
          color: '#111827',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Sort by size:</span>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
              style={{
                border: '1px solid #d1d5db',
                borderRadius: 4,
                padding: '2px 8px',
                fontSize: 13,
              }}
            >
              <option value="desc">Largest → Smallest</option>
              <option value="asc">Smallest → Largest</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span>Rate focus:</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {rateToggleOptions.length === 0 && (
                <span style={{ color: '#6b7280' }}>No published hourly pricing</span>
              )}
              {rateToggleOptions.map((option) => {
                const isActive = globalRateType === option;
                const label = RATE_TYPE_LABELS[option];
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() =>
                      setGlobalRateType((current) => (current === option ? null : option))
                    }
                    style={{
                      border: '1px solid #1f2937',
                      borderRadius: 999,
                      padding: '4px 14px',
                      fontSize: 12,
                      background: isActive ? '#111827' : '#f3f4f6',
                      color: isActive ? 'white' : '#111827',
                      cursor: 'pointer',
                      boxShadow: isActive ? '0 4px 12px rgba(15,23,42,0.35)' : 'none',
                    }}
                  >
                    {label}
                    {isActive && <span style={{ marginLeft: 6, fontSize: 11 }}>×</span>}
                  </button>
                );
              })}
            </div>
            {rateToggleOptions.length > 0 && (
              <span style={{ fontSize: 12, color: '#6b7280' }}>Tap the active pill again to clear.</span>
            )}
          </div>
        </div>
      </section>

      {error && (
        <div style={{ marginBottom: 16, color: '#b91c1c' }}>{error}</div>
      )}

      {vehicles.length === 0 ? (
        <p style={{ marginTop: 24, fontSize: 14, color: '#6b7280' }}>
          Enter a ZIP / postal code or city to see available vehicles.
        </p>
      ) : (
        <div
          style={{
            marginTop: 24,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20,
            alignItems: 'stretch',
            gridAutoRows: '1fr',
          }}
        >
          {visibleCategories.partyBuses && partyBuses.length > 0 &&
            renderColumn('Party Buses', partyBuses, 'party-bus')}
          {visibleCategories.limos && limos.length > 0 && renderColumn('Limos', limos, 'limo')}
          {visibleCategories.shuttles && shuttles.length > 0 &&
            renderColumn('Shuttle Buses', shuttles, 'shuttle')}
          {visibleCategories.cars && cars.length > 0 && renderColumn('Cars', cars, 'car')}
          {visibleCategories.transfers && transfers.length > 0 &&
            renderColumn('Transfers', transfers, 'transfer')}
          {!partyBuses.length && !limos.length && !shuttles.length && cars.length > 0 &&
            !visibleCategories.cars && (
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                All primary categories are hidden—enable “Cars” or another checkbox to see matches.
              </div>
            )}
        </div>
      )}

      {photoViewer && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.75)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              position: 'relative',
              background: 'white',
              borderRadius: 12,
              padding: 16,
              width: '90%',
              maxWidth: 900,
              boxShadow: '0 10px 30px rgba(15,23,42,0.4)',
            }}
          >
            <button
              type="button"
              onClick={closePhotoViewer}
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: 'transparent',
                border: 'none',
                fontSize: 18,
                cursor: 'pointer',
              }}
              aria-label="Close photo viewer"
            >
              ×
            </button>
            <div style={{ textAlign: 'center', marginBottom: 12, fontWeight: 600 }}>
              {photoViewer.title}
            </div>
            <div
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Image
                src={photoViewer.images[photoViewer.index]}
                alt={photoViewer.title}
                width={760}
                height={460}
                unoptimized
                style={{
                  width: '100%',
                  height: 'auto',
                  maxHeight: '70vh',
                  objectFit: 'contain',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                }}
              />
              {photoViewer.images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={showPrev}
                    style={{ ...photoNavButtonStyle, left: 16 }}
                    aria-label="Previous photo"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={showNext}
                    style={{ ...photoNavButtonStyle, right: 16 }}
                    aria-label="Next photo"
                  >
                    ›
                  </button>
                </>
              )}
            </div>
            {photoViewer.images.length > 1 && (
              <div style={{ marginTop: 12, textAlign: 'center', fontSize: 12, color: '#6b7280' }}>
                Photo {photoViewer.index + 1} of {photoViewer.images.length}
              </div>
            )}
          </div>
        </div>
      )}
      </main>
    </div>
    </>
  );
}
