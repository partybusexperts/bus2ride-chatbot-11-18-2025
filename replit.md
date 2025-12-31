# Bus2Ride Vehicle Finder

## Overview
A Next.js application for searching party buses, limos, shuttle buses, and other vehicles by ZIP code or city. The app connects to a Supabase database to display vehicle inventory with pricing information.

## Project Structure
- `src/app/page.tsx` - Main page component with vehicle search and display logic
- `src/app/components/CallPad.tsx` - Smart Call Pad with three-panel layout
- `src/app/api/vehicles/route.ts` - API endpoint for vehicle searches
- `src/app/api/parse-input/route.ts` - AI-powered input parsing API
- `src/app/api/zoho/find-lead/route.ts` - Stub endpoint for Zoho lead lookup
- `src/app/api/zoho/save-call/route.ts` - Stub endpoint for saving calls to Zoho
- `src/app/api/get-vehicles-for-call/route.ts` - Endpoint for getting vehicles during a call
- `src/lib/supabase.ts` - Supabase client configuration
- `next.config.ts` - Next.js configuration
- `public/` - Static assets

## Smart Call Pad (Redesigned)
The Call Pad uses a modern three-panel layout with AI-powered smart input parsing.

### Layout
- **Smart Input Bar** - Single input at top for typing anything (phone, address, city, dates, etc.)
- **Left Panel** - Agent & Caller details, Trip details, Locations
- **Middle Panel** - Quoted Summary, Pricing, Payment, Lead Status, Notes
- **Right Panel** - Large 3-column Vehicle Gallery (dark theme)

### Smart Input Parsing
Type anything in the main input box and the system will auto-detect:
- **Phone numbers** - 10-digit numbers detected as phone
- **Email addresses** - Detected by @ symbol
- **ZIP codes** - 5-digit codes
- **Cities** - Common city names recognized
- **Dates** - Various formats (1/15, January 15th)
- **Times** - Various formats (6pm, 6:00 PM)
- **Passenger counts** - "30 people", "30 passengers"
- **Hours** - "5 hours", "5 hrs"
- **Event types** - Wedding, Prom, Birthday, etc.
- **Addresses** - Uses OpenAI to detect pickup, destination, or drop-off locations

Detected data appears as colored chips with confirm/reject buttons. Agents can:
- Change the detected type via dropdown
- Confirm to move data to the appropriate field
- Reject to remove the chip

### Vehicle Gallery
- Large 3-column grid with dark theme
- Vehicle cards show: photo, name, capacity badge, category tag, price
- Click "Quote" to mark vehicles as discussed
- Quoted vehicles appear in summary with running total

### Pricing & Payment
- Total quoted price (auto-calculated from quoted vehicles)
- Deposit: 50% normally, 100% if event is within 7 days
- Balance due (auto-calculated)
- Checkboxes for: Tip included, Paid by Card, Paid by Cash

### Lead Status
- Options: New, Not Quoted, Quoted, Booked, Closed, Cancelled
- Auto-sets to "Quoted" when saving with quoted vehicles

Note: Zoho integration endpoints are currently stubs. To enable real Zoho integration, you'll need:
- A Zoho OAuth app with access/refresh tokens
- Real field API names for custom fields
- Replace stub endpoints with actual Zoho API calls

## Environment Variables Required
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI API key (auto-provided by Replit AI Integrations)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI base URL (auto-provided by Replit AI Integrations)

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
- OpenAI (via Replit AI Integrations) for smart input parsing
