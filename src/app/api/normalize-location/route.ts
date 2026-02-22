import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { METRO_COORDS, haversineDistance, getZipCoordinates, calculateDrivingDistance, findNearestMetro, findNearestMetroUnlimited, findMetrosWithinTime } from "@/lib/geo-utils";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const MAJOR_METROS = Object.keys(METRO_COORDS);

export async function POST(request: NextRequest) {
  try {
    const { location } = await request.json();

    if (!location) {
      return NextResponse.json({ error: "Missing location" }, { status: 400 });
    }

    const isZipCode = /^\d{5}(-\d{4})?$/.test(location.trim());
    
    if (isZipCode) {
      const zipData = await getZipCoordinates(location.trim());
      if (zipData) {
        const nearest = findNearestMetro(zipData.lat, zipData.lng);
        const nearbyMetros = findMetrosWithinTime(zipData.lat, zipData.lng, 105);

        if (nearest) {
          const metroCoords = METRO_COORDS[nearest.metro];
          const straightLine = haversineDistance(zipData.lat, zipData.lng, metroCoords.lat, metroCoords.lng);
          const { miles, minutes } = calculateDrivingDistance(straightLine);
          
          return NextResponse.json({
            success: true,
            location,
            metro: nearest.metro,
            cityName: zipData.city,
            state: zipData.state,
            isRemote: minutes >= 60,
            outOfServiceArea: false,
            driveMinutes: minutes,
            driveMiles: miles,
            nearbyMetros,
          });
        }
        
        const nearestAnyway = findNearestMetroUnlimited(zipData.lat, zipData.lng);
        return NextResponse.json({
          success: true,
          location,
          metro: null,
          cityName: zipData.city,
          state: zipData.state,
          isRemote: true,
          outOfServiceArea: true,
          nearestMetroName: nearestAnyway.metro,
          nearestMetroMiles: nearestAnyway.drivingMiles,
          nearestMetroMinutes: nearestAnyway.drivingMinutes,
          driveMinutes: nearestAnyway.drivingMinutes,
          driveMiles: nearestAnyway.drivingMiles,
          nearbyMetros,
        });
      }
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a US geography expert. Given a city name, town, or suburb, identify which major metropolitan area it belongs to.

Available service areas (major metros): ${MAJOR_METROS.join(', ')}

Return ONLY a JSON object with these fields:
- metro: string (the major metro area from the list above, or null if not near any)
- cityName: string (the actual city/town name)
- state: string (2-letter state abbreviation)
- lat: number (approximate latitude of the city center)
- lng: number (approximate longitude of the city center)

Rules:
- If location could be ambiguous (same name in multiple states), use context or default to most populous
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
        
        let driveMinutes: number | null = null;
        let driveMiles: number | null = null;
        let isRemote = false;
        
        let nearbyMetros: Array<{ metro: string; drivingMiles: number; drivingMinutes: number }> = [];

        if (data.metro && METRO_COORDS[data.metro] && data.lat && data.lng) {
          const metroCoords = METRO_COORDS[data.metro];
          const straightLine = haversineDistance(data.lat, data.lng, metroCoords.lat, metroCoords.lng);
          const driving = calculateDrivingDistance(straightLine);
          driveMinutes = driving.minutes;
          driveMiles = driving.miles;
          isRemote = driveMinutes >= 60;
          nearbyMetros = findMetrosWithinTime(data.lat, data.lng, 105);
        }
        
        return NextResponse.json({
          success: true,
          location,
          metro: data.metro || null,
          cityName: data.cityName || null,
          state: data.state || null,
          isRemote,
          driveMinutes,
          driveMiles,
          nearbyMetros,
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
