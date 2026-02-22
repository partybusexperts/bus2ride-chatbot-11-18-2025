import { NextRequest, NextResponse } from "next/server";
import { METRO_COORDS, haversineDistance, getDirection, getZipCoordinates, calculateDrivingDistance, findMetrosWithinTime } from "@/lib/geo-utils";

export async function POST(request: NextRequest) {
  try {
    const { zipCode, metroCity } = await request.json();

    if (!zipCode || !metroCity) {
      return NextResponse.json({ error: "Missing zipCode or metroCity" }, { status: 400 });
    }

    const metroCoords = METRO_COORDS[metroCity];
    if (!metroCoords) {
      return NextResponse.json({
        success: false,
        zipCode,
        metroCity,
        error: `Unknown metro city: ${metroCity}`,
        miles: null,
        minutes: null,
        description: null,
        cityName: null,
        state: null,
      });
    }

    const zipData = await getZipCoordinates(zipCode);
    if (!zipData) {
      return NextResponse.json({
        success: false,
        zipCode,
        metroCity,
        error: `Could not find coordinates for ZIP: ${zipCode}`,
        miles: null,
        minutes: null,
        description: null,
        cityName: null,
        state: null,
      });
    }

    const straightLineDistance = haversineDistance(zipData.lat, zipData.lng, metroCoords.lat, metroCoords.lng);
    const { miles: drivingMiles, minutes: drivingMinutes } = calculateDrivingDistance(straightLineDistance);
    
    const direction = getDirection(zipData.lat, zipData.lng, metroCoords.lat, metroCoords.lng);
    const distanceDesc = drivingMiles <= 10 ? 'Close-in' : 
                         drivingMiles <= 25 ? '' : 
                         drivingMiles <= 60 ? 'Far' : 'Very far';
    const description = `${distanceDesc} ${direction} suburbs`.trim().replace(/\s+/g, ' ');

    // Flag if this location is unreasonably far from the metro (likely wrong metro assignment)
    const outOfServiceArea = drivingMinutes >= 120;

    const nearbyMetros = findMetrosWithinTime(zipData.lat, zipData.lng, 105);

    return NextResponse.json({
      success: true,
      zipCode,
      metroCity,
      miles: drivingMiles,
      minutes: drivingMinutes,
      description,
      cityName: zipData.city,
      state: zipData.state,
      outOfServiceArea,
      nearbyMetros,
    });

  } catch (error) {
    console.error("Distance calculation error:", error);
    return NextResponse.json({ error: "Failed to calculate distance" }, { status: 500 });
  }
}
