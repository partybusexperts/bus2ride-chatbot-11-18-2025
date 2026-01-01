import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

type DetectedType = 
  | 'phone'
  | 'email'
  | 'zip'
  | 'city'
  | 'date'
  | 'time'
  | 'passengers'
  | 'hours'
  | 'pickup_address'
  | 'destination'
  | 'dropoff_address'
  | 'event_type'
  | 'vehicle_type'
  | 'name'
  | 'website'
  | 'place'
  | 'stop'
  | 'unknown';

interface DetectedItem {
  type: DetectedType;
  value: string;
  confidence: number;
  original: string;
}

const PHONE_REGEX = /^[\d\s\-\(\)\.]{10,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_REGEX = /^\d{5}(-\d{4})?$/;
const TIME_REGEX = /^(\d{1,2})(:\d{2})?\s*(am|pm|AM|PM)?$/;
const DATE_PATTERNS = [
  /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/,
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(st|nd|rd|th)?(,?\s*\d{4})?$/i,
];
const PASSENGERS_REGEX = /^(\d{1,3})\s*(people|passengers|pax|guests|persons)$/i;
const PASSENGERS_SHORT_REGEX = /^(\d{1,2})$/;
const HOURS_REGEX = /^(\d+(\.\d+)?)\s*(hours?|hrs?)?$/i;

const EVENT_KEYWORDS = [
  'wedding', 'prom', 'birthday', 'bachelor', 'bachelorette', 'graduation',
  'concert', 'party', 'quinceanera', 'anniversary', 'corporate', 'airport',
  'funeral', 'church', 'bar mitzvah', 'bat mitzvah', 'homecoming', 'formal',
];

const VEHICLE_TYPE_KEYWORDS: Record<string, string> = {
  'limousine': 'Limousine',
  'limo': 'Limousine',
  'stretch limo': 'Limousine',
  'stretch': 'Limousine',
  'party bus': 'Party Bus',
  'partybus': 'Party Bus',
  'limo bus': 'Limo Bus',
  'limobus': 'Limo Bus',
  'shuttle': 'Shuttle',
  'shuttle bus': 'Shuttle',
  'sprinter': 'Sprinter',
  'mercedes sprinter': 'Sprinter',
  'executive': 'Executive',
  'executive van': 'Executive',
  'charter': 'Charter Bus',
  'charter bus': 'Charter Bus',
  'coach': 'Charter Bus',
  'motor coach': 'Charter Bus',
  'sedan': 'Sedan',
  'suv': 'SUV',
  'escalade': 'SUV',
  'navigator': 'SUV',
  'hummer': 'Hummer',
  'h2': 'Hummer',
  'trolley': 'Trolley',
  'vintage': 'Vintage',
  'classic': 'Vintage',
  'rolls royce': 'Rolls Royce',
  'bentley': 'Bentley',
};

const CITY_KEYWORDS = [
  'phoenix', 'scottsdale', 'mesa', 'tempe', 'glendale', 'chandler', 'gilbert',
  'peoria', 'surprise', 'goodyear', 'avondale', 'tucson', 'las vegas', 'denver',
  'chicago', 'dallas', 'houston', 'austin', 'san antonio', 'los angeles',
  'san diego', 'san francisco', 'seattle', 'portland', 'atlanta', 'miami',
  'orlando', 'tampa', 'boston', 'new york', 'philadelphia', 'detroit',
  'minneapolis', 'st louis', 'kansas city', 'nashville', 'memphis', 'charlotte',
  'westmont', 'springfield', 'clinton', 'franklin', 'madison', 'georgetown',
  'greenville', 'bristol', 'auburn', 'oxford', 'riverside', 'fairfield',
  'manchester', 'columbia', 'lexington', 'nyc', 'la', 'sf', 'dc', 'philly',
];

const VENUE_KEYWORDS = [
  'topgolf', 'top golf', 'dave and busters', 'dave & busters', 'bowlero',
  'main event', 'lucky strike', 'pinstripes', 'k1 speed', 'andretti',
  'casino', 'hotel', 'resort', 'bar', 'grill', 'lounge', 'club', 'brewery',
  'winery', 'distillery', 'steakhouse', 'restaurant', 'pub', 'tavern',
  'arena', 'stadium', 'amphitheater', 'theater', 'theatre', 'venue',
  'country club', 'golf course', 'spa', 'salon', 'church', 'chapel',
  'airport', 'terminal', 'station', 'mall', 'plaza', 'center', 'centre',
  'field', 'park', 'ballpark', 'coliseum', 'dome', 'garden', 'gardens',
  'wrigley', 'fenway', 'yankee', 'dodger', 'soldier field', 'lambeau',
  'churchill downs', 'belmont', 'keeneland', 'saratoga',
];

const COMMON_FIRST_NAMES = [
  'james', 'john', 'robert', 'michael', 'david', 'william', 'richard', 'joseph', 'thomas', 'charles',
  'christopher', 'daniel', 'matthew', 'anthony', 'mark', 'donald', 'steven', 'paul', 'andrew', 'joshua',
  'kenneth', 'kevin', 'brian', 'george', 'timothy', 'ronald', 'edward', 'jason', 'jeffrey', 'ryan',
  'jacob', 'gary', 'nicholas', 'eric', 'jonathan', 'stephen', 'larry', 'justin', 'scott', 'brandon',
  'benjamin', 'samuel', 'raymond', 'gregory', 'frank', 'alexander', 'patrick', 'jack', 'dennis', 'jerry',
  'mary', 'patricia', 'jennifer', 'linda', 'elizabeth', 'barbara', 'susan', 'jessica', 'sarah', 'karen',
  'lisa', 'nancy', 'betty', 'margaret', 'sandra', 'ashley', 'kimberly', 'emily', 'donna', 'michelle',
  'dorothy', 'carol', 'amanda', 'melissa', 'deborah', 'stephanie', 'rebecca', 'sharon', 'laura', 'cynthia',
  'kathleen', 'amy', 'angela', 'shirley', 'anna', 'brenda', 'pamela', 'emma', 'nicole', 'helen',
  'samantha', 'katherine', 'christine', 'debra', 'rachel', 'carolyn', 'janet', 'catherine', 'maria', 'heather',
  'diane', 'ruth', 'julie', 'olivia', 'joyce', 'virginia', 'victoria', 'kelly', 'lauren', 'christina',
  'joe', 'mike', 'chris', 'matt', 'nick', 'tony', 'steve', 'dave', 'dan', 'jim', 'bob', 'tom', 'bill',
  'alex', 'ben', 'sam', 'max', 'jake', 'luke', 'adam', 'josh', 'kyle', 'sean', 'marcus', 'floyd', 'sarah',
];

function detectPattern(text: string): DetectedItem | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  
  const phoneClean = trimmed.replace(/^(phone|call|contact|cell|tel|mobile|#)[\s:]*|[\s:]+$/gi, '');
  const digitsOnly = phoneClean.replace(/\D/g, '');
  const hasValidPhoneChars = /^[\d\s\-\(\)\.]+$/.test(phoneClean);
  
  if (hasValidPhoneChars && (digitsOnly.length === 10 || digitsOnly.length === 11)) {
    const formatted = digitsOnly.length === 11 && digitsOnly[0] === '1'
      ? digitsOnly.slice(1)
      : digitsOnly;
    if (formatted.length === 10) {
      return {
        type: 'phone',
        value: `${formatted.slice(0,3)}-${formatted.slice(3,6)}-${formatted.slice(6)}`,
        confidence: 0.95,
        original: trimmed,
      };
    }
  }
  
  if (hasValidPhoneChars && digitsOnly.length > 11) {
    return null;
  }

  if (EMAIL_REGEX.test(trimmed)) {
    return { type: 'email', value: trimmed.toLowerCase(), confidence: 0.99, original: trimmed };
  }

  if (ZIP_REGEX.test(trimmed)) {
    return { type: 'zip', value: trimmed, confidence: 0.95, original: trimmed };
  }

  const lowerText = trimmed.toLowerCase();
  
  const cleanTypoDigits = (text: string): string => {
    return text.replace(/([a-zA-Z])(\d+)$/, '$1').trim();
  };
  
  const puPostfixMatch = lowerText.match(/^(.+?)\s+(is|=|->|as)\s*(pu|p\.u\.|p\/u|pickup|pick\s*-?\s*up)$/i);
  if (puPostfixMatch && puPostfixMatch[1]) {
    let place = cleanTypoDigits(puPostfixMatch[1].trim());
    if (place.length > 1) {
      return { type: 'pickup_address', value: place, confidence: 0.92, original: trimmed };
    }
  }
  
  const doPostfixMatch = lowerText.match(/^(.+?)\s+(is|=|->|as)\s*(do|d\.o\.|d\/o|dropoff|drop\s*-?\s*off)$/i);
  if (doPostfixMatch && doPostfixMatch[1]) {
    let place = cleanTypoDigits(doPostfixMatch[1].trim());
    if (place.length > 1) {
      return { type: 'dropoff_address', value: place, confidence: 0.92, original: trimmed };
    }
  }
  
  const puMatch = lowerText.match(/^(pu|p\.u\.|p\/u|pickup|pick\s*-?\s*up)\s*(at|@|:|-|–|is)?\s*(.+)/i);
  if (puMatch && puMatch[3]) {
    let rest = puMatch[3].trim();
    const timeCheck = rest.match(/^(\d{1,2})(:\d{2})?\s*(am|pm)?$/i);
    if (timeCheck) {
      return { type: 'time', value: rest, confidence: 0.9, original: trimmed };
    }
    rest = cleanTypoDigits(rest);
    if (rest.length > 1) {
      return { type: 'pickup_address', value: rest, confidence: 0.92, original: trimmed };
    }
  }
  
  const doMatch = lowerText.match(/^(do|d\.o\.|d\/o|dropoff|drop\s*-?\s*off)\s*(at|@|:|-|–|is)?\s*(.+)/i);
  if (doMatch && doMatch[3]) {
    let rest = doMatch[3].trim();
    const timeCheck = rest.match(/^(\d{1,2})(:\d{2})?\s*(am|pm)?$/i);
    if (timeCheck) {
      return { type: 'time', value: rest, confidence: 0.9, original: trimmed };
    }
    rest = cleanTypoDigits(rest);
    if (rest.length > 1) {
      return { type: 'dropoff_address', value: rest, confidence: 0.92, original: trimmed };
    }
  }
  
  const destMatch = lowerText.match(/^(to|going\s+to|destination|dest)\s+(.+)/i);
  if (destMatch && destMatch[2] && destMatch[2].length > 2) {
    return { type: 'destination', value: destMatch[2], confidence: 0.85, original: trimmed };
  }
  
  const nameMatch = trimmed.match(/^(customer|caller|name|cust)\s*:?\s*(.+)/i);
  if (nameMatch && nameMatch[2] && nameMatch[2].length > 2) {
    return { type: 'name', value: nameMatch[2], confidence: 0.85, original: trimmed };
  }
  
  const twoWordName = trimmed.match(/^([A-Z][a-z]+)\s+([A-Z][a-z]+)$/);
  if (twoWordName && trimmed.length >= 5 && trimmed.length <= 40) {
    const firstName = twoWordName[1].toLowerCase();
    const lastName = twoWordName[2].toLowerCase();
    const isNotCity = !CITY_KEYWORDS.some(c => c.toLowerCase() === firstName || c.toLowerCase() === trimmed.toLowerCase());
    const isNotVehicle = !Object.keys(VEHICLE_TYPE_KEYWORDS).some(v => v.toLowerCase() === trimmed.toLowerCase());
    const isNotEvent = !EVENT_KEYWORDS.some(e => e.toLowerCase() === trimmed.toLowerCase());
    const isNotVenue = !VENUE_KEYWORDS.some(v => firstName.includes(v) || lastName.includes(v) || trimmed.toLowerCase().includes(v));
    const isFirstNameCommon = COMMON_FIRST_NAMES.includes(firstName);
    if (isNotCity && isNotVehicle && isNotEvent && isNotVenue) {
      const confidence = isFirstNameCommon ? 0.9 : 0.75;
      return { type: 'name', value: trimmed, confidence, original: trimmed };
    }
  }
  
  if (COMMON_FIRST_NAMES.includes(lowerText)) {
    const capitalizedName = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
    return { type: 'name', value: capitalizedName, confidence: 0.88, original: trimmed };
  }

  if (TIME_REGEX.test(trimmed)) {
    return { type: 'time', value: trimmed, confidence: 0.9, original: trimmed };
  }

  for (const pattern of DATE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { type: 'date', value: trimmed, confidence: 0.9, original: trimmed };
    }
  }

  const passMatch = trimmed.match(PASSENGERS_REGEX);
  if (passMatch) {
    return { type: 'passengers', value: passMatch[1], confidence: 0.9, original: trimmed };
  }
  
  const passShortMatch = trimmed.match(PASSENGERS_SHORT_REGEX);
  if (passShortMatch) {
    const num = parseInt(passShortMatch[1], 10);
    if (num >= 2 && num <= 99) {
      return { type: 'passengers', value: passShortMatch[1], confidence: 0.85, original: trimmed };
    }
  }

  const hoursMatch = trimmed.match(HOURS_REGEX);
  if (hoursMatch) {
    return { type: 'hours', value: hoursMatch[1], confidence: 0.85, original: trimmed };
  }

  for (const event of EVENT_KEYWORDS) {
    if (lowerText === event || lowerText.startsWith(event + ' ') || lowerText.endsWith(' ' + event)) {
      return { type: 'event_type', value: trimmed, confidence: 0.9, original: trimmed };
    }
  }

  for (const [keyword, vehicleType] of Object.entries(VEHICLE_TYPE_KEYWORDS)) {
    if (lowerText === keyword || lowerText.includes(keyword)) {
      return { type: 'vehicle_type', value: vehicleType, confidence: 0.9, original: trimmed };
    }
  }

  for (const venue of VENUE_KEYWORDS) {
    if (lowerText.includes(venue)) {
      const isPickup = lowerText.includes('pu ') || lowerText.includes('pickup') || lowerText.includes('pick up');
      return { 
        type: isPickup ? 'pickup_address' : 'place', 
        value: trimmed, 
        confidence: 0.85, 
        original: trimmed 
      };
    }
  }

  const businessPattern = /\d{2,4}\s+(bar|grill|lounge|club|restaurant|steakhouse|brewery|pub|tavern)/i;
  if (businessPattern.test(trimmed)) {
    return { type: 'place', value: trimmed, confidence: 0.85, original: trimmed };
  }
  
  const namedVenuePattern = /(bar|grill|club|restaurant|pub|tavern|lounge|brewery|winery|steakhouse|venue|arena|stadium|hotel|resort|casino|theater|theatre)\s+(called|named)\s+\w+/i;
  if (namedVenuePattern.test(trimmed)) {
    return { type: 'place', value: trimmed, confidence: 0.9, original: trimmed };
  }
  
  const venueNearPattern = /\b(bar|grill|club|restaurant|pub|tavern|lounge|brewery|winery|steakhouse)\b.*\b(near|by|at|next\s+to|across\s+from)\b/i;
  if (venueNearPattern.test(trimmed)) {
    return { type: 'place', value: trimmed, confidence: 0.85, original: trimmed };
  }
  
  const cityVenuePattern = new RegExp(`^(${CITY_KEYWORDS.join('|')})\\s+(bar|grill|club|restaurant|pub|tavern|lounge|brewery|venue|hotel|casino)`, 'i');
  if (cityVenuePattern.test(trimmed)) {
    return { type: 'place', value: trimmed, confidence: 0.9, original: trimmed };
  }

  for (const city of CITY_KEYWORDS) {
    if (lowerText === city || lowerText.startsWith(city + ' ') || lowerText.includes(' ' + city)) {
      return { type: 'city', value: trimmed, confidence: 0.9, original: trimmed };
    }
  }

  return null;
}

async function parseWithAI(text: string): Promise<DetectedItem[]> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a parser for a bus/limo rental call center. Extract structured data from agent notes.

Return JSON array of detected items. Each item has:
- type: one of phone, email, zip, city, date, time, passengers, hours, pickup_address, destination, dropoff_address, event_type, name, website, unknown
- value: the extracted/cleaned value (WITHOUT the PU/DO prefix - just the place name)
- confidence: 0-1 confidence score
- original: the original text fragment

IMPORTANT - NAMES vs VENUES:
- Two capitalized words like "David Spade", "John Smith", "Mary Johnson" are PERSON NAMES, not venues
- Only mark as venue/place if it contains venue keywords like hotel, bar, restaurant, airport, TopGolf, etc.
- "David Spade" = name (confidence 0.9)
- "Dave and Busters" = place (contains venue words)
- "John Marriott" = name (even though Marriott is a hotel, "John Marriott" is a person)

IMPORTANT AGENT ABBREVIATIONS:
- "PU" or "pu" = pickup (pickup_address)
- "DO" or "do" = dropoff (dropoff_address)
- Agents use BOTH prefix and postfix patterns:
  - PREFIX: "pu topgolf", "do marriott", "pu mesa"
  - POSTFIX: "mesa is pu", "topgolf is do", "airport is dropoff"

CRITICAL: Only strip trailing numbers that are FUSED to letters (typos like "chicago4" → "chicago", "mesa2" → "mesa"). KEEP numbers with spaces like "Terminal 4", "Gate 12", "Club 33".

For addresses, determine if it's pickup, destination, or dropoff based on context clues like "from", "to", "going to", "pick up at", "drop off at", "PU", "DO", "is PU", "is DO".

If text looks like a name (first last), mark as name.
If text looks like a website/URL, mark as website.

Examples:
"pu topgolf" → pickup_address with value "topgolf" (confidence 0.95)
"mesa is pu" → pickup_address with value "mesa" (confidence 0.95)
"chicago is pickup" → pickup_address with value "chicago" (confidence 0.95)
"do marriott scottsdale" → dropoff_address with value "marriott scottsdale" (confidence 0.95)
"airport is do" → dropoff_address with value "airport" (confidence 0.95)
"pu 123 main street" → pickup_address with value "123 main street" (confidence 0.95)
"chicago4 is pu" → pickup_address with value "chicago" (strip the 4, confidence 0.95)
"john smith" → name
"partybusquotes.com" → website
"going to the phoenician" → destination`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    return parsed.items || [];
  } catch (error) {
    console.error("AI parsing error:", error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const { text, useAI = false } = await request.json();

    if (!text || typeof text !== "string") {
      return NextResponse.json({ items: [] });
    }

    const segments = text.split(',').map(s => s.trim()).filter(s => s.length > 0);
    
    if (segments.length === 0) {
      return NextResponse.json({ items: [] });
    }

    const allItems: DetectedItem[] = [];
    const unknownSegments: string[] = [];

    for (const segment of segments) {
      const patternResult = detectPattern(segment);
      if (patternResult && patternResult.confidence >= 0.8) {
        allItems.push(patternResult);
      } else if (patternResult) {
        allItems.push(patternResult);
      } else {
        unknownSegments.push(segment);
      }
    }

    if (useAI && unknownSegments.length > 0) {
      for (const segment of unknownSegments) {
        if (segment.length > 3) {
          const aiResults = await parseWithAI(segment);
          if (aiResults.length > 0) {
            allItems.push(...aiResults);
          } else {
            allItems.push({ type: 'unknown', value: segment, confidence: 0, original: segment });
          }
        } else {
          allItems.push({ type: 'unknown', value: segment, confidence: 0, original: segment });
        }
      }
    } else {
      for (const segment of unknownSegments) {
        allItems.push({ type: 'unknown', value: segment, confidence: 0, original: segment });
      }
    }

    return NextResponse.json({ items: allItems });
  } catch (error) {
    console.error("Parse input error:", error);
    return NextResponse.json({ items: [] }, { status: 500 });
  }
}
