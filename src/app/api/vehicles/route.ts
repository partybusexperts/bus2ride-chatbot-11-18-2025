import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

type VehicleRecord = {
  id: string;
  vehicle_title: string;
  short_description: string | null;
  capacity: number | null;
  city: string | null;
  zips_raw: string | null;
  custom_instructions: string | null;
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
  transfer_price: number | null;
  categories: string | null;
  category_slugs: string | null;
  tags: string | null;
  tag_slugs: string | null;
  image_main: string | null;
  image_2: string | null;
  image_3: string | null;
  gallery_all: string | null;
  is_transfer: boolean | null;
  active: boolean | null;
};

type VehicleZipRelation = VehicleRecord | VehicleRecord[] | null;

type VehicleZipRow = {
  vehicle_id: string;
  zip: string;
  vehicles_for_chatbot: VehicleZipRelation;
};

function extractVehicle(rel: VehicleZipRelation): VehicleRecord | null {
  if (!rel) return null;
  if (Array.isArray(rel)) {
    return rel[0] ?? null;
  }
  return rel;
}

function normalizeCityQuery(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function escapeForIlike(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();

  if (!q) {
    return NextResponse.json({ vehicles: [] });
  }

  const hasDigit = /\d/.test(q);

  try {
    let vehicles: VehicleRecord[] = [];

    if (hasDigit) {
      const postal = q.toUpperCase().replace(/\s+/g, '');

      const { data, error } = await supabase
        .from('vehicle_zips')
        .select(
          `
          vehicle_id,
          zip,
          vehicles_for_chatbot (
            id,
            vehicle_title,
            short_description,
            capacity,
            city,
            zips_raw,
            custom_instructions,
            price_3hr,
            price_4hr,
            price_5hr,
            price_6hr,
            price_7hr,
            price_8hr,
            price_9hr,
            price_10hr,
            prom_price_6hr,
            prom_price_7hr,
            prom_price_8hr,
            prom_price_9hr,
            prom_price_10hr,
            before5pm_3hr,
            before5pm_4hr,
            before5pm_5hr,
            before5pm_6hr,
            before5pm_7hr,
            transfer_price,
            categories,
            category_slugs,
            tags,
            tag_slugs,
            image_main,
            image_2,
            image_3,
            gallery_all,
            is_transfer,
            active
          )
        `
        )
        .eq('zip', postal);

      if (error) {
        console.error('Supabase ZIP/postal search error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      vehicles =
        data
          ?.map((row: VehicleZipRow) => extractVehicle(row.vehicles_for_chatbot))
          .filter((v): v is VehicleRecord => {
            if (!v) return false;
            return v.active !== false;
          }) ?? [];
    } else {
      const normalizedCity = normalizeCityQuery(q);
      if (!normalizedCity) {
        return NextResponse.json({ vehicles: [] });
      }
      const cityPattern = `%${escapeForIlike(normalizedCity)}%`;

      const { data, error } = await supabase
        .from('vehicles_for_chatbot')
        .select(
          `
          id,
          vehicle_title,
          short_description,
          capacity,
          city,
          zips_raw,
          custom_instructions,
          price_3hr,
          price_4hr,
          price_5hr,
          price_6hr,
          price_7hr,
          price_8hr,
          price_9hr,
          price_10hr,
          prom_price_6hr,
          prom_price_7hr,
          prom_price_8hr,
          prom_price_9hr,
          prom_price_10hr,
          before5pm_3hr,
          before5pm_4hr,
          before5pm_5hr,
          before5pm_6hr,
          before5pm_7hr,
          transfer_price,
          categories,
          category_slugs,
          tags,
          tag_slugs,
          image_main,
          image_2,
          image_3,
          gallery_all,
          is_transfer,
          active
        `
        )
        .ilike('city', cityPattern);

      if (error) {
        console.error('Supabase city search error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      vehicles = data?.filter((v) => v.active !== false) ?? [];
    }

    return NextResponse.json({ vehicles });
  } catch (err) {
    console.error('API /api/vehicles error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
