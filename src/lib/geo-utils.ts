export const METRO_COORDS: Record<string, { lat: number; lng: number }> = {
  'Phoenix': { lat: 33.4484, lng: -112.0740 },
  'Chicago': { lat: 41.8781, lng: -87.6298 },
  'Dallas': { lat: 32.7767, lng: -96.7970 },
  'Houston': { lat: 29.7604, lng: -95.3698 },
  'Austin': { lat: 30.2672, lng: -97.7431 },
  'San Antonio': { lat: 29.4241, lng: -98.4936 },
  'Los Angeles': { lat: 34.0522, lng: -118.2437 },
  'San Francisco': { lat: 37.7749, lng: -122.4194 },
  'San Diego': { lat: 32.7157, lng: -117.1611 },
  'San Jose': { lat: 37.3382, lng: -121.8863 },
  'Denver': { lat: 39.7392, lng: -104.9903 },
  'Las Vegas': { lat: 36.1699, lng: -115.1398 },
  'Seattle': { lat: 47.6062, lng: -122.3321 },
  'Portland': { lat: 45.5152, lng: -122.6784 },
  'Atlanta': { lat: 33.7490, lng: -84.3880 },
  'Miami': { lat: 25.7617, lng: -80.1918 },
  'Tampa': { lat: 27.9506, lng: -82.4572 },
  'Orlando': { lat: 28.5383, lng: -81.3792 },
  'New York': { lat: 40.7128, lng: -74.0060 },
  'Boston': { lat: 42.3601, lng: -71.0589 },
  'Washington': { lat: 38.9072, lng: -77.0369 },
  'Detroit': { lat: 42.3314, lng: -83.0458 },
  'Minneapolis': { lat: 44.9778, lng: -93.2650 },
  'Nashville': { lat: 36.1627, lng: -86.7816 },
  'Charlotte': { lat: 35.2271, lng: -80.8431 },
  'Indianapolis': { lat: 39.7684, lng: -86.1581 },
  'Columbus': { lat: 39.9612, lng: -82.9988 },
  'Cleveland': { lat: 41.4993, lng: -81.6944 },
  'Cincinnati': { lat: 39.1031, lng: -84.5120 },
  'Pittsburgh': { lat: 40.4406, lng: -79.9959 },
  'Baltimore': { lat: 39.2904, lng: -76.6122 },
  'Philadelphia': { lat: 39.9526, lng: -75.1652 },
  'St Louis': { lat: 38.6270, lng: -90.1994 },
  'Kansas City': { lat: 39.0997, lng: -94.5786 },
  'Salt Lake City': { lat: 40.7608, lng: -111.8910 },
  'Tucson': { lat: 32.2226, lng: -110.9747 },
  'Albuquerque': { lat: 35.0844, lng: -106.6504 },
  'Sacramento': { lat: 38.5816, lng: -121.4944 },
  'Fresno': { lat: 36.7378, lng: -119.7871 },
  'Omaha': { lat: 41.2565, lng: -95.9345 },
  'Raleigh': { lat: 35.7796, lng: -78.6382 },
  'Memphis': { lat: 35.1495, lng: -90.0490 },
  'Louisville': { lat: 38.2527, lng: -85.7585 },
  'Lexington': { lat: 38.0406, lng: -84.5037 },
  'Milwaukee': { lat: 43.0389, lng: -87.9065 },
  'Oklahoma City': { lat: 35.4676, lng: -97.5164 },
  'Tulsa': { lat: 36.1540, lng: -95.9928 },
  'Jacksonville': { lat: 30.3322, lng: -81.6557 },
  'New Orleans': { lat: 29.9511, lng: -90.0715 },
  'Birmingham': { lat: 33.5186, lng: -86.8104 },
  'Mobile': { lat: 30.6954, lng: -88.0399 },
  'Montgomery': { lat: 32.3792, lng: -86.3077 },
  'Richmond': { lat: 37.5407, lng: -77.4360 },
  'Virginia Beach': { lat: 36.8529, lng: -75.9780 },
  'Long Beach': { lat: 33.7701, lng: -118.1937 },
  'Napa': { lat: 38.2975, lng: -122.2869 },
  'Santa Rosa': { lat: 38.4404, lng: -122.7141 },
  'Spokane': { lat: 47.6588, lng: -117.4260 },
  'Anchorage': { lat: 61.2181, lng: -149.9003 },
  'Grand Rapids': { lat: 42.9634, lng: -85.6681 },
  'Providence': { lat: 41.8240, lng: -71.4128 },
  'Santa Fe': { lat: 35.6870, lng: -105.9378 },
  'Toronto': { lat: 43.6532, lng: -79.3832 },
  'Montreal': { lat: 45.5017, lng: -73.5673 },
  'Vancouver': { lat: 49.2827, lng: -123.1207 },
  'Calgary': { lat: 51.0447, lng: -114.0719 },
  'Windsor': { lat: 42.3149, lng: -83.0364 },
  'Winnipeg': { lat: 49.8951, lng: -97.1384 },
};

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function getDirection(fromLat: number, fromLng: number, toLat: number, toLng: number): string {
  const latDiff = fromLat - toLat;
  const lngDiff = fromLng - toLng;
  
  let direction = '';
  if (Math.abs(latDiff) > 0.05) {
    direction += latDiff > 0 ? 'North' : 'South';
  }
  if (Math.abs(lngDiff) > 0.05) {
    direction += lngDiff < 0 ? 'west' : 'east';
  }
  
  return direction || 'Central';
}

export async function getZipCoordinates(zip: string): Promise<{ lat: number; lng: number; city: string; state: string } | null> {
  try {
    const response = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.places && data.places.length > 0) {
      const place = data.places[0];
      return {
        lat: parseFloat(place.latitude),
        lng: parseFloat(place.longitude),
        city: place['place name'],
        state: place['state abbreviation'],
      };
    }
    return null;
  } catch (e) {
    console.error('ZIP lookup error:', e);
    return null;
  }
}

export function calculateDrivingDistance(straightLineDistance: number): { miles: number; minutes: number } {
  const drivingMiles = Math.round(straightLineDistance * 1.35);
  const minutesPerMile = drivingMiles <= 15 ? 1.8 : drivingMiles <= 35 ? 1.3 : 1.05;
  const drivingMinutes = Math.round(drivingMiles * minutesPerMile);
  return { miles: drivingMiles, minutes: drivingMinutes };
}

export function findNearestMetro(lat: number, lng: number, maxDrivingMiles: number = 75): { metro: string; distance: number; drivingMiles: number } | null {
  let nearestMetro: string | null = null;
  let nearestDistance = Infinity;
  
  for (const [metro, coords] of Object.entries(METRO_COORDS)) {
    const distance = haversineDistance(lat, lng, coords.lat, coords.lng);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestMetro = metro;
    }
  }
  
  if (nearestMetro) {
    const { miles: drivingMiles } = calculateDrivingDistance(nearestDistance);
    if (drivingMiles <= maxDrivingMiles) {
      return { metro: nearestMetro, distance: nearestDistance, drivingMiles };
    }
  }
  
  return null;
}
