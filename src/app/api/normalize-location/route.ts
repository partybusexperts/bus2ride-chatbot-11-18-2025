import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const MAJOR_METROS = [
  'Phoenix', 'Chicago', 'Dallas', 'Houston', 'Austin', 'San Antonio',
  'Los Angeles', 'San Francisco', 'San Diego', 'San Jose',
  'Denver', 'Las Vegas', 'Seattle', 'Portland',
  'Atlanta', 'Miami', 'Tampa', 'Orlando', 'Jacksonville',
  'Philadelphia', 'New York', 'Boston', 'Washington',
  'Detroit', 'Minneapolis', 'St Louis', 'Kansas City',
  'Nashville', 'Charlotte', 'Indianapolis', 'Columbus',
  'Cleveland', 'Cincinnati', 'Pittsburgh', 'Baltimore',
  'New Orleans', 'Memphis', 'Louisville', 'Milwaukee',
  'Salt Lake City', 'Raleigh', 'Richmond', 'Virginia Beach',
  'Birmingham', 'Oklahoma City', 'Tucson', 'Albuquerque',
  'Sacramento', 'Fresno', 'Long Beach', 'Omaha',
  'Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Windsor', 'Winnipeg',
  'Napa', 'Santa Rosa', 'Spokane',
];

export async function POST(request: NextRequest) {
  try {
    const { location } = await request.json();

    if (!location) {
      return NextResponse.json({ error: "Missing location" }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a US geography expert. Given a city name, town, suburb, or ZIP code, determine which major metropolitan area it belongs to for vehicle rental service.

Available service areas (major metros): ${MAJOR_METROS.join(', ')}

Return ONLY a JSON object with these fields:
- metro: string (the major metro area from the list above, or null if not within 90 minutes of any)
- cityName: string (the actual city/town name for this location)
- state: string (2-letter state abbreviation)
- isRemote: boolean (true if location is 60+ minutes from the metro center)
- driveMinutes: number (estimated drive time to metro center)
- driveMiles: number (estimated distance in miles)

Rules:
- Only return a metro if the location is within approximately 90 minutes drive
- If location could be ambiguous (same name in multiple states), use context or default to most populous
- For ZIP codes, identify the city/town it belongs to
- Be accurate based on your knowledge of US/Canada geography`
        },
        {
          role: "user",
          content: `Location: ${location}\n\nWhat major metro does this belong to?`
        }
      ],
      temperature: 0.1,
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content || "";
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        return NextResponse.json({
          success: true,
          location,
          metro: data.metro || null,
          cityName: data.cityName || null,
          state: data.state || null,
          isRemote: data.isRemote || false,
          driveMinutes: data.driveMinutes || null,
          driveMiles: data.driveMiles || null,
        });
      }
    } catch (parseError) {
      console.error("Failed to parse normalize response:", content);
    }

    return NextResponse.json({
      success: false,
      location,
      metro: null,
      cityName: null,
      state: null,
      isRemote: false,
      driveMinutes: null,
      driveMiles: null,
    });

  } catch (error) {
    console.error("Location normalization error:", error);
    return NextResponse.json({ error: "Failed to normalize location" }, { status: 500 });
  }
}
