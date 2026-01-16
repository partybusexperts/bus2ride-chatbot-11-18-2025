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

export async function getZipsForLocation(query: string): Promise<{ zips: string[]; city: string; state?: string }> {
  const { city, state } = parseLocationQuery(query);
  
  console.log('ZIP lookup - parsed query:', query, '-> city:', city, 'state:', state);
  
  if (!state) {
    console.log('ZIP lookup - no state found, cannot lookup');
    return { zips: [], city, state: undefined };
  }
  
  const zips = await lookupZipsForCity(city, state);
  console.log('ZIP lookup - found zips:', zips);
  return { zips, city, state };
}
