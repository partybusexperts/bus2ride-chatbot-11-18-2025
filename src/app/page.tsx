'use client';

import Image from 'next/image';
import { useCallback, useMemo, useState } from 'react';

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
  image_main?: string | null;
  image_2?: string | null;
  image_3?: string | null;
  gallery_all?: string | null;
  is_transfer?: boolean | null;
  active?: boolean | null;
};

type VehicleType = 'party-bus' | 'limo' | 'shuttle' | 'car' | 'transfer';
type RateType = 'standard' | 'prom' | 'before5pm';
type PriceOption = { hours: number; price: number };
type VehicleMeta = {
  images: string[];
  rateOptions: Record<RateType, PriceOption[]>;
  availableRateTypes: RateType[];
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

const RATE_TYPE_FIELDS: Record<RateType, Array<{ hours: number; key: keyof Vehicle }>> = {
  standard: PRICE_FIELDS,
  prom: PROM_FIELDS,
  before5pm: BEFORE5PM_FIELDS,
};

const RATE_TYPE_LABELS: Record<RateType, string> = {
  standard: 'Standard',
  prom: 'Prom',
  before5pm: 'Before 5 PM',
};

function getVehicleType(v: Vehicle): VehicleType {
  if (v.is_transfer) return 'transfer';

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

  if (haystack.match(/party ?bus|partybus|coach/)) return 'party-bus';
  if (haystack.match(/limo|limousine|stretch/)) return 'limo';
  if (haystack.match(/shuttle|mini ?bus|sprinter/)) return 'shuttle';

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
    cars: true,
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
  const [globalRateType, setGlobalRateType] = useState<RateType | 'auto'>('auto');

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
      const rateOptions: Record<RateType, PriceOption[]> = {
        standard: getPriceOptions(v, 'standard'),
        prom: getPriceOptions(v, 'prom'),
        before5pm: getPriceOptions(v, 'before5pm'),
      };
      const availableRateTypes = (Object.keys(rateOptions) as RateType[]).filter(
        (rate) => rateOptions[rate].length > 0,
      );
      meta[v.id] = {
        images: getImages(v),
        rateOptions,
        availableRateTypes,
      };
    }
    return meta;
  }, [vehicles]);

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
      else if (type === 'transfer') transfers.push(v);
      else cars.push(v);
    }

    return {
      partyBuses: sortByCapacity(partyBuses),
      limos: sortByCapacity(limos),
      shuttles: sortByCapacity(shuttles),
      cars: sortByCapacity(cars),
      transfers: sortByCapacity(transfers),
    };
  }, [vehicles, sortByCapacity]);

  const columnStyle = {
    borderRadius: 10,
    paddingRight: 4,
    maxHeight: '70vh',
    overflowY: 'auto' as const,
  };

  const cardStyle = {
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: 12,
    background: 'white',
    boxShadow: '0 1px 2px rgba(15,23,42,0.05)',
    fontSize: 14,
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

  const renderColumn = (title: string, list: Vehicle[], category?: VehicleType) => (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, ...columnStyle }}>
        {list.map((v) => {
          const meta = vehicleMeta[v.id];
          const images = meta?.images ?? getImages(v);
          const availableRateTypes = meta?.availableRateTypes ?? [];
          const storedRateType = selectedRateTypes[v.id];
          const forcedRateType = globalRateType === 'auto' ? null : globalRateType;
          let activeRateType: RateType | null = null;

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

          return (
            <div key={v.id} style={cardStyle}>
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
                  <div style={{ marginTop: 10 }}>
                    {priceOptions.length > 0 && activeRateType ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {availableRateTypes.length > 1 && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {availableRateTypes.map((rate: RateType) => {
                              const isActive = rate === activeRateType;
                              const isDisabled = globalRateType !== 'auto' && globalRateType !== rate;
                              return (
                                <button
                                  key={`${v.id}-${rate}`}
                                  type="button"
                                  onClick={() => {
                                    if (globalRateType !== 'auto') return;
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
                                    cursor: globalRateType === 'auto' ? 'pointer' : 'not-allowed',
                                    opacity: isDisabled ? 0.6 : 1,
                                  }}
                                  disabled={globalRateType !== 'auto'}
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
                        Call for pricing
                        {category === 'transfer' ? ' (transfer quote required)' : ''}
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

  const categoryOptions: Array<{ key: keyof typeof visibleCategories; label: string }> = [
    { key: 'partyBuses', label: 'Party buses' },
    { key: 'limos', label: 'Limos' },
    { key: 'shuttles', label: 'Shuttle buses' },
    { key: 'cars', label: 'Cars' },
    { key: 'transfers', label: 'Transfers' },
  ];

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: '40px auto',
        padding: '0 16px',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>Bus2Ride Vehicle Finder</h1>
      <p style={{ marginBottom: 20 }}>
  This is your internal test page. Enter a ZIP/postal code or city to see exactly what the chatbot will see.
      </p>

      <form
        onSubmit={handleSearch}
        style={{ marginBottom: 24, display: 'flex', gap: 8, flexWrap: 'wrap' }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter ZIP/postal or city (e.g. 85249, R2C, Phoenix)"
          style={{
            flex: '1 1 180px',
            padding: '8px 12px',
            fontSize: 16,
            borderRadius: 4,
            border: '1px solid #ccc',
          }}
        />
        <button
          type="submit"
          style={{
            padding: '8px 16px',
            fontSize: 16,
            borderRadius: 4,
            border: 'none',
            background: '#2563eb',
            color: 'white',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      <section
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: 12,
          marginBottom: 20,
          background: '#f9fafb',
        }}
      >
        <div style={{ fontWeight: 600 }}>Results</div>
        <p style={{ fontSize: 13, color: '#4b5563', marginTop: 4 }}>
          We’ll group matches into Party Buses, Limos, and Shuttles so you can compare quickly.
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
            <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={visibleCategories[key]}
                onChange={() => toggleCategory(key)}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>Rate type:</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['auto', 'standard', 'prom', 'before5pm'] as Array<'auto' | RateType>).map((option) => {
                const isActive = globalRateType === option;
                const label = option === 'auto' ? 'Auto' : RATE_TYPE_LABELS[option];
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setGlobalRateType(option)}
                    style={{
                      border: '1px solid #d1d5db',
                      borderRadius: 999,
                      padding: '2px 10px',
                      fontSize: 12,
                      background: isActive ? '#111827' : 'white',
                      color: isActive ? 'white' : '#111827',
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
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
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 24,
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
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                justifyContent: 'center',
              }}
            >
              {photoViewer.images.length > 1 && (
                <button
                  type="button"
                  onClick={showPrev}
                  style={{
                    border: 'none',
                    background: '#111827',
                    color: 'white',
                    borderRadius: 999,
                    width: 40,
                    height: 40,
                    cursor: 'pointer',
                  }}
                  aria-label="Previous photo"
                >
                  ‹
                </button>
              )}
              <Image
                src={photoViewer.images[photoViewer.index]}
                alt={photoViewer.title}
                width={760}
                height={460}
                unoptimized
                style={{
                  width: '100%',
                  maxHeight: '70vh',
                  objectFit: 'contain',
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                }}
              />
              {photoViewer.images.length > 1 && (
                <button
                  type="button"
                  onClick={showNext}
                  style={{
                    border: 'none',
                    background: '#111827',
                    color: 'white',
                    borderRadius: 999,
                    width: 40,
                    height: 40,
                    cursor: 'pointer',
                  }}
                  aria-label="Next photo"
                >
                  ›
                </button>
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
  );
}
