# Bus2Ride Vehicle Finder

## Overview
A Next.js application for searching party buses, limos, shuttle buses, and other vehicles by ZIP code or city. The app connects to a Supabase database to display vehicle inventory with pricing information.

## Project Structure
- `src/app/page.tsx` - Main page component with vehicle search and display logic
- `src/app/api/vehicles/route.ts` - API endpoint for vehicle searches
- `src/lib/supabase.ts` - Supabase client configuration
- `next.config.ts` - Next.js configuration
- `public/` - Static assets

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
