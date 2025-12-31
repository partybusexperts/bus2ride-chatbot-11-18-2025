import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const body = await req.json();
  console.log('Stub /api/zoho/save-call snapshot:', body);
  
  return NextResponse.json({ success: true });
}
