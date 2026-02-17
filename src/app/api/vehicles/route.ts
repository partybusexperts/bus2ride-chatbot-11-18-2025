import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const STORAGE_BUCKET = 'vehicles1';

function getImageUrl(key: string | null): string | null {
  if (!key || !SUPABASE_URL) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${encodeURIComponent(key)}`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();

  try {
    const supabase = getSupabaseServerClient();

    // This database has no city/ZIP data — return all vehicles
    const { data, error } = await supabase
      .from('vehicles11_with_images')
      .select('*')
      .order('capacity', { ascending: true });

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const vehicles = (data || []).map((v: any) => ({
      id: v.id,
      vehicle_title: v.name,
      name: v.name,
      capacity: v.capacity,
      type: v.type,
      amenities: v.amenities || [],
      image_main: getImageUrl(v.exterior_key),
      image_2: getImageUrl(v.interior_key),
      image_3: null,
      gallery_all: null,
      city: null,
      active: true,
    }));

    return NextResponse.json({ vehicles });
  } catch (err) {
    console.error('API /api/vehicles error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
