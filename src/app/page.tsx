'use client';

import Image from 'next/image';
import { useState } from 'react';

type Vehicle = {
  id: string;
  vehicle_title: string;
  short_description: string | null;
  capacity: number | null;
  city: string | null;
  zip?: string | null;
  zips_raw: string | null;
  custom_instructions: string | null;
  is_transfer: boolean | null;
  active: boolean | null;

  price_3hr: number | null;
  price_4hr: number | null;
  price_5hr: number | null;
  price_6hr: number | null;
  price_7hr: number | null;
  price_8hr: number | null;
  price_9hr: number | null;
  price_10hr: number | null;

  prom_price_6hr: number | null;
  prom_price_7hr: number | null;
  prom_price_8hr: number | null;
  prom_price_9hr: number | null;
  prom_price_10hr: number | null;

  before5pm_3hr: number | null;
  before5pm_4hr: number | null;
  before5pm_5hr: number | null;
  before5pm_6hr: number | null;
  before5pm_7hr: number | null;

  categories: string | null;
  category_slugs: string | null;
  tags: string | null;
  tag_slugs: string | null;

  image_main: string | null;
  image_2: string | null;
  image_3: string | null;
  gallery_all: string | null;
};

type RateType = 'standard' | 'prom' | 'daytime';
type StandardHour = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
type PromHour = 6 | 7 | 8 | 9 | 10;
type DaytimeHour = 3 | 4 | 5 | 6 | 7;
type HoursChoice = StandardHour | 'all';

const HOURS: StandardHour[] = [3, 4, 5, 6, 7, 8, 9, 10];

function getStandardPrice(v: Vehicle, hours: StandardHour): number | null {
  const key = `price_${hours}hr` as keyof Vehicle;
  return (v[key] as number | null) ?? null;
}

function getPromPrice(v: Vehicle, hours: PromHour): number | null {
  const key = `prom_price_${hours}hr` as keyof Vehicle;
  return (v[key] as number | null) ?? null;
}

function getDaytimePrice(v: Vehicle, hours: DaytimeHour): number | null {
  const key = `before5pm_${hours}hr` as keyof Vehicle;
  return (v[key] as number | null) ?? null;
}

function getPriceForSelection(
  v: Vehicle,
  selectedHours: HoursChoice,
  rateType: RateType
): number | null {
  if (selectedHours === 'all') return null;

  if (rateType === 'standard') {
    return getStandardPrice(v, selectedHours);
  }

  if (rateType === 'prom') {
    if (selectedHours < 6) return null;
    return getPromPrice(v, selectedHours as PromHour);
  }

  if (selectedHours > 7) return null;
  return getDaytimePrice(v, selectedHours as DaytimeHour);
}

