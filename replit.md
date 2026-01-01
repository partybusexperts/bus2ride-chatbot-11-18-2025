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
- `src/app/api/vehicle-recommendation/route.ts` - AI-powered selling points generator
- `src/app/api/places/lookup/route.ts` - AI-powered venue/place address lookup
- `src/lib/supabase.ts` - Supabase client configuration
- `next.config.ts` - Next.js configuration
- `public/` - Static assets

## Smart Call Pad (Redesigned)
The Call Pad uses a modern three-panel layout with AI-powered smart input parsing.

### Layout
- **Smart Input Bar** - Single input at top for typing anything (phone, address, city, dates, etc.)
- **Left Panel** - Agent & Customer (blue), Trip Details (green), Locations (yellow)
- **Middle Panel** - Quoted Summary (purple), Pricing, Payment (cyan), Lead Status (red)
- **Right Panel** - Large 3-column Vehicle Gallery (dark theme)

### Color-Coded Sections
Each section has a unique background and border color for easy agent identification:
- **Agent & Customer** - Blue (#eff6ff, #3b82f6)
- **Trip Details** - Green (#f0fdf4, #22c55e)
- **Locations** - Yellow (#fefce8, #eab308)
- **Quoted Summary** - Purple (#faf5ff, #a855f7)
- **Payment** - Cyan (#ecfeff, #06b6d4)
- **Lead Status** - Red (#fef2f2, #ef4444)

### Agent Quick-Select
Instead of a dropdown, agents click their name button for one-tap selection:
- Floyd, Marcus, Sarah, Jennifer, David, Other
- Selected agent is highlighted with blue border and background

### Smart Input Parsing
Type comma-separated entries in the main input box. Example:
`chicago, may 25th, wedding, pu at 9pm, 30 passengers`

The system auto-detects:
- **Phone numbers** - 10-digit numbers detected as phone
- **Email addresses** - Detected by @ symbol
- **ZIP codes** - 5-digit codes
- **Cities** - Common city names recognized
- **Dates** - Various formats (1/15, January 15th, may 25th)
- **Times** - Various formats (6pm, 6:00 PM)
- **Pickup time** - "pu at 9pm" or "pickup at 9pm"
- **Passenger counts** - "30 people", "30 passengers"
- **Hours** - "5 hours", "5 hrs"
- **Event types** - Wedding, Prom, Birthday, etc.
- **Addresses** - "pu at [location]", "do at [dropoff]" (adds to Trip Notes AND populates field)
- **Places/Venues** - TopGolf, bars, restaurants, hotels detected and looked up via OpenAI
- **Complex addresses** - Uses OpenAI for address parsing

### Venue/Place Lookup
When a venue is mentioned (e.g., "TopGolf Scottsdale", "480 bar", "Dave & Busters"):
- System detects venue keywords (bar, grill, restaurant, hotel, TopGolf, etc.)
- Looks up the real address using OpenAI with the current service area as context
- Adds to Trip Notes as "Stop: [venue name] - [full address]"
- Works with single entries like "TopGolf Scottsdale" by extracting the city from the text

### Multiple Cities
When multiple cities are entered (e.g., first "phoenix", then "mesa"):
- Previous cities appear as gray chips below the City/ZIP field
- Old cities are dismissable with × button
- Current active city drives vehicle search
- History helps track multi-city inquiries

### City Disambiguation
For ambiguous city names (cities with the same name in multiple states):
- System detects: westmont, springfield, clinton, franklin, madison, georgetown, greenville, bristol, auburn, oxford, riverside, fairfield, manchester, columbia, lexington
- Yellow popup shows state buttons (e.g., IL, NJ, CA, PA for Westmont)
- Clicking state button sets city as "Westmont, IL"
- Also supports abbreviations: nyc, la, sf, dc, philly

**Auto-Population:** High-confidence detections (80%+) automatically populate fields and show as confirmed chips with green checkmarks.

**Bulk Actions:** "Confirm All" and "Reject All" buttons for quick chip management.

Agents can still:
- Change the detected type via dropdown
- Confirm individual chips to move data to fields
- Reject chips to remove them

### Results Dashboard
A live dashboard at the top shows:
- Location, Event, Date, Passengers, Hours
- Vehicle count, Quoted count, Current Price, Deposit
All update in real-time as data is entered. Shows the most recently quoted vehicle's pricing.

### Vehicle Type Detection
The system recognizes vehicle preferences:
- Limousine, Limo, Stretch Limo
- Party Bus, Limo Bus
- Shuttle, Sprinter, Executive
- Charter Bus, Coach
- Sedan, SUV, Hummer
- Trolley, Vintage, Rolls Royce, Bentley

### Vehicle Gallery
- Large 3-column grid with dark theme
- Vehicle cards show: photo, name, capacity badge, category tag, price
- Click "Quote" to mark vehicles as discussed - triggers AI selling points
- Click vehicle photo/name to see all photos in fullscreen gallery
- Click "$" button to see all pricing tiers modal
- Quoted vehicles appear in summary with running total

### Gallery Filters
- **Sort by** - Price Low to High, Price High to Low, Capacity
- **Rate Focus** - 3hr, 4hr, 5hr, 6hr, 8hr rate options (dynamically updates all vehicle prices)
- **Vehicle Type Checkboxes** - Party Bus, Limo, Shuttle, Car/SUV
- **One Way Transfer** - Filter for transfer-capable vehicles only
- **Find More Vehicles** - Button to search web for vendors and alert manager

### Color-Coded Fields
- **Green border/background** - Field is filled with data
- **Red/pink border/background** - Field is empty (missing info)

### Pricing Modal ($ button)
Shows all vehicle info in an expanded modal:
- **Photos** - All vehicle photos from image_main, image_2, image_3, and gallery_all
- **All Pricing from Database** - Every non-null pricing tier from Supabase:
  - Standard rates (3hr, 4hr, 5hr, 6hr, 7hr, 8hr, 9hr, 10hr)
  - Prom rates (6hr, 7hr, 8hr, 9hr, 10hr)
  - Before 5PM rates (3hr, 4hr, 5hr, 6hr, 7hr)
  - April/May Weekend rates (5hr, 6hr, 7hr, 8hr, 9hr)
  - One Way Transfer price
- **Quote Calculation** - Current rate based on selected hours, per hour rate, deposit, balance due
- **Custom Instructions** - Vehicle-specific notes if available
Also shows: Per hour rate, Deposit amount, Balance due

### AI Selling Points
When an agent quotes a vehicle, OpenAI generates 3 concise selling points based on:
- Vehicle type and capacity
- Event type and passenger count
- Location and date context
Displayed in a cyan panel above the vehicle gallery

### Pricing & Payment
- Total quoted price (auto-calculated from quoted vehicles)
- Deposit: 50% normally, 100% if event is within 7 days
- **Same-day booking warning** - Red alert prompting cash payment or manager consultation
- Balance due (auto-calculated)
- Checkboxes for: Tip included, Paid by Card, Paid by Cash

### Agent Selection
- Agent dropdown with preset list (Floyd, Marcus, Sarah, Jennifer, David, Other)
- Selected agent tracked for Zoho integration

### Action Buttons
- **Save to Zoho** - Saves call data to Zoho CRM (stub, ready for integration)
- **Send Quote** - Emails quote to customer (requires quoted vehicles + email address)

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
