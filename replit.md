# Bus2Ride Vehicle Finder

## Overview
A Next.js application for searching party buses, limos, shuttle buses, and other vehicles by ZIP code or city. The app connects to a Supabase database to display vehicle inventory with pricing information.

## Project Structure
- `src/app/page.tsx` - Main page component with vehicle search and display logic
- `src/app/call-pad/page.tsx` - Call Pad page for agents to take customer calls
- `src/app/components/CallPad.tsx` - Call Pad component with form and vehicle quoting
- `src/app/api/vehicles/route.ts` - API endpoint for vehicle searches
- `src/app/api/zoho/find-lead/route.ts` - Stub endpoint for Zoho lead lookup
- `src/app/api/zoho/save-call/route.ts` - Stub endpoint for saving calls to Zoho
- `src/app/api/get-vehicles-for-call/route.ts` - Endpoint for getting vehicles during a call
- `src/lib/supabase.ts` - Supabase client configuration
- `next.config.ts` - Next.js configuration
- `public/` - Static assets

## Call Pad Feature
The Call Pad (`/call-pad`) is a tool for agents taking customer calls. Features:
- Auto-lookup of existing Zoho leads by phone/email
- Vehicle search by city/zip, passengers, and hours
- Mark vehicles as quoted during the call
- Save call snapshots to Zoho CRM

Note: Zoho integration endpoints are currently stubs. To enable real Zoho integration, you'll need:
- A Zoho OAuth app with access/refresh tokens
- Real field API names for custom fields
- Replace stub endpoints with actual Zoho API calls

## Environment Variables Required
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key

## Development
The app runs on port 5000 with:
```
npm run dev
```

## Production Build
```
npm run build
npm run start
```

## Technology Stack
- Next.js 16.0.3 with Turbopack
- React 19
- Supabase for database
- TypeScript
