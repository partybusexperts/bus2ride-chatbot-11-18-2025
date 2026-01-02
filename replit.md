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
- **Passenger counts** - "30 people", "30 passengers", "five people", "twenty passengers" (word numbers supported)
- **Hours** - "5 hours", "5 hrs"
- **Event types** - Wedding, Prom, Birthday, etc.
- **Addresses** - "pu at [location]", "do at [dropoff]" (adds to Trip Notes AND populates field)
- **Places/Venues** - TopGolf, bars, restaurants, hotels detected and looked up via OpenAI
- **Complex addresses** - Uses OpenAI for address parsing

### Venue/Place Lookup with Confirmation
When a venue is mentioned (e.g., "TopGolf Scottsdale", "480 bar", "Dave & Busters"):
- System detects venue keywords (bar, grill, restaurant, hotel, TopGolf, etc.)
- Looks up the real address using OpenAI with the current service area as context
- **Addresses go to "Needs Customer Confirmation" section first** - agent must verify with customer
- Agent clicks Confirm to add to trip notes, or Reject to discard
- Prevents incorrect addresses from being sent to CRM

### Needs Customer Confirmation Section
Yellow warning section appears when addresses need verification:
- Shows what customer said vs. looked-up address
- Color-coded by type: Pickup (green), Drop-off (red), Stop (yellow)
- Confirm button applies the address
- Reject button discards it
- Warning badge on Save button when unconfirmed items exist

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
- **Smart Sorting** - When passengers are specified, vehicles meeting the passenger requirement appear first (sorted by capacity), followed by smaller vehicles (sorted largest first, closest to requirement)
- All vehicles are shown regardless of passenger count - nothing is hidden
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
Shows all vehicle info in an expanded modal with interactive pricing selection:
- **Photos** - Up to 4 vehicle photos displayed in grid
- **Pricing Type Buttons** - Switch between pricing tiers:
  - Standard (default)
  - Prom (if available for city)
  - Before 5PM (if available)
  - Apr/May Weekend (if available)
  - Transfer (one-way)
- **Hour Selection Buttons** - Click to select different hours (3hr, 4hr, 5hr, etc.)
- **Quote Calculation** - Live updates based on selected tier and hours:
  - Per hour rate, Deposit amount, Balance due
- **Similar Options** - Shows up to 5 comparable vehicles based on:
  - Similar capacity (within 5-20 passengers)
  - Similar category (limo, party bus, etc.)
  - Similar price range
  - Click any suggestion to view its pricing
- **Custom Instructions** - Vehicle-specific notes if available
- **Add to Quote Button** - Shows selected price and adds to quoted vehicles

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
- **Save to Zoho** - Saves call data to Zoho CRM with smart duplicate detection
- **Send Quote** - Emails quote to customer (requires quoted vehicles + email address)

### Lead Status
- Options: New, Not Quoted, Quoted, Booked, Closed, Cancelled
- Auto-sets to "Quoted" when saving with quoted vehicles

## Zoho CRM Integration
The app now has full Zoho CRM integration for lead management.

### How It Works
1. **Save to Zoho** button first checks if customer exists by phone or email
2. If **new customer**: Creates a new lead in Zoho with all call data
3. If **existing customer**: Shows a confirmation modal with proposed changes
   - Displays old value vs. new value for each field that would change
   - Agent can approve or cancel the update
   - Shows changes like: "85249 → Chandler, AZ 85249"

### Zoho API Endpoints
- `src/app/api/zoho/auth/route.ts` - OAuth token management (refresh token flow)
- `src/app/api/zoho/find-lead/route.ts` - Search leads by phone or email
- `src/app/api/zoho/save-call/route.ts` - Create or update leads

### Lead Data Mapped to Zoho
- First_Name, Last_Name (parsed from caller name)
- Email, Phone
- City (from cityOrZip)
- Street (from pickup address)
- Description (trip notes, quoted vehicles, pricing summary)
- Lead_Status

## Environment Variables Required
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI API key (auto-provided by Replit AI Integrations)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI base URL (auto-provided by Replit AI Integrations)
- `ZOHO_CLIENT_ID` - Zoho OAuth Client ID
- `ZOHO_CLIENT_SECRET` - Zoho OAuth Client Secret
- `ZOHO_REFRESH_TOKEN` - Zoho OAuth Refresh Token (for token refresh flow)

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
- Next.js 16.1.1 with Turbopack
- React 19
- Supabase for database
- TypeScript
- OpenAI (via Replit AI Integrations) for smart input parsing