function getImages(v: Vehicle): string[] {
  const parts: string[] = [];

  if (v.image_main) parts.push(v.image_main);
  if (v.image_2) parts.push(v.image_2);
  if (v.image_3) parts.push(v.image_3);

  if (v.gallery_all) {
    const extra = v.gallery_all
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean);
    parts.push(...extra);
  }

  return Array.from(new Set(parts));
}

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedHours, setSelectedHours] = useState<HoursChoice>('all');
  const [rateType, setRateType] = useState<RateType>('standard');

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
        <div style={{ marginBottom: 8, fontWeight: 600 }}>Pricing View</div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <div>
            <label style={{ fontSize: 14, marginRight: 8 }}>Hours:</label>
            <select
              value={selectedHours === 'all' ? 'all' : String(selectedHours)}
              onChange={(e) =>
                setSelectedHours(
                  e.target.value === 'all' ? 'all' : (Number(e.target.value) as StandardHour)
                )
              }
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid #d1d5db',
              }}
            >
              <option value="all">Show all hours</option>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {h} hours
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {(['standard', 'prom', 'daytime'] as RateType[]).map((rt) => (
              <button
                key={rt}
                type="button"
                onClick={() => setRateType(rt)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: '1px solid #d1d5db',
                  fontSize: 13,
                  cursor: 'pointer',
                  background: rateType === rt ? '#2563eb' : 'white',
                  color: rateType === rt ? 'white' : '#374151',
                }}
              >
                {rt === 'standard'
                  ? 'Standard'
                  : rt === 'prom'
                  ? 'Prom'
                  : 'Daytime (Before 5pm)'}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && (
        <div style={{ marginBottom: 16, color: '#b91c1c' }}>{error}</div>
      )}

      {vehicles.map((v) => {
        const images = getImages(v);
        const selectedPrice = getPriceForSelection(v, selectedHours, rateType);

        return (
          <div
            key={v.id}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 10,
              padding: 16,
              marginBottom: 14,
              display: 'flex',
              gap: 16,
              alignItems: 'flex-start',
              background: 'white',
              boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
            }}
          >
            {images.length > 0 && (
              <div
                style={{
                  width: 220,
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <Image
                  src={images[0]}
                  alt={v.vehicle_title}
                  width={220}
                  height={140}
                  unoptimized
                  style={{
                    width: '100%',
                    height: 140,
                    objectFit: 'cover',
                    borderRadius: 8,
                    border: '1px solid #e5e7eb',
                  }}
                />
                {images.length > 1 && (
                  <div
                    style={{
                      display: 'flex',
                      gap: 6,
                      overflowX: 'auto',
                    }}
                  >
                    {images.slice(1).map((url) => (
                      <Image
                        key={url}
                        src={url}
                        alt=""
                        width={60}
                        height={46}
                        unoptimized
                        style={{
                          objectFit: 'cover',
                          borderRadius: 4,
                          border: '1px solid #e5e7eb',
                          flexShrink: 0,
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>{v.vehicle_title}</h2>
              <div
                style={{
                  fontSize: 13,
                  color: '#6b7280',
                  marginTop: 4,
                  marginBottom: 4,
                }}
              >
                {v.city || 'City unknown'}
                {v.zip || v.zips_raw ? ` • Service area: ${v.zip ?? v.zips_raw}` : ''}
                {v.capacity ? ` • ${v.capacity} passengers` : ''}
              </div>
              {v.short_description && (
                <p style={{ marginTop: 6, fontSize: 14 }}>{v.short_description}</p>
              )}
              {v.custom_instructions && (
                <div style={{ fontSize: 13, color: '#92400e', marginTop: 4 }}>
                  Notes: {v.custom_instructions}
                </div>
              )}
              {v.categories && (
                <div
                  style={{
                    fontSize: 12,
                    color: '#4b5563',
                    marginTop: 6,
                  }}
                >
                  Categories: {v.categories.split('|').join(', ')}
                </div>
              )}

              {selectedHours !== 'all' && (
                <div style={{ marginTop: 10 }}>
                  {selectedPrice ? (
                    <span style={{ fontWeight: 600 }}>
                      {rateType === 'standard' && 'Standard rate'}
                      {rateType === 'prom' && 'Prom rate'}
                      {rateType === 'daytime' && 'Daytime (before 5pm)'}
                      {` • ${selectedHours} hours: $${selectedPrice.toLocaleString()}`}
                    </span>
                  ) : (
                    <span style={{ fontSize: 13, color: '#6b7280' }}>
                      No {rateType} price listed for {selectedHours} hours.
                    </span>
                  )}
                </div>
              )}

              <div style={{ marginTop: 10 }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 12,
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          textAlign: 'left',
                          borderBottom: '1px solid #e5e7eb',
                          padding: '4px 4px',
                        }}
                      >
                        Hours
                      </th>
                      <th
                        style={{
                          textAlign: 'right',
                          borderBottom: '1px solid #e5e7eb',
                          padding: '4px 4px',
                        }}
                      >
                        Standard
                      </th>
                      <th
                        style={{
                          textAlign: 'right',
                          borderBottom: '1px solid #e5e7eb',
                          padding: '4px 4px',
                        }}
                      >
                        Prom
                      </th>
                      <th
                        style={{
                          textAlign: 'right',
                          borderBottom: '1px solid #e5e7eb',
                          padding: '4px 4px',
                        }}
                      >
                        Daytime
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {HOURS.map((h) => {
                      const std = getStandardPrice(v, h);
                      const prom = h >= 6 ? getPromPrice(v, h as PromHour) : null;
                      const day = h <= 7 ? getDaytimePrice(v, h as DaytimeHour) : null;

                      if (!std && !prom && !day) return null;

                      return (
                        <tr key={h}>
                          <td
                            style={{
                              padding: '3px 4px',
                              borderBottom: '1px solid #f3f4f6',
                            }}
                          >
                            {h} hr
                          </td>
                          <td
                            style={{
                              padding: '3px 4px',
                              borderBottom: '1px solid #f3f4f6',
                              textAlign: 'right',
                            }}
                          >
                            {std ? `$${std.toLocaleString()}` : '—'}
                          </td>
                          <td
                            style={{
                              padding: '3px 4px',
                              borderBottom: '1px solid #f3f4f6',
                              textAlign: 'right',
                            }}
                          >
                            {prom ? `$${prom.toLocaleString()}` : '—'}
                          </td>
                          <td
                            style={{
                              padding: '3px 4px',
                              borderBottom: '1px solid #f3f4f6',
                              textAlign: 'right',
                            }}
                          >
                            {day ? `$${day.toLocaleString()}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })}
    </main>
  );
}
