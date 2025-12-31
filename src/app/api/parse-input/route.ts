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
  | 'name'
  | 'website'
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

const CITY_KEYWORDS = [
  'phoenix', 'scottsdale', 'mesa', 'tempe', 'glendale', 'chandler', 'gilbert',
  'peoria', 'surprise', 'goodyear', 'avondale', 'tucson', 'las vegas', 'denver',
  'chicago', 'dallas', 'houston', 'austin', 'san antonio', 'los angeles',
];

function detectPattern(text: string): DetectedItem | null {
  const trimmed = text.trim();
  
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

  const lowerText = trimmed.toLowerCase();
  for (const event of EVENT_KEYWORDS) {
    if (lowerText.includes(event)) {
      return { type: 'event_type', value: trimmed, confidence: 0.8, original: trimmed };
    }
  }

  for (const city of CITY_KEYWORDS) {
    if (lowerText.includes(city)) {
      return { type: 'city', value: trimmed, confidence: 0.8, original: trimmed };
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

    const patternResult = detectPattern(text);
    if (patternResult && patternResult.confidence >= 0.8) {
      return NextResponse.json({ items: [patternResult] });
    }

    if (useAI && text.length > 3) {
      const aiResults = await parseWithAI(text);
      if (aiResults.length > 0) {
        return NextResponse.json({ items: aiResults });
      }
    }

    if (patternResult) {
      return NextResponse.json({ items: [patternResult] });
    }

    return NextResponse.json({ 
      items: [{ type: 'unknown', value: text, confidence: 0, original: text }] 
    });
  } catch (error) {
    console.error("Parse input error:", error);
    return NextResponse.json({ items: [] }, { status: 500 });
  }
}
