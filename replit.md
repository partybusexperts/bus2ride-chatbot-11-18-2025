# Bus2Ride Vehicle Finder

## Overview
Bus2Ride Vehicle Finder is a Next.js application designed to streamline the process of searching and quoting vehicles like party buses, limos, and shuttle buses. It allows agents to efficiently find vehicles by location, manage customer inquiries, and integrate with CRM systems. The project aims to enhance agent productivity, improve customer experience, and provide a robust platform for managing vehicle rentals, leveraging AI for smart input parsing and vehicle recommendations.

## User Preferences
I prefer simple language and direct instructions. I want the agent to prioritize iterative development, making small, testable changes. Before making any major architectural changes or introducing new external dependencies, please ask for my approval. Ensure all code is well-documented, especially any AI integration logic. Do not make changes to files under the `public/` folder unless explicitly instructed.

## System Architecture

### UI/UX Decisions
The application features a modern, three-panel "Smart Call Pad" layout with distinct color-coded sections for easy agent navigation and identification of information. Each section has a unique background and border color (e.g., Agent & Customer in blue, Trip Details in green). Agents are selected via quick-select buttons rather than dropdowns. Critical information needing customer confirmation is highlighted in a yellow "Needs Customer Confirmation" section.

### Technical Implementations
- **Smart Input Parsing:** The system uses AI (OpenAI) to parse natural language input for various data points like agent names, phone numbers, emails, ZIP codes, cities, dates, times, passenger counts, event types, and venue lookups.
- **City Normalization:** Suburbs and small cities are automatically mapped to their nearest major metropolitan areas for vehicle searching (e.g., Mesa, AZ maps to Phoenix).
- **Nationwide City-to-ZIP Lookup:** When a city name search doesn't find direct matches, the system automatically looks up ZIP codes for that city via the zippopotam.us API and searches for vehicles serving those ZIP codes. This enables searching by any city name nationwide (e.g., "Azle Texas") even if that city isn't explicitly listed in the vehicle database.
- **Vehicle Gallery:** Vehicles are displayed in a large 3-column grid with a dark theme. Smart sorting prioritizes vehicles matching passenger requirements.
- **Pricing Modal:** An interactive modal displays detailed pricing tiers, hour selections, and calculates quotes. It also suggests similar vehicles based on capacity, category, and price.
- **AI Selling Points:** OpenAI generates 3 concise selling points for a quoted vehicle based on trip context.
- **Zoho CRM Integration:** Seamless integration with Zoho CRM allows for creating new leads or updating existing ones with selective field updates, based on phone number or email lookup.
- **RingCentral Integration:** Uses Telephony Session Notifications via webhook subscription for instant phone number display when calls come in. The webhook only processes Proceeding/Ringing states (ignores Answered/Disconnected/Missed calls). SSE pushes ringing calls immediately to the browser. Ringing calls display with prominent green pulsing animation, phone icon, and "NOW" timestamp. Falls back to Call Log API for historical data. Subscription is automatically created after OAuth connection.

### Feature Specifications
- **Real-time Results Dashboard:** A live dashboard updates with key trip details (location, event, date, passengers, hours, vehicle count, quoted price, deposit) as data is entered.
- **Dynamic Filtering:** Vehicle gallery supports filtering by type, sorting, and rate focus.
- **Color-Coded Fields:** Fields are visually indicated as filled (green) or empty/missing (red/pink).
- **Comprehensive Lead Data Mapping:** Detailed call information is mapped to specific Zoho CRM fields, including calculated values like `Day_of_Week` and `Drop_Off_Time`.
- **Multi-City Handling:** Supports multiple cities in an inquiry, with previous cities appearing as dismissible chips.
- **City Disambiguation:** Resolves ambiguous city names by prompting agents to select the correct state.

### System Design Choices
- **Technology Stack:** Built with Next.js 16.1.1 (with Turbopack), React 19, TypeScript, Supabase for the database, and integrated with OpenAI and RingCentral APIs.
- **API Endpoints:** A structured set of API routes handles vehicle searches, input parsing, Zoho CRM operations, RingCentral integration, and AI-powered lookups/calculations.

## External Dependencies
- **Supabase:** Used as the primary database for vehicle inventory and pricing information.
- **OpenAI:** Integrated via Replit AI Integrations for intelligent input parsing, venue/place address lookup, distance calculation, and generating AI selling points.
- **Zoho CRM:** Used for lead management, including creating new leads, updating existing ones, and tracking call data.
- **RingCentral:** Integrated for fetching recent inbound call logs to assist agents in populating phone numbers.