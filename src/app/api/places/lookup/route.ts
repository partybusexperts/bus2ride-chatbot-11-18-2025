import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface PlaceLookupRequest {
  placeName: string;
  nearLocation: string;
  context?: 'pickup' | 'destination' | 'stop';
}

interface PlaceResult {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  fullAddress: string;
  confidence: number;
  placeType: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: PlaceLookupRequest = await request.json();
    const { placeName, nearLocation, context } = body;

    if (!placeName || !nearLocation) {
      return NextResponse.json(
        { error: "Place name and location required" },
        { status: 400 }
      );
    }

    const prompt = `You are a place lookup assistant. Find the real address for this venue/place.

Place to find: "${placeName}"
Search near: "${nearLocation}" (this could be a ZIP code, city, or state)
Context: ${context || 'general location'}

Instructions:
1. Find the most likely match for this place name near the given location
2. Prioritize businesses, restaurants, bars, venues, attractions within ~50 miles of the location
3. If it's a chain (like TopGolf, Dave & Busters, etc.), find the specific location nearest to the search area
4. Return the full street address

Respond in this exact JSON format:
{
  "found": true or false,
  "name": "Official business name",
  "address": "Street address only (e.g., 123 Main St)",
  "city": "City name",
  "state": "State abbreviation (e.g., AZ)",
  "zip": "ZIP code",
  "placeType": "bar|restaurant|venue|attraction|hotel|airport|other",
  "confidence": 0.0 to 1.0 (how confident you are this is correct)
}

If you cannot find the place, respond:
{
  "found": false,
  "name": "${placeName}",
  "address": "",
  "city": "",
  "state": "",
  "zip": "",
  "placeType": "unknown",
  "confidence": 0
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful place lookup assistant. Always respond with valid JSON only." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 300,
    });

    const responseText = completion.choices[0]?.message?.content || "";
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ found: false, error: "Failed to parse response" });
    }

    const result = JSON.parse(jsonMatch[0]);
    
    if (result.found && result.address) {
      const fullAddress = `${result.address}, ${result.city}, ${result.state} ${result.zip}`;
      return NextResponse.json({
        found: true,
        name: result.name,
        address: result.address,
        city: result.city,
        state: result.state,
        zip: result.zip,
        fullAddress,
        placeType: result.placeType,
        confidence: result.confidence,
      });
    }

    return NextResponse.json({ found: false, name: placeName });

  } catch (error) {
    console.error("Place lookup error:", error);
    return NextResponse.json(
      { found: false, error: "Failed to lookup place" },
      { status: 500 }
    );
  }
}
