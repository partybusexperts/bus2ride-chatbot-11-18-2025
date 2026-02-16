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

const KNOWN_CITY_STATES: Record<string, string> = {
  // === ALABAMA ===
  'birmingham': 'AL', 'hoover': 'AL', 'vestavia hills': 'AL', 'mountain brook': 'AL', 'trussville': 'AL',
  'mobile': 'AL', 'daphne': 'AL', 'fairhope': 'AL', 'montgomery': 'AL', 'prattville': 'AL', 'huntsville': 'AL', 'tuscaloosa': 'AL',

  // === ALASKA ===
  'anchorage': 'AK', 'wasilla': 'AK', 'eagle river': 'AK',

  // === ARIZONA ===
  'phoenix': 'AZ', 'tucson': 'AZ', 'mesa': 'AZ', 'scottsdale': 'AZ', 'tempe': 'AZ', 'chandler': 'AZ',
  'gilbert': 'AZ', 'glendale az': 'AZ', 'sedona': 'AZ', 'flagstaff': 'AZ', 'surprise': 'AZ',
  'peoria az': 'AZ', 'goodyear': 'AZ', 'avondale': 'AZ', 'buckeye': 'AZ', 'queen creek': 'AZ',
  'maricopa': 'AZ', 'casa grande': 'AZ', 'oro valley': 'AZ',

  // === CALIFORNIA ===
  'los angeles': 'CA', 'san francisco': 'CA', 'san diego': 'CA', 'san jose': 'CA', 'sacramento': 'CA',
  'fresno': 'CA', 'long beach': 'CA', 'oakland': 'CA', 'bakersfield': 'CA', 'anaheim': 'CA',
  'santa rosa': 'CA', 'napa': 'CA', 'riverside': 'CA', 'irvine': 'CA', 'visalia': 'CA',
  'modesto': 'CA', 'stockton': 'CA', 'santa monica': 'CA', 'pasadena': 'CA', 'burbank': 'CA',
  'torrance': 'CA', 'pomona': 'CA', 'ontario ca': 'CA', 'rancho cucamonga': 'CA',
  'fontana': 'CA', 'san bernardino': 'CA', 'corona': 'CA', 'temecula': 'CA', 'murrieta': 'CA',
  'santa clarita': 'CA', 'palmdale': 'CA', 'lancaster ca': 'CA', 'el cajon': 'CA',
  'chula vista': 'CA', 'oceanside': 'CA', 'carlsbad': 'CA', 'escondido': 'CA',
  'berkeley': 'CA', 'hayward': 'CA', 'sunnyvale': 'CA', 'santa clara': 'CA', 'fremont': 'CA',
  'concord': 'CA', 'walnut creek': 'CA', 'san mateo': 'CA', 'redwood city': 'CA',
  'palo alto': 'CA', 'mountain view': 'CA', 'cupertino': 'CA', 'milpitas': 'CA',
  'elk grove': 'CA', 'roseville': 'CA', 'folsom': 'CA', 'davis': 'CA', 'clovis': 'CA',
  'calabasas': 'CA', 'beverly hills': 'CA', 'malibu': 'CA', 'west hollywood': 'CA',

  // === COLORADO ===
  'denver': 'CO', 'colorado springs': 'CO', 'boulder': 'CO', 'aurora co': 'CO',
  'lakewood co': 'CO', 'arvada': 'CO', 'westminster co': 'CO', 'thornton': 'CO',
  'centennial': 'CO', 'highlands ranch': 'CO', 'littleton': 'CO', 'parker': 'CO',
  'castle rock': 'CO', 'broomfield': 'CO', 'golden': 'CO', 'longmont': 'CO',
  'loveland': 'CO', 'fort collins': 'CO', 'greeley': 'CO',

  // === FLORIDA ===
  'miami': 'FL', 'tampa': 'FL', 'orlando': 'FL', 'jacksonville': 'FL', 'fort lauderdale': 'FL',
  'st petersburg': 'FL', 'sarasota': 'FL', 'naples': 'FL', 'clearwater': 'FL',
  'boca raton': 'FL', 'west palm beach': 'FL', 'coral gables': 'FL', 'hialeah': 'FL',
  'pembroke pines': 'FL', 'hollywood fl': 'FL', 'coral springs': 'FL', 'davie': 'FL',
  'kissimmee': 'FL', 'winter park': 'FL', 'altamonte springs': 'FL', 'sanford': 'FL',
  'daytona beach': 'FL', 'lakeland': 'FL', 'bradenton': 'FL', 'delray beach': 'FL',
  'boynton beach': 'FL', 'deerfield beach': 'FL', 'pompano beach': 'FL',
  'aventura': 'FL', 'weston': 'FL', 'plantation': 'FL', 'sunrise fl': 'FL',
  'jupiter': 'FL', 'palm beach gardens': 'FL', 'wellington fl': 'FL',
  'ocala': 'FL', 'gainesville fl': 'FL', 'tallahassee': 'FL', 'pensacola': 'FL',

  // === GEORGIA ===
  'atlanta': 'GA', 'savannah': 'GA', 'augusta': 'GA', 'marietta': 'GA', 'roswell': 'GA',
  'sandy springs': 'GA', 'alpharetta': 'GA', 'johns creek': 'GA', 'dunwoody': 'GA',
  'kennesaw': 'GA', 'lawrenceville': 'GA', 'duluth ga': 'GA', 'suwanee': 'GA',
  'cumming': 'GA', 'woodstock ga': 'GA', 'peachtree city': 'GA', 'newnan': 'GA',
  'mcdonough': 'GA', 'stockbridge': 'GA', 'conyers': 'GA', 'snellville': 'GA',

  // === ILLINOIS ===
  'chicago': 'IL', 'naperville': 'IL', 'aurora il': 'IL', 'rockford': 'IL',
  'glen ellyn': 'IL', 'wheaton': 'IL', 'downers grove': 'IL', 'lombard': 'IL', 'elmhurst': 'IL',
  'oak brook': 'IL', 'hinsdale': 'IL', 'clarendon hills': 'IL', 'western springs': 'IL',
  'la grange': 'IL', 'villa park': 'IL', 'addison': 'IL', 'carol stream': 'IL',
  'bloomingdale': 'IL', 'glendale heights': 'IL', 'hanover park': 'IL', 'bartlett': 'IL',
  'plainfield': 'IL', 'bolingbrook': 'IL', 'romeoville': 'IL', 'lockport': 'IL',
  'orland park': 'IL', 'tinley park': 'IL', 'oak lawn': 'IL', 'oak park': 'IL',
  'evanston': 'IL', 'skokie': 'IL', 'schaumburg': 'IL', 'joliet': 'IL', 'elgin': 'IL',
  'palatine': 'IL', 'arlington heights': 'IL', 'des plaines': 'IL', 'park ridge': 'IL',
  'mount prospect': 'IL', 'buffalo grove': 'IL', 'libertyville': 'IL', 'highland park il': 'IL',
  'lake forest il': 'IL', 'glenview': 'IL', 'northbrook': 'IL', 'deerfield il': 'IL',
  'hoffman estates': 'IL', 'streamwood': 'IL', 'crystal lake': 'IL', 'barrington': 'IL',
  'waukegan': 'IL', 'gurnee': 'IL', 'mundelein': 'IL', 'vernon hills': 'IL',
  'lisle': 'IL', 'woodridge': 'IL', 'darien': 'IL', 'westmont': 'IL', 'lemont': 'IL',
  'new lenox': 'IL', 'mokena': 'IL', 'frankfort': 'IL', 'matteson': 'IL',
  'homewood': 'IL', 'flossmoor': 'IL', 'calumet city': 'IL', 'berwyn': 'IL', 'cicero': 'IL',
  'wilmette': 'IL', 'winnetka': 'IL', 'glencoe': 'IL', 'kenilworth': 'IL',
  'niles il': 'IL', 'morton grove': 'IL', 'lincolnwood': 'IL', 'rolling meadows': 'IL',
  'carpentersville': 'IL', 'mchenry': 'IL', 'woodstock il': 'IL', 'lake zurich': 'IL',
  'st charles il': 'IL', 'geneva il': 'IL', 'batavia il': 'IL', 'warrenville': 'IL',
  'oswego': 'IL', 'yorkville': 'IL',

  // === INDIANA ===
  'indianapolis': 'IN', 'fort wayne': 'IN', 'carmel': 'IN', 'fishers': 'IN',
  'noblesville': 'IN', 'greenwood in': 'IN', 'zionsville': 'IN', 'brownsburg': 'IN',

  // === KENTUCKY ===
  'louisville': 'KY', 'lexington': 'KY', 'bowling green': 'KY', 'covington ky': 'KY',
  'florence ky': 'KY', 'newport ky': 'KY',

  // === LOUISIANA ===
  'new orleans': 'LA', 'baton rouge': 'LA', 'metairie': 'LA', 'kenner': 'LA',
  'slidell': 'LA', 'covington la': 'LA', 'mandeville': 'LA',

  // === MARYLAND ===
  'baltimore': 'MD', 'annapolis': 'MD', 'towson': 'MD', 'columbia md': 'MD',
  'rockville': 'MD', 'bethesda': 'MD', 'silver spring': 'MD', 'gaithersburg': 'MD',
  'germantown md': 'MD', 'frederick md': 'MD', 'bowie': 'MD', 'laurel md': 'MD',

  // === MASSACHUSETTS ===
  'boston': 'MA', 'cambridge': 'MA', 'worcester': 'MA', 'newton': 'MA', 'brookline': 'MA',
  'quincy': 'MA', 'somerville': 'MA', 'waltham': 'MA', 'framingham': 'MA', 'brockton': 'MA',
  'lowell': 'MA', 'salem ma': 'MA', 'lexington ma': 'MA',

  // === MICHIGAN ===
  'detroit': 'MI', 'grand rapids': 'MI', 'ann arbor': 'MI', 'dearborn': 'MI',
  'livonia': 'MI', 'troy mi': 'MI', 'royal oak': 'MI', 'novi': 'MI',
  'farmington hills': 'MI', 'southfield': 'MI', 'sterling heights': 'MI',
  'rochester hills': 'MI', 'canton mi': 'MI', 'kalamazoo': 'MI', 'muskegon': 'MI',

  // === MINNESOTA ===
  'minneapolis': 'MN', 'st paul': 'MN', 'bloomington mn': 'MN', 'eden prairie': 'MN',
  'plymouth mn': 'MN', 'maple grove': 'MN', 'eagan': 'MN', 'burnsville': 'MN',
  'woodbury mn': 'MN', 'edina': 'MN', 'minnetonka': 'MN',

  // === MISSOURI ===
  'kansas city': 'MO', 'st louis': 'MO', 'independence mo': 'MO', 'lees summit': 'MO',
  'springfield mo': 'MO', 'columbia mo': 'MO', 'st charles mo': 'MO', 'o fallon mo': 'MO',
  'chesterfield mo': 'MO', 'overland park': 'KS', 'olathe': 'KS', 'lenexa': 'KS',

  // === NEBRASKA ===
  'omaha': 'NE', 'bellevue ne': 'NE', 'papillion': 'NE', 'la vista': 'NE',
  'council bluffs': 'IA',

  // === NEVADA ===
  'las vegas': 'NV', 'henderson': 'NV', 'reno': 'NV', 'north las vegas': 'NV',

  // === NEW JERSEY ===
  'newark nj': 'NJ', 'jersey city': 'NJ', 'hoboken': 'NJ', 'elizabeth nj': 'NJ',
  'paterson nj': 'NJ', 'clifton nj': 'NJ', 'hackensack': 'NJ', 'paramus': 'NJ',
  'cherry hill': 'NJ', 'camden': 'NJ', 'princeton': 'NJ', 'trenton': 'NJ',

  // === NEW MEXICO ===
  'albuquerque': 'NM', 'santa fe': 'NM', 'rio rancho': 'NM', 'las cruces': 'NM',

  // === NEW YORK ===
  'new york': 'NY', 'brooklyn': 'NY', 'buffalo': 'NY', 'rochester': 'NY', 'syracuse': 'NY', 'albany': 'NY',
  'yonkers': 'NY', 'white plains': 'NY', 'new rochelle': 'NY', 'scarsdale': 'NY',
  'hempstead': 'NY', 'garden city': 'NY', 'great neck': 'NY',

  // === NORTH CAROLINA ===
  'charlotte': 'NC', 'raleigh': 'NC', 'durham': 'NC', 'greensboro': 'NC', 'winston salem': 'NC',
  'cary': 'NC', 'chapel hill': 'NC', 'apex': 'NC', 'huntersville': 'NC', 'cornelius': 'NC',
  'concord nc': 'NC', 'gastonia': 'NC', 'mooresville': 'NC', 'matthews': 'NC',

  // === OHIO ===
  'columbus': 'OH', 'cleveland': 'OH', 'cincinnati': 'OH', 'toledo': 'OH', 'maumee': 'OH',
  'dayton': 'OH', 'akron': 'OH', 'dublin oh': 'OH', 'westerville': 'OH', 'hilliard': 'OH',
  'mason oh': 'OH', 'west chester oh': 'OH', 'lakewood oh': 'OH', 'strongsville': 'OH',
  'solon': 'OH', 'hudson oh': 'OH', 'medina oh': 'OH', 'perrysburg': 'OH', 'sylvania oh': 'OH',

  // === OKLAHOMA ===
  'oklahoma city': 'OK', 'tulsa': 'OK', 'edmond': 'OK', 'norman': 'OK',
  'broken arrow': 'OK', 'owasso': 'OK',

  // === OREGON ===
  'portland': 'OR', 'beaverton': 'OR', 'hillsboro': 'OR', 'tigard': 'OR',
  'lake oswego': 'OR', 'gresham': 'OR', 'oregon city': 'OR',

  // === PENNSYLVANIA ===
  'philadelphia': 'PA', 'pittsburgh': 'PA', 'king of prussia': 'PA', 'west chester pa': 'PA',
  'doylestown': 'PA', 'media pa': 'PA', 'norristown': 'PA', 'mount lebanon': 'PA',
  'cranberry township': 'PA', 'monroeville': 'PA',

  // === RHODE ISLAND ===
  'providence': 'RI', 'cranston': 'RI', 'warwick ri': 'RI', 'newport ri': 'RI',

  // === TENNESSEE ===
  'nashville': 'TN', 'memphis': 'TN', 'knoxville': 'TN', 'chattanooga': 'TN',
  'franklin tn': 'TN', 'murfreesboro': 'TN', 'brentwood tn': 'TN', 'clarksville tn': 'TN',
  'germantown tn': 'TN', 'collierville': 'TN',

  // === TEXAS ===
  'dallas': 'TX', 'houston': 'TX', 'austin': 'TX', 'san antonio': 'TX', 'fort worth': 'TX',
  'el paso': 'TX', 'plano': 'TX', 'frisco': 'TX', 'mckinney': 'TX', 'arlington tx': 'TX',
  'irving': 'TX', 'garland': 'TX', 'denton tx': 'TX', 'richardson': 'TX', 'carrollton': 'TX',
  'flower mound': 'TX', 'southlake': 'TX', 'grapevine': 'TX', 'coppell': 'TX',
  'the woodlands': 'TX', 'sugar land': 'TX', 'katy': 'TX', 'pearland': 'TX',
  'league city': 'TX', 'cypress tx': 'TX', 'spring tx': 'TX', 'humble': 'TX', 'conroe': 'TX',
  'round rock': 'TX', 'cedar park': 'TX', 'georgetown tx': 'TX', 'pflugerville': 'TX',
  'new braunfels': 'TX', 'san marcos': 'TX', 'boerne': 'TX', 'schertz': 'TX',
  'grand prairie': 'TX', 'mesquite': 'TX', 'rowlett': 'TX', 'rockwall': 'TX',
  'lewisville': 'TX', 'mansfield tx': 'TX', 'midland tx': 'TX', 'odessa tx': 'TX',
  'corpus christi': 'TX', 'lubbock': 'TX', 'amarillo': 'TX', 'waco': 'TX',

  // === UTAH ===
  'salt lake city': 'UT', 'provo': 'UT', 'ogden': 'UT', 'orem': 'UT', 'lehi': 'UT',
  'sandy ut': 'UT', 'draper': 'UT', 'south jordan': 'UT', 'west jordan': 'UT',
  'layton': 'UT', 'park city': 'UT', 'st george ut': 'UT',

  // === VIRGINIA ===
  'richmond': 'VA', 'virginia beach': 'VA', 'norfolk': 'VA', 'chesapeake': 'VA',
  'arlington va': 'VA', 'alexandria': 'VA', 'fairfax': 'VA', 'reston': 'VA',
  'mclean': 'VA', 'ashburn': 'VA', 'herndon': 'VA', 'manassas': 'VA',
  'newport news': 'VA', 'hampton': 'VA', 'williamsburg': 'VA',

  // === WASHINGTON ===
  'seattle': 'WA', 'tacoma': 'WA', 'spokane': 'WA', 'bellevue': 'WA',
  'kirkland': 'WA', 'redmond': 'WA', 'everett': 'WA', 'renton': 'WA',
  'kent wa': 'WA', 'federal way': 'WA', 'auburn wa': 'WA', 'olympia': 'WA',
  'bothell': 'WA', 'lynnwood': 'WA', 'issaquah': 'WA', 'sammamish': 'WA',
  'puyallup': 'WA', 'lakewood wa': 'WA', 'bremerton': 'WA',

  // === WASHINGTON DC ===
  'washington': 'DC', 'washington dc': 'DC',

  // === WISCONSIN ===
  'milwaukee': 'WI', 'madison': 'WI', 'waukesha': 'WI', 'brookfield wi': 'WI',
  'wauwatosa': 'WI', 'kenosha': 'WI', 'racine': 'WI', 'green bay': 'WI',

  // === DELAWARE ===
  'wilmington de': 'DE', 'newark de': 'DE', 'dover': 'DE',
};

