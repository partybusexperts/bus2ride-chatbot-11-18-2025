import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

type VehicleRecord = {
  id: string;
  vehicle_title: string;
  capacity: number | null;
  city: string | null;
  zips_raw: string | null;
  price_3hr: number | null;
  price_4hr: number | null;
  price_5hr: number | null;
  price_6hr: number | null;
  price_7hr: number | null;
  price_8hr: number | null;
  price_9hr: number | null;
  price_10hr: number | null;
  active: boolean | null;
};

function getPriceForHours(vehicle: VehicleRecord, hours: number | null): { price: number; hours: number } | null {
  const priceFields: Record<number, keyof VehicleRecord> = {
    3: 'price_3hr',
    4: 'price_4hr',
    5: 'price_5hr',
    6: 'price_6hr',
    7: 'price_7hr',
    8: 'price_8hr',
    9: 'price_9hr',
    10: 'price_10hr',
  };

  if (hours && priceFields[hours]) {
    const price = vehicle[priceFields[hours]];
    if (typeof price === 'number' && price > 0) {
      return { price, hours };
    }
  }

  for (const h of [4, 5, 6, 3, 7, 8, 9, 10]) {
    const price = vehicle[priceFields[h]];
    if (typeof price === 'number' && price > 0) {
      return { price, hours: h };
    }
  }

  return null;
}

function normalizeCityQuery(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { cityOrZip, passengers, hours } = body;

    console.log('get-vehicles-for-call:', { cityOrZip, passengers, hours });

    if (!cityOrZip) {
      return NextResponse.json({
        vehicles: [],
        message: "Please enter a city or ZIP code",
      });
    }

    const query = normalizeCityQuery(cityOrZip);
    const isZip = /^\d{5}$/.test(query);

    let vehicles: VehicleRecord[] = [];

    if (isZip) {
      const { data: zipData } = await supabase
        .from('vehicle_zips')
        .select('vehicle_id, vehicles_for_chatbot(*)')
        .eq('zip', query);

      if (zipData && zipData.length > 0) {
        vehicles = zipData
          .map((row: any) => {
            const v = row.vehicles_for_chatbot;
            if (Array.isArray(v)) return v[0];
            return v;
          })
          .filter((v: any) => v && v.active !== false);
      }
    } else {
      const { data: cityData } = await supabase
        .from('vehicles_for_chatbot')
        .select('*')
        .ilike('city', `%${query}%`)
        .eq('active', true);

      vehicles = cityData || [];
    }

    if (passengers) {
      vehicles = vehicles.filter((v) => {
        if (!v.capacity) return true;
        return v.capacity >= passengers;
      });
    }

    vehicles.sort((a, b) => {
      const capA = a.capacity ?? 0;
      const capB = b.capacity ?? 0;
      return capA - capB;
    });

    const formattedVehicles = vehicles.map((v) => {
      const priceInfo = getPriceForHours(v, hours);
      const capacityStr = v.capacity ? `${v.capacity} Passenger` : '';
      
      return {
        id: v.id,
        name: v.vehicle_title,
        capacity: capacityStr,
        price: priceInfo?.price || 0,
        hours: priceInfo?.hours || hours || 4,
        priceDisplay: priceInfo 
          ? `$${priceInfo.price.toLocaleString()} for ${priceInfo.hours} hours`
          : 'Price varies',
      };
    });

    return NextResponse.json({
      vehicles: formattedVehicles,
      message: formattedVehicles.length > 0 
        ? `Found ${formattedVehicles.length} vehicle(s)` 
        : "No vehicles found for this area",
    });
  } catch (error) {
    console.error('Error in get-vehicles-for-call:', error);
    return NextResponse.json({
      vehicles: [],
      message: "Error fetching vehicles",
    }, { status: 500 });
  }
}
