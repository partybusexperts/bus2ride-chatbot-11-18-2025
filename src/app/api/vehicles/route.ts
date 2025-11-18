import { NextResponse } from 'next/server';
import { getVehiclesByZip } from '@/lib/supabase';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const zip = searchParams.get('zip');

  if (!zip) {
    return NextResponse.json(
      { error: 'Missing zip query parameter' },
      { status: 400 }
    );
  }

  try {
    const vehicles = await getVehiclesByZip(zip);
    return NextResponse.json(vehicles, { status: 200 });
  } catch (err) {
    console.error('API /api/vehicles error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