const COMMON_STATES = ['CA', 'TX', 'AZ', 'FL', 'NY', 'NJ', 'GA', 'IL', 'PA', 'OH', 'NC', 'VA', 'WA', 'CO', 'TN', 'NV', 'LA', 'MD', 'MA', 'IN'];

export async function getZipsForLocation(query: string): Promise<{ zips: string[]; city: string; state?: string }> {
  const { city, state } = parseLocationQuery(query);
  
  if (state) {
    const zips = await lookupZipsForCity(city, state);
    return { zips, city, state };
  }
  
  const knownState = KNOWN_CITY_STATES[city.toLowerCase()];
  if (knownState) {
    const zips = await lookupZipsForCity(city, knownState);
    if (zips.length > 0) {
      return { zips, city, state: knownState };
    }
  }
  
  for (const tryState of COMMON_STATES) {
    if (tryState === knownState) continue;
    const zips = await lookupZipsForCity(city, tryState);
    if (zips.length > 0) {
      return { zips, city, state: tryState };
    }
  }
  
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
  console.log(`City-ZIP index built with ${cityToZipsCache.size} cities`);
  
  return cityToZipsCache;
}

export function searchCityIndex(cityName: string): string[] {
  const searchTerm = cityName.toLowerCase().trim();
  
  if (cityToZipsCache.has(searchTerm)) {
    return cityToZipsCache.get(searchTerm) || [];
  }
  
  for (const [city, zips] of cityToZipsCache.entries()) {
    if (city.includes(searchTerm) || searchTerm.includes(city)) {
      return zips;
    }
  }
  
  return [];
}

export function isCacheBuilt(): boolean {
  return cacheBuilt;
}
