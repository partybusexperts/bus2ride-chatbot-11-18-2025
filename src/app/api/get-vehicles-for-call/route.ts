import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const body = await req.json();
  console.log('Stub /api/get-vehicles-for-call:', body);
  
  const { hours } = body;

  const demoVehicles = [
    {
      id: "v1",
      name: "18 Passenger Party Bus",
      capacity: "18 Passenger",
      priceDisplay: "$650 for 4 hours",
      hours: hours || 4,
    },
    {
      id: "v2",
      name: "24 Passenger Party Bus",
      capacity: "24 Passenger",
      priceDisplay: "$800 for 5 hours",
      hours: hours || 5,
    },
    {
      id: "v3",
      name: "Stretch Limo",
      capacity: "10 Passenger",
      priceDisplay: "$500 for 3 hours",
      hours: hours || 3,
    },
  ];

  return NextResponse.json({
    vehicles: demoVehicles,
    message: "Demo vehicles (hook this to Supabase later)",
  });
}
