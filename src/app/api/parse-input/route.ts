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
const PASSENGERS_REGEX = /^(\d+)\s*(people|passengers|pax|guests|persons)?$/i;
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
];

const VENUE_KEYWORDS = [
  'topgolf', 'top golf', 'dave and busters', 'dave & busters', 'bowlero',
  'main event', 'lucky strike', 'pinstripes', 'k1 speed', 'andretti',
  'casino', 'hotel', 'resort', 'bar', 'grill', 'lounge', 'club', 'brewery',
  'winery', 'distillery', 'steakhouse', 'restaurant', 'pub', 'tavern',
  'arena', 'stadium', 'amphitheater', 'theater', 'theatre', 'venue',
  'country club', 'golf course', 'spa', 'salon', 'church', 'chapel',
  'airport', 'terminal', 'station', 'mall', 'plaza', 'center', 'centre',
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
  
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length === 10 || digitsOnly.length === 11) {
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

  if (EMAIL_REGEX.test(trimmed)) {
    return { type: 'email', value: trimmed.toLowerCase(), confidence: 0.99, original: trimmed };
  }

  if (ZIP_REGEX.test(trimmed)) {
    return { type: 'zip', value: trimmed, confidence: 0.95, original: trimmed };
  }

  const lowerText = trimmed.toLowerCase();
  
  const puMatch = lowerText.match(/^(pu|p\/u|pickup|pick\s*-?\s*up)\s*(at|@)?\s*(.+)/i);
  if (puMatch && puMatch[3]) {
    const rest = puMatch[3].trim();
    const timeCheck = rest.match(/^(\d{1,2})(:\d{2})?\s*(am|pm)?$/i);
    if (timeCheck) {
      return { type: 'time', value: rest, confidence: 0.9, original: trimmed };
    }
    if (rest.length > 2) {
      return { type: 'pickup_address', value: rest, confidence: 0.85, original: trimmed };
    }
  }
  
  const doMatch = lowerText.match(/^(do|d\/o|dropoff|drop\s*-?\s*off)\s*(at|@)?\s*(.+)/i);
  if (doMatch && doMatch[3]) {
    const rest = doMatch[3].trim();
    const timeCheck = rest.match(/^(\d{1,2})(:\d{2})?\s*(am|pm)?$/i);
    if (timeCheck) {
      return { type: 'time', value: rest, confidence: 0.9, original: trimmed };
    }
    if (rest.length > 2) {
      return { type: 'dropoff_address', value: rest, confidence: 0.85, original: trimmed };
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
    const isNotCity = !CITY_KEYWORDS.some(c => c.toLowerCase() === firstName || c.toLowerCase() === trimmed.toLowerCase());
    const isNotVehicle = !Object.keys(VEHICLE_TYPE_KEYWORDS).some(v => v.toLowerCase() === trimmed.toLowerCase());
    const isNotEvent = !EVENT_KEYWORDS.some(e => e.toLowerCase() === trimmed.toLowerCase());
    if (isNotCity && isNotVehicle && isNotEvent) {
      return { type: 'name', value: trimmed, confidence: 0.7, original: trimmed };
    }
  }
  
  if (COMMON_FIRST_NAMES.includes(lowerText)) {
    const capitalizedName = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
    return { type: 'name', value: capitalizedName, confidence: 0.85, original: trimmed };
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
    return { type: 'passengers', value: passMatch[1], confidence: 0.85, original: trimmed };
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
- value: the extracted/cleaned value
- confidence: 0-1 confidence score
- original: the original text fragment

For addresses, determine if it's pickup, destination, or dropoff based on context clues like "from", "to", "going to", "pick up at", "drop off at".

If text looks like a name (first last), mark as name.
If text looks like a website/URL, mark as website.

Examples:
"walmart on frye and gilbert" → pickup_address (if mentioned first) or destination
"john smith" → name
"partybusquotes.com" → website
"going to the phoenician" → destination
"pick them up at hotel" → pickup_address`,
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
