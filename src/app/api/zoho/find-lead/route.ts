import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const body = await req.json();
  console.log('Stub /api/zoho/find-lead called with:', body);
  
  return NextResponse.json({ lead: null });
}
