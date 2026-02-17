import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const STORAGE_BUCKET = 'vehicles1';

function getImageUrl(key: string | null): string | null {
  if (!key || !SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${encodeURIComponent(key)}`;
}

type DbVehicle = {
  id: string;
  name: string;
  capacity: number | null;
  type: string | null;
  amenities: string[] | null;
  storage_path: string | null;
  interior_key: string | null;
  exterior_key: string | null;
};

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await req.json();
    const { cityOrZip, passengers, hours } = body;

    console.log('get-vehicles-for-call:', { cityOrZip, passengers, hours });

    // Fetch all vehicles (this database has no city/ZIP associations)
    const { data, error } = await supabase
      .from('vehicles11_with_images')
      .select('*')
      .order('capacity', { ascending: true });

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({
        vehicles: [],
        message: 'Database error: ' + error.message,
      }, { status: 500 });
    }

    let vehicles: DbVehicle[] = data || [];

    // Filter by passenger count if provided
    const pax = Number(passengers);
    if (pax > 0) {
      // Sort: vehicles that fit the passengers first (smallest suitable first),
      // then vehicles too small (largest first)
      vehicles.sort((a, b) => {
        const capA = a.capacity ?? 0;
        const capB = b.capacity ?? 0;
        const aFits = capA >= pax;
        const bFits = capB >= pax;
        if (aFits && !bFits) return -1;
        if (!aFits && bFits) return 1;
        if (aFits && bFits) return capA - capB;
        return capB - capA;
      });
    }

    const formattedVehicles = vehicles.map((v) => ({
      id: v.id,
      name: v.name,
      vehicle_title: v.name,
      capacity: v.capacity ? `${v.capacity} Passenger` : '',
      capacityNum: v.capacity ?? 0,
      type: v.type || '',
      categories: v.type || null,
      amenities: v.amenities || [],
      price: 0,
      hours: Number(hours) || 4,
      priceDisplay: 'Call for pricing',
      image: getImageUrl(v.exterior_key),
      image_2: getImageUrl(v.interior_key),
      image_3: null,
      gallery_all: null,
      city: cityOrZip || null,
      short_description: v.type || null,
      tags: null,
      custom_instructions: null,
      // No pricing data in this database
      price_3hr: null,
      price_4hr: null,
      price_5hr: null,
      price_6hr: null,
      price_7hr: null,
      price_8hr: null,
      price_9hr: null,
      price_10hr: null,
      prom_price_6hr: null,
      prom_price_7hr: null,
      prom_price_8hr: null,
      prom_price_9hr: null,
      prom_price_10hr: null,
      before5pm_3hr: null,
      before5pm_4hr: null,
      before5pm_5hr: null,
      before5pm_6hr: null,
      before5pm_7hr: null,
      april_may_weekend_5hr: null,
      april_may_weekend_6hr: null,
      april_may_weekend_7hr: null,
      april_may_weekend_8hr: null,
      april_may_weekend_9hr: null,
      transfer_price: null,
      is_transfer: false,
    }));

    const message = formattedVehicles.length > 0
      ? `Found ${formattedVehicles.length} vehicle(s)`
      : 'No vehicles found';

    return NextResponse.json({
      vehicles: formattedVehicles,
      message,
    });
  } catch (error) {
    console.error('Error in get-vehicles-for-call:', error);
    const errorMessage = error instanceof Error ? error.message : '';
    const needsSupabaseEnv =
      typeof errorMessage === 'string' && errorMessage.includes('Missing Supabase environment variables');
    return NextResponse.json({
      vehicles: [],
      message: needsSupabaseEnv
        ? "Server isn't configured yet. Set your Supabase env vars in .env.local (or Vercel env) and restart the dev server."
        : 'Error fetching vehicles',
    }, { status: 500 });
  }
}
