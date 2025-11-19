'use client';

import { useMemo, useState } from 'react';

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
  image_main?: string | null;
  is_transfer?: boolean | null;
  active?: boolean | null;
};

type VehicleType = 'party-bus' | 'limo' | 'shuttle' | 'other';

function getVehicleType(v: Vehicle): VehicleType {
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

  return 'other';
}

function formatPriceSummary(v: Vehicle): string {
  const hourly =
    v.price_4hr ??
    v.price_5hr ??
    v.price_3hr ??
    v.price_6hr ??
    v.price_7hr ??
    v.price_8hr ??
    v.price_9hr ??
    v.price_10hr;

  if (!hourly) return 'Call for pricing';

  if (v.price_4hr) return `$${v.price_4hr.toFixed(0)} (4 hrs)`;
  if (v.price_5hr) return `$${v.price_5hr.toFixed(0)} (5 hrs)`;
  return `$${hourly.toFixed(0)}+`;
}

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  const { partyBuses, limos, shuttles, others } = useMemo(() => {
    const partyBuses: Vehicle[] = [];
    const limos: Vehicle[] = [];
    const shuttles: Vehicle[] = [];
    const others: Vehicle[] = [];

    for (const v of vehicles) {
      const type = getVehicleType(v);
      if (type === 'party-bus') partyBuses.push(v);
      else if (type === 'limo') limos.push(v);
      else if (type === 'shuttle') shuttles.push(v);
      else others.push(v);
    }

    return { partyBuses, limos, shuttles, others };
  }, [vehicles]);

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

  const renderColumn = (title: string, list: Vehicle[]) => (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{title}</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, ...columnStyle }}>
        {list.map((v) => (
          <div key={v.id} style={cardStyle}>
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
            <div style={{ marginTop: 6, fontWeight: 600 }}>{formatPriceSummary(v)}</div>
          </div>
        ))}
      </div>
    </div>
  );

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
          {partyBuses.length > 0 && renderColumn('Party Buses', partyBuses)}
          {limos.length > 0 && renderColumn('Limos', limos)}
          {shuttles.length > 0 && renderColumn('Shuttles', shuttles)}
          {partyBuses.length === 0 && limos.length === 0 && shuttles.length === 0 &&
            others.length > 0 && renderColumn('Other', others)}
        </div>
      )}
    </main>
  );
}
