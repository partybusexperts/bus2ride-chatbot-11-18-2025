import pLimit from 'p-limit';
import pRetry from 'p-retry';

const STATE_ABBREVIATIONS: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
  'district of columbia': 'DC'
};

const STATE_TO_ABBREVIATION = Object.fromEntries(
  Object.entries(STATE_ABBREVIATIONS).map(([name, abbr]) => [name.toLowerCase(), abbr])
);

const ABBREVIATION_TO_STATE = Object.fromEntries(
  Object.entries(STATE_ABBREVIATIONS).map(([name, abbr]) => [abbr.toLowerCase(), abbr])
);

export function parseLocationQuery(query: string): { city: string; state?: string } {
  const normalized = query.trim().replace(/\s+/g, ' ');
  
  const patterns = [
    /^(.+?),?\s+([A-Za-z]{2})$/,
    /^(.+?),\s+(.+)$/,
  ];
  
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match) {
      const city = match[1].trim();
      const stateInput = match[2].trim().toLowerCase();
      
      let stateAbbr = ABBREVIATION_TO_STATE[stateInput] || STATE_TO_ABBREVIATION[stateInput];
      
      if (stateAbbr) {
        return { city, state: stateAbbr };
      }
    }
  }
  
  for (const [stateName, abbr] of Object.entries(STATE_TO_ABBREVIATION)) {
    const stateRegex = new RegExp(`^(.+?)\\s+${stateName}$`, 'i');
    const match = normalized.match(stateRegex);
    if (match) {
      return { city: match[1].trim(), state: abbr };
    }
  }
  
  return { city: normalized };
}

export async function lookupZipsForCity(city: string, state?: string): Promise<string[]> {
  try {
    if (!state) {
      return [];
    }
    
    const cleanCity = city.replace(/\s+/g, '%20');
    const url = `https://api.zippopotam.us/us/${state}/${cleanCity}`;
    
    const response = await fetch(url, { 
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      console.log(`ZIP lookup failed for ${city}, ${state}: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (data.places && Array.isArray(data.places)) {
      return data.places.map((place: any) => place['post code']).filter(Boolean);
    }
    
    return [];
  } catch (error) {
    console.error('Error looking up ZIPs:', error);
    return [];
  }
}

const COMMON_STATES = ['TX', 'AZ', 'CA', 'NY', 'NJ', 'FL', 'GA', 'IL', 'PA', 'OH', 'NC', 'VA', 'WA', 'CO', 'TN', 'NV', 'LA', 'MD', 'MA', 'IN'];

export async function getZipsForLocation(query: string): Promise<{ zips: string[]; city: string; state?: string }> {
  const { city, state } = parseLocationQuery(query);
  
  console.log('ZIP lookup - parsed query:', query, '-> city:', city, 'state:', state);
  
  if (state) {
    const zips = await lookupZipsForCity(city, state);
    console.log('ZIP lookup - found zips:', zips);
    return { zips, city, state };
  }
  
  console.log('ZIP lookup - no state found, trying common states for city:', city);
  
  for (const tryState of COMMON_STATES) {
    const zips = await lookupZipsForCity(city, tryState);
    if (zips.length > 0) {
      console.log(`ZIP lookup - found ${zips.length} zips in state ${tryState} for city ${city}`);
      return { zips, city, state: tryState };
    }
  }
  
  console.log('ZIP lookup - no matches found in any common state');
  return { zips: [], city, state: undefined };
}

export async function getCityFromZip(zip: string): Promise<{ city: string; state: string } | null> {
  try {
    const result = await pRetry(async () => {
      const response = await fetch(`https://api.zippopotam.us/us/${zip}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      
      if (response.status === 429) {
        throw new Error('Rate limited');
      }
      
      if (!response.ok) {
        return null;
      }
      
      const data = await response.json();
      
      if (data.places && data.places.length > 0) {
        return {
          city: data.places[0]['place name'],
          state: data.places[0]['state abbreviation']
        };
      }
      
      return null;
    }, { retries: 3, minTimeout: 100 });
    
    return result;
  } catch (error) {
    return null;
  }
}

const cityToZipsCache = new Map<string, string[]>();
let cacheBuilt = false;
let cacheBuilding = false;

export async function buildCityZipIndex(zips: string[]): Promise<Map<string, string[]>> {
  if (cacheBuilt && cityToZipsCache.size > 0) {
    return cityToZipsCache;
  }
  
  if (cacheBuilding) {
    while (cacheBuilding) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return cityToZipsCache;
  }
  
  cacheBuilding = true;
  console.log(`Building city-ZIP index for ${zips.length} ZIPs...`);
  
  const limit = pLimit(3);
  let failedCount = 0;
  const failedZips: string[] = [];
  
  const results = await Promise.all(
    zips.map(zip => limit(async () => {
      await new Promise(resolve => setTimeout(resolve, 50));
      const result = await getCityFromZip(zip);
      if (result) {
        return { zip, city: result.city.toLowerCase(), state: result.state };
      }
      failedCount++;
      if (failedZips.length < 20) failedZips.push(zip);
      return null;
    }))
  );
  
  for (const result of results) {
    if (result) {
      const key = result.city;
      if (!cityToZipsCache.has(key)) {
        cityToZipsCache.set(key, []);
      }
      cityToZipsCache.get(key)!.push(result.zip);
    }
  }
  
  cacheBuilt = true;
  cacheBuilding = false;
  console.log(`City-ZIP index built with ${cityToZipsCache.size} cities, ${failedCount} ZIPs failed`);
  if (failedZips.length > 0) {
    console.log('Sample failed ZIPs:', failedZips.slice(0, 10));
  }
  
  const hasAzle = cityToZipsCache.has('azle');
  console.log('Cache contains azle:', hasAzle);
  
  return cityToZipsCache;
}

export function searchCityIndex(cityName: string): string[] {
  const searchTerm = cityName.toLowerCase().trim();
  
  console.log(`City index search for "${searchTerm}", cache has ${cityToZipsCache.size} cities`);
  
  if (cityToZipsCache.has(searchTerm)) {
    console.log(`Found exact match for "${searchTerm}"`);
    return cityToZipsCache.get(searchTerm) || [];
  }
  
  for (const [city, zips] of cityToZipsCache.entries()) {
    if (city.includes(searchTerm) || searchTerm.includes(city)) {
      console.log(`Found partial match: "${city}" for search "${searchTerm}"`);
      return zips;
    }
  }
  
  const sampleCities = Array.from(cityToZipsCache.keys()).slice(0, 10);
  console.log('Sample cities in cache:', sampleCities);
  
  return [];
}

export function isCacheBuilt(): boolean {
  return cacheBuilt;
}
