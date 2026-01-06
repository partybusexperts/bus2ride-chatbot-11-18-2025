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
  | 'stop'
  | 'agent'
  | 'unknown';

const AGENT_NAMES = ['floyd', 'rob', 'camille', 'shiela', 'henrietta', 'other'];

interface DetectedItem {
  type: DetectedType;
  value: string;
  confidence: number;
  original: string;
  normalizedCity?: string; // For suburbs/small cities, the major metro area to use for vehicle search
}

const PHONE_REGEX = /^[\d\s\-\(\)\.]{10,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_REGEX = /^\d{5}(-\d{4})?$/;
// Accept "5pm", "5p", "5 pm", "5:30pm", "5:30 p", etc.
const TIME_REGEX = /^(\d{1,2})(:\d{2})?\s*([ap]\.?m?\.?)$/i;
const DATE_PATTERNS = [
  /^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/,
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(st|nd|rd|th)?(,?\s*\d{2,4})?$/i,
  /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(st|nd|rd|th)?\s*,?\s*\d{2,4}?$/i,
  // Handle "on december 5", "on dec 5 2026", "on 12/5/2026"
  /^on\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(st|nd|rd|th)?(,?\s*\d{2,4})?$/i,
  /^on\s+\d{1,2}\/\d{1,2}(\/\d{2,4})?$/i,
  // Handle "december 5th 2026", "dec 5, 2026"
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(st|nd|rd|th)?,?\s+\d{4}$/i,
];

// Relative date patterns
const RELATIVE_DATE_PATTERNS = [
  /^(next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i,
  /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i,
  /^tomorrow$/i,
  /^today$/i,
  /^(next|this)\s+week(end)?$/i,
];

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_ABBREVS: Record<string, number> = {
  'jan': 0, 'january': 0,
  'feb': 1, 'february': 1,
  'mar': 2, 'march': 2,
  'apr': 3, 'april': 3,
  'may': 4,
  'jun': 5, 'june': 5,
  'jul': 6, 'july': 6,
  'aug': 7, 'august': 7,
  'sep': 8, 'sept': 8, 'september': 8,
  'oct': 9, 'october': 9,
  'nov': 10, 'november': 10,
  'dec': 11, 'december': 11,
};

function parseRelativeDate(text: string): string | null {
  const lower = text.toLowerCase().trim();
  const today = new Date();
  
  // Tomorrow
  if (lower === 'tomorrow') {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatDate(tomorrow);
  }
  
  // Today
  if (lower === 'today') {
    return formatDate(today);
  }
  
  // Next weekend / this weekend
  if (lower === 'next weekend' || lower === 'this weekend') {
    const daysUntilSaturday = (6 - today.getDay() + 7) % 7 || 7;
    const saturday = new Date(today);
    saturday.setDate(today.getDate() + daysUntilSaturday);
    return formatDate(saturday);
  }
  
  // "next friday", "this saturday", or just "friday"
  const dayMatch = lower.match(/^(next|this)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i);
  if (dayMatch) {
    const prefix = dayMatch[1]?.toLowerCase();
    const targetDayName = dayMatch[2].toLowerCase();
    const targetDayIndex = DAY_NAMES.indexOf(targetDayName);
    const currentDayIndex = today.getDay();
    
    let daysToAdd = targetDayIndex - currentDayIndex;
    
    if (prefix === 'next') {
      // "next friday" means the friday in the next week
      if (daysToAdd <= 0) {
        daysToAdd += 7;
      }
      // If it's still this week, add another 7 days
      if (daysToAdd < 7) {
        daysToAdd += 7;
      }
    } else {
      // "this friday" or just "friday" means the upcoming one
      if (daysToAdd <= 0) {
        daysToAdd += 7;
      }
    }
    
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + daysToAdd);
    return formatDate(targetDate);
  }
  
  // "next april 30", "april 30", "next may 15th", "may 15", "next jan 1st", "jan 1"
  // Also handles "april 30th", "may 15th 2026"
  const monthDayMatch = lower.match(/^(next\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?$/i);
  if (monthDayMatch) {
    const hasNext = !!monthDayMatch[1];
    const monthStr = monthDayMatch[2].toLowerCase();
    const dayNum = parseInt(monthDayMatch[3], 10);
    const yearNum = monthDayMatch[4] ? parseInt(monthDayMatch[4], 10) : null;
    
    const targetMonth = MONTH_ABBREVS[monthStr];
    if (targetMonth !== undefined && dayNum >= 1 && dayNum <= 31) {
      let targetYear = today.getFullYear();
      
      if (yearNum) {
        // Explicit year provided
        targetYear = yearNum;
      } else {
        // No year provided - determine if this year or next year
        const currentMonth = today.getMonth();
        const currentDay = today.getDate();
        
        // If the date is in the past this year, go to next year
        if (targetMonth < currentMonth || (targetMonth === currentMonth && dayNum < currentDay)) {
          if (hasNext) {
            // "next april 30" when it's already past - definitely next year
            targetYear = today.getFullYear() + 1;
          } else {
            // Just "april 30" when it's past - assume next year
            targetYear = today.getFullYear() + 1;
          }
        } else if (hasNext && targetMonth > currentMonth) {
          // "next april 30" and it's currently before april - could mean next year
          // If it's close (same month or next month), "next" means later this year
          // If it's far away, "next" might mean next year - but we'll assume this year for simplicity
          targetYear = today.getFullYear();
        }
      }
      
      const targetDate = new Date(targetYear, targetMonth, dayNum);
      // Validate the date is real (e.g., Feb 30 is not real)
      if (targetDate.getMonth() === targetMonth && targetDate.getDate() === dayNum) {
        return formatDate(targetDate);
      }
    }
  }
  
  // "in 2 weeks", "in 3 days", "in a week"
  const inTimeMatch = lower.match(/^in\s+(a|\d+)\s+(day|week|month)s?$/i);
  if (inTimeMatch) {
    const amount = inTimeMatch[1] === 'a' ? 1 : parseInt(inTimeMatch[1], 10);
    const unit = inTimeMatch[2].toLowerCase();
    const targetDate = new Date(today);
    
    if (unit === 'day') {
      targetDate.setDate(today.getDate() + amount);
    } else if (unit === 'week') {
      targetDate.setDate(today.getDate() + (amount * 7));
    } else if (unit === 'month') {
      targetDate.setMonth(today.getMonth() + amount);
    }
    return formatDate(targetDate);
  }
  
  // "next month", "this month"
  if (lower === 'next month') {
    const targetDate = new Date(today);
    targetDate.setMonth(today.getMonth() + 1);
    targetDate.setDate(1); // First of next month
    return formatDate(targetDate);
  }
  
  return null;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
// Handle typos like "poeple", "passangers", "peolpe", "ppl"
const PASSENGERS_REGEX = /^(\d{1,3})\s*(people|poeple|peolpe|ppl|passengers?|passangers?|pax|guests?|persons?)$/i;
const PASSENGERS_SHORT_REGEX = /^(\d{1,2})$/;
const HOURS_REGEX = /^(\d+(\.\d+)?)\s*(hours?|hrs?)?$/i;

// Word to number mapping for passenger counts
const WORD_TO_NUMBER: Record<string, number> = {
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
  'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20,
  'twentyone': 21, 'twenty-one': 21, 'twenty one': 21,
  'twentytwo': 22, 'twenty-two': 22, 'twenty two': 22,
  'twentythree': 23, 'twenty-three': 23, 'twenty three': 23,
  'twentyfour': 24, 'twenty-four': 24, 'twenty four': 24,
  'twentyfive': 25, 'twenty-five': 25, 'twenty five': 25,
  'twentysix': 26, 'twenty-six': 26, 'twenty six': 26,
  'twentyseven': 27, 'twenty-seven': 27, 'twenty seven': 27,
  'twentyeight': 28, 'twenty-eight': 28, 'twenty eight': 28,
  'twentynine': 29, 'twenty-nine': 29, 'twenty nine': 29,
  'thirty': 30, 'forty': 40, 'fifty': 50, 'sixty': 60,
};

// Handle word-based passenger counts like "five people", "twenty passengers"
const WORD_PASSENGERS_REGEX = /^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|twenty[\s-]?(one|two|three|four|five|six|seven|eight|nine)|thirty|forty|fifty|sixty)\s*(people|poeple|peolpe|ppl|passengers?|passangers?|pax|guests?|persons?)$/i;

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
  'grand rapids', 'ann arbor', 'salt lake city', 'oklahoma city', 'fort worth',
  'san jose', 'jacksonville', 'indianapolis', 'columbus', 'fort lauderdale',
  'el paso', 'milwaukee', 'albuquerque', 'raleigh', 'omaha', 'virginia beach',
  'colorado springs', 'long beach', 'oakland', 'sacramento', 'fresno', 'tulsa',
  'cleveland', 'pittsburgh', 'cincinnati', 'bakersfield', 'wichita', 'arlington',
];

// City normalization - map suburbs/small cities to their major metro for vehicle search
const CITY_NORMALIZATION: Record<string, string> = {
  // Phoenix metro
  'mesa': 'Phoenix', 'mesa az': 'Phoenix', 'tempe': 'Phoenix', 'scottsdale': 'Phoenix',
  'glendale': 'Phoenix', 'glendale az': 'Phoenix', 'chandler': 'Phoenix', 'gilbert': 'Phoenix', 
  'peoria': 'Phoenix', 'peoria az': 'Phoenix', 'surprise': 'Phoenix', 'goodyear': 'Phoenix', 
  'avondale': 'Phoenix', 'cave creek': 'Phoenix', 'fountain hills': 'Phoenix', 
  'paradise valley': 'Phoenix', 'queen creek': 'Phoenix', 'san tan valley': 'Phoenix', 
  'apache junction': 'Phoenix', 'buckeye': 'Phoenix', 'maricopa': 'Phoenix',
  'anthem': 'Phoenix', 'carefree': 'Phoenix', 'casa grande': 'Phoenix',
  // Denver metro
  'silverthorne': 'Denver', 'silverthorn': 'Denver', 'aurora': 'Denver', 'aurora co': 'Denver',
  'lakewood': 'Denver', 'thornton': 'Denver', 'arvada': 'Denver', 'westminster': 'Denver', 
  'centennial': 'Denver', 'highlands ranch': 'Denver', 'boulder': 'Denver', 
  'broomfield': 'Denver', 'littleton': 'Denver', 'parker': 'Denver', 'castle rock': 'Denver', 
  'golden': 'Denver', 'englewood': 'Denver', 'commerce city': 'Denver', 
  'lone tree': 'Denver', 'greenwood village': 'Denver', 'fort collins': 'Denver',
  'colorado springs': 'Denver', 'vail': 'Denver', 'breckenridge': 'Denver', 'aspen': 'Denver',
  // Dallas-Fort Worth metro
  'fort worth': 'Dallas', 'arlington': 'Dallas', 'arlington tx': 'Dallas', 'plano': 'Dallas', 
  'irving': 'Dallas', 'garland': 'Dallas', 'frisco': 'Dallas', 'mckinney': 'Dallas', 
  'denton': 'Dallas', 'carrollton': 'Dallas', 'richardson': 'Dallas', 'lewisville': 'Dallas', 
  'allen': 'Dallas', 'flower mound': 'Dallas', 'grapevine': 'Dallas', 'mesquite': 'Dallas', 
  'grand prairie': 'Dallas', 'euless': 'Dallas', 'bedford': 'Dallas', 'hurst': 'Dallas',
  'colleyville': 'Dallas', 'southlake': 'Dallas', 'keller': 'Dallas', 'coppell': 'Dallas',
  'rockwall': 'Dallas', 'rowlett': 'Dallas', 'wylie': 'Dallas', 'sachse': 'Dallas',
  // Houston metro (including Galveston)
  'the woodlands': 'Houston', 'sugar land': 'Houston', 'pearland': 'Houston', 
  'league city': 'Houston', 'katy': 'Houston', 'baytown': 'Houston', 'conroe': 'Houston', 
  'pasadena': 'Houston', 'pasadena tx': 'Houston', 'missouri city': 'Houston', 
  'spring': 'Houston', 'cypress': 'Houston', 'humble': 'Houston',
  'galveston': 'Houston', 'galveston tx': 'Houston', 'texas city': 'Houston',
  'clear lake': 'Houston', 'friendswood': 'Houston', 'seabrook': 'Houston',
  'kemah': 'Houston', 'webster': 'Houston', 'la porte': 'Houston', 'deer park': 'Houston',
  'tomball': 'Houston', 'kingwood': 'Houston', 'atascocita': 'Houston', 'richmond': 'Houston',
  // Austin metro
  'round rock': 'Austin', 'cedar park': 'Austin', 'pflugerville': 'Austin', 
  'georgetown': 'Austin', 'georgetown tx': 'Austin', 'san marcos': 'Austin', 
  'kyle': 'Austin', 'buda': 'Austin', 'leander': 'Austin', 'lakeway': 'Austin',
  'dripping springs': 'Austin', 'bastrop': 'Austin',
  // San Antonio metro
  'new braunfels': 'San Antonio', 'boerne': 'San Antonio', 'schertz': 'San Antonio',
  'cibolo': 'San Antonio', 'live oak': 'San Antonio', 'universal city': 'San Antonio',
  // Los Angeles metro
  'long beach': 'Los Angeles', 'anaheim': 'Los Angeles', 'santa ana': 'Los Angeles',
  'irvine': 'Los Angeles', 'glendale ca': 'Los Angeles', 'huntington beach': 'Los Angeles',
  'santa clarita': 'Los Angeles', 'garden grove': 'Los Angeles', 'ontario': 'Los Angeles',
  'ontario ca': 'Los Angeles', 'rancho cucamonga': 'Los Angeles', 'pomona': 'Los Angeles', 
  'fullerton': 'Los Angeles', 'pasadena ca': 'Los Angeles', 'burbank': 'Los Angeles', 
  'torrance': 'Los Angeles', 'costa mesa': 'Los Angeles', 'newport beach': 'Los Angeles',
  'laguna beach': 'Los Angeles', 'san clemente': 'Los Angeles', 'carlsbad': 'Los Angeles',
  'oceanside': 'Los Angeles', 'escondido': 'Los Angeles', 'temecula': 'Los Angeles',
  'riverside': 'Los Angeles', 'riverside ca': 'Los Angeles', 'corona': 'Los Angeles',
  'fontana': 'Los Angeles', 'moreno valley': 'Los Angeles', 'san bernardino': 'Los Angeles',
  // San Francisco Bay Area
  'oakland': 'San Francisco', 'san jose': 'San Francisco', 'fremont': 'San Francisco',
  'hayward': 'San Francisco', 'sunnyvale': 'San Francisco', 'santa clara': 'San Francisco',
  'concord': 'San Francisco', 'berkeley': 'San Francisco', 'palo alto': 'San Francisco',
  'mountain view': 'San Francisco', 'redwood city': 'San Francisco', 'san mateo': 'San Francisco',
  'daly city': 'San Francisco', 'walnut creek': 'San Francisco', 'pleasanton': 'San Francisco',
  'livermore': 'San Francisco', 'milpitas': 'San Francisco', 'cupertino': 'San Francisco',
  'menlo park': 'San Francisco', 'santa rosa': 'San Francisco', 'napa': 'San Francisco',
  // Chicago metro (extended)
  'naperville': 'Chicago', 'naperville il': 'Chicago', 'aurora il': 'Chicago', 'joliet': 'Chicago', 
  'elgin': 'Chicago', 'waukegan': 'Chicago', 'cicero': 'Chicago', 
  'arlington heights': 'Chicago', 'evanston': 'Chicago', 'schaumburg': 'Chicago', 
  'bolingbrook': 'Chicago', 'palatine': 'Chicago', 'skokie': 'Chicago',
  'oak lawn': 'Chicago', 'downers grove': 'Chicago', 'orland park': 'Chicago', 
  'oak park': 'Chicago', 'tinley park': 'Chicago', 'oak brook': 'Chicago',
  'glen ellyn': 'Chicago', 'glen ellyn il': 'Chicago', 'wheaton': 'Chicago', 'wheaton il': 'Chicago',
  'lombard': 'Chicago', 'elmhurst': 'Chicago', 'hinsdale': 'Chicago', 'la grange': 'Chicago',
  'park ridge': 'Chicago', 'des plaines': 'Chicago', 'mount prospect': 'Chicago',
  'buffalo grove': 'Chicago', 'highland park': 'Chicago', 'lake forest': 'Chicago',
  'libertyville': 'Chicago', 'vernon hills': 'Chicago', 'gurnee': 'Chicago',
  'hoffman estates': 'Chicago', 'streamwood': 'Chicago', 'bartlett': 'Chicago',
  'carol stream': 'Chicago', 'addison': 'Chicago', 'villa park': 'Chicago',
  'westmont': 'Chicago', 'westmont il': 'Chicago', 'clarendon hills': 'Chicago',
  'willowbrook': 'Chicago', 'darien': 'Chicago', 'woodridge': 'Chicago', 'lisle': 'Chicago',
  'oswego': 'Chicago', 'plainfield': 'Chicago', 'plainfield il': 'Chicago',
  'romeoville': 'Chicago', 'lockport': 'Chicago', 'new lenox': 'Chicago',
  'mokena': 'Chicago', 'frankfort': 'Chicago', 'frankfort il': 'Chicago',
  'homer glen': 'Chicago', 'lemont': 'Chicago', 'palos heights': 'Chicago',
  'orland hills': 'Chicago', 'alsip': 'Chicago', 'bridgeview': 'Chicago',
  'west chicago': 'Chicago', 'west chicago il': 'Chicago', 'winfield': 'Chicago',
  'warrenville': 'Chicago', 'batavia': 'Chicago', 'geneva': 'Chicago', 'geneva il': 'Chicago',
  'st charles': 'Chicago', 'st charles il': 'Chicago', 'saint charles': 'Chicago',
  'north aurora': 'Chicago', 'montgomery': 'Chicago', 'yorkville': 'Chicago',
  'sugar grove': 'Chicago', 'big rock': 'Chicago', 'kaneville': 'Chicago',
  'south elgin': 'Chicago', 'hanover park': 'Chicago', 'roselle': 'Chicago',
  'bloomingdale': 'Chicago', 'glendale heights': 'Chicago', 'itasca': 'Chicago',
  'bensenville': 'Chicago', 'wood dale': 'Chicago', 'elk grove village': 'Chicago',
  'rolling meadows': 'Chicago', 'arlington heights il': 'Chicago',
  'northbrook': 'Chicago', 'deerfield': 'Chicago', 'highland park il': 'Chicago',
  'lake bluff': 'Chicago', 'north chicago': 'Chicago', 'waukegan il': 'Chicago',
  'zion': 'Chicago', 'beach park': 'Chicago', 'winthrop harbor': 'Chicago',
  'antioch': 'Chicago', 'antioch il': 'Chicago', 'lake villa': 'Chicago',
  'round lake': 'Chicago', 'grayslake': 'Chicago', 'mundelein': 'Chicago',
  'lake zurich': 'Chicago', 'barrington': 'Chicago', 'barrington il': 'Chicago',
  'algonquin': 'Chicago', 'crystal lake': 'Chicago', 'mchenry': 'Chicago',
  'woodstock': 'Chicago', 'woodstock il': 'Chicago', 'huntley': 'Chicago',
  'cary': 'Chicago', 'fox river grove': 'Chicago', 'carpentersville': 'Chicago',
  'east dundee': 'Chicago', 'west dundee': 'Chicago', 'sleepy hollow': 'Chicago',
  'south barrington': 'Chicago', 'inverness': 'Chicago', 'prospect heights': 'Chicago',
  'wheeling': 'Chicago', 'lincolnshire': 'Chicago', 'riverwoods': 'Chicago',
  'bannockburn': 'Chicago', 'lake forest il': 'Chicago', 'highwood': 'Chicago',
  'glencoe': 'Chicago', 'wilmette': 'Chicago', 'kenilworth': 'Chicago', 'winnetka': 'Chicago',
  'northfield': 'Chicago', 'glenview': 'Chicago', 'morton grove': 'Chicago',
  'niles': 'Chicago', 'lincolnwood': 'Chicago', 'skokie il': 'Chicago',
  'evanston il': 'Chicago', 'wilmette il': 'Chicago',
  'berwyn': 'Chicago', 'riverside il': 'Chicago',
  'brookfield': 'Chicago', 'la grange park': 'Chicago', 'western springs': 'Chicago',
  'countryside': 'Chicago', 'indian head park': 'Chicago', 'burr ridge': 'Chicago',
  'willowbrook il': 'Chicago',
  'justice': 'Chicago', 'hickory hills': 'Chicago', 'palos hills': 'Chicago',
  'worth': 'Chicago', 'chicago ridge': 'Chicago', 'evergreen park': 'Chicago',
  'oak forest': 'Chicago', 'midlothian': 'Chicago', 'crestwood': 'Chicago',
  'robbins': 'Chicago', 'blue island': 'Chicago', 'calumet city': 'Chicago',
  'dolton': 'Chicago', 'harvey': 'Chicago', 'south holland': 'Chicago',
  'lansing': 'Chicago', 'lansing il': 'Chicago', 'thornton il': 'Chicago',
  'homewood': 'Chicago', 'flossmoor': 'Chicago', 'olympia fields': 'Chicago',
  'park forest': 'Chicago', 'university park': 'Chicago', 'richton park': 'Chicago',
  'matteson': 'Chicago', 'frankfort square': 'Chicago', 'tinley park il': 'Chicago',
  'orland park il': 'Chicago', 'palos park': 'Chicago',
  // Detroit metro
  'warren': 'Detroit', 'sterling heights': 'Detroit', 'ann arbor': 'Detroit', 
  'dearborn': 'Detroit', 'livonia': 'Detroit', 'troy': 'Detroit', 'westland': 'Detroit', 
  'farmington hills': 'Detroit', 'southfield': 'Detroit', 'royal oak': 'Detroit', 
  'pontiac': 'Detroit', 'rochester hills': 'Detroit', 'canton mi': 'Detroit',
  'novi': 'Detroit', 'birmingham mi': 'Detroit',
  // Miami metro
  'fort lauderdale': 'Miami', 'hialeah': 'Miami', 'pembroke pines': 'Miami', 
  'hollywood': 'Miami', 'hollywood fl': 'Miami', 'miramar': 'Miami', 
  'coral springs': 'Miami', 'miami gardens': 'Miami', 'pompano beach': 'Miami',
  'west palm beach': 'Miami', 'davie': 'Miami', 'boca raton': 'Miami', 'sunrise': 'Miami',
  'delray beach': 'Miami', 'boynton beach': 'Miami', 'deerfield beach': 'Miami',
  'plantation': 'Miami', 'weston': 'Miami', 'coral gables': 'Miami', 'key biscayne': 'Miami',
  // Atlanta metro
  'sandy springs': 'Atlanta', 'roswell': 'Atlanta', 'johns creek': 'Atlanta', 
  'alpharetta': 'Atlanta', 'marietta': 'Atlanta', 'smyrna': 'Atlanta', 
  'dunwoody': 'Atlanta', 'brookhaven': 'Atlanta', 'decatur': 'Atlanta', 
  'lawrenceville': 'Atlanta', 'duluth': 'Atlanta', 'duluth ga': 'Atlanta', 
  'kennesaw': 'Atlanta', 'peachtree city': 'Atlanta', 'newnan': 'Atlanta',
  'douglasville': 'Atlanta', 'woodstock ga': 'Atlanta', 'canton ga': 'Atlanta',
  // Las Vegas metro
  'henderson': 'Las Vegas', 'north las vegas': 'Las Vegas', 'enterprise': 'Las Vegas',
  'spring valley': 'Las Vegas', 'spring valley nv': 'Las Vegas', 
  'sunrise manor': 'Las Vegas', 'paradise nv': 'Las Vegas',
  'summerlin': 'Las Vegas', 'green valley': 'Las Vegas', 'boulder city': 'Las Vegas',
  // Seattle metro
  'tacoma': 'Seattle', 'bellevue': 'Seattle', 'kent': 'Seattle', 'everett': 'Seattle',
  'renton': 'Seattle', 'federal way': 'Seattle', 'spokane': 'Seattle', 'kirkland': 'Seattle',
  'redmond': 'Seattle', 'auburn wa': 'Seattle', 'sammamish': 'Seattle', 'issaquah': 'Seattle',
  'bothell': 'Seattle', 'lynnwood': 'Seattle', 'edmonds': 'Seattle', 'burien': 'Seattle',
  // Minneapolis metro
  'st paul': 'Minneapolis', 'saint paul': 'Minneapolis', 'bloomington mn': 'Minneapolis',
  'brooklyn park': 'Minneapolis', 'plymouth': 'Minneapolis', 'maple grove': 'Minneapolis',
  'woodbury': 'Minneapolis', 'eden prairie': 'Minneapolis', 'eagan': 'Minneapolis',
  'burnsville': 'Minneapolis', 'lakeville': 'Minneapolis', 'blaine': 'Minneapolis',
  'coon rapids': 'Minneapolis', 'edina': 'Minneapolis', 'minnetonka': 'Minneapolis',
  // Boston metro
  'cambridge': 'Boston', 'somerville': 'Boston', 'brookline': 'Boston', 'newton': 'Boston',
  'quincy': 'Boston', 'braintree': 'Boston', 'weymouth': 'Boston', 'framingham': 'Boston',
  'waltham': 'Boston', 'malden': 'Boston', 'medford': 'Boston', 'worcester': 'Boston',
  // Philadelphia metro
  'camden': 'Philadelphia', 'cherry hill': 'Philadelphia', 'wilmington': 'Philadelphia',
  'chester': 'Philadelphia', 'norristown': 'Philadelphia', 'king of prussia': 'Philadelphia',
  // New York metro
  'brooklyn': 'New York', 'queens': 'New York', 'bronx': 'New York', 'staten island': 'New York',
  'yonkers': 'New York', 'new rochelle': 'New York', 'white plains': 'New York',
  'jersey city': 'New York', 'newark': 'New York', 'hoboken': 'New York',
  'stamford': 'New York', 'greenwich': 'New York', 'long island': 'New York',
  'garden city': 'New York', 'great neck': 'New York', 'huntington': 'New York',
  // Washington DC metro
  'arlington va': 'Washington DC', 'alexandria': 'Washington DC',
  'bethesda': 'Washington DC', 'silver spring': 'Washington DC', 'rockville': 'Washington DC',
  'tysons': 'Washington DC', 'reston': 'Washington DC', 'fairfax': 'Washington DC',
  'mclean': 'Washington DC', 'falls church': 'Washington DC',
};

// Get normalized city for vehicle search
function getNormalizedCity(city: string): { normalized: string; original: string } | null {
  const lower = city.toLowerCase().trim();
  // Remove trailing state abbreviations for lookup
  const withoutState = lower.replace(/,?\s*(az|co|tx|ca|il|mi|fl|ga|nv|wa|mn|oh|pa|ny|nj|ma)\.?$/i, '').trim();
  
  const normalized = CITY_NORMALIZATION[withoutState] || CITY_NORMALIZATION[lower];
  if (normalized) {
    return { normalized, original: city };
  }
  return null;
}

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
  'leilani', 'aaliyah', 'maya', 'sophia', 'isabella', 'mia', 'charlotte', 'amelia', 'harper', 'evelyn',
  'abigail', 'ella', 'avery', 'scarlett', 'grace', 'chloe', 'camila', 'penelope', 'riley', 'layla',
  'zoey', 'nora', 'lily', 'eleanor', 'hannah', 'lillian', 'addison', 'aubrey', 'ellie', 'stella',
  'natalie', 'zoe', 'leah', 'hazel', 'violet', 'aurora', 'savannah', 'audrey', 'brooklyn', 'bella',
  'claire', 'skylar', 'lucy', 'paisley', 'everly', 'anna', 'caroline', 'nova', 'genesis', 'emilia',
  'kennedy', 'kinsley', 'allison', 'maya', 'sarah', 'madelyn', 'adeline', 'alexa', 'ariana', 'elena',
  'gabriella', 'naomi', 'alice', 'sadie', 'hailey', 'eva', 'emery', 'aaliyah', 'autumn', 'nevaeh',
  'liam', 'noah', 'oliver', 'elijah', 'lucas', 'mason', 'ethan', 'logan', 'aiden', 'jackson',
  'sebastian', 'mateo', 'henry', 'owen', 'wyatt', 'leo', 'carter', 'jayden', 'asher', 'grayson',
  'dylan', 'levi', 'isaac', 'gabriel', 'julian', 'lincoln', 'jaxon', 'anthony', 'hudson', 'ezra',
  'caleb', 'maverick', 'josiah', 'isaiah', 'connor', 'eli', 'landon', 'adrian', 'theo', 'roman',
  'aaron', 'ian', 'easton', 'colton', 'cameron', 'nolan', 'jordan', 'angel', 'evan', 'everett',
  'jose', 'carlos', 'luis', 'miguel', 'jesus', 'juan', 'diego', 'javier', 'alejandro', 'fernando',
  'marco', 'raul', 'ricardo', 'cesar', 'antonio', 'mario', 'jorge', 'pablo', 'sergio', 'pedro',
  'rosa', 'carmen', 'ana', 'lucia', 'sofia', 'elena', 'gabriela', 'isabel', 'juanita', 'margarita',
  'keisha', 'latoya', 'tanya', 'tamika', 'shaniqua', 'aaliyah', 'imani', 'jasmine', 'ebony', 'destiny',
  'deshawn', 'tyrone', 'jamal', 'malik', 'darius', 'terrell', 'andre', 'jerome', 'lamar', 'deandre',
  'aisha', 'fatima', 'zahra', 'amira', 'layla', 'nadia', 'yasmin', 'zara', 'leila', 'samira',
  'omar', 'ahmed', 'ali', 'hassan', 'yusuf', 'tariq', 'khalid', 'kareem', 'rashid', 'jamal',
  'priya', 'ananya', 'anika', 'neha', 'pooja', 'sneha', 'divya', 'meera', 'kavya', 'tanvi',
  'raj', 'arjun', 'vikram', 'sanjay', 'rahul', 'aditya', 'rohit', 'amit', 'deepak', 'suresh',
  'sakura', 'yuki', 'hana', 'mei', 'lin', 'wei', 'ming', 'chen', 'kim', 'park',
  'kayla', 'kaylee', 'kylie', 'mackenzie', 'maddie', 'molly', 'megan', 'morgan', 'paige', 'taylor',
  'tiffany', 'whitney', 'brittany', 'courtney', 'crystal', 'danielle', 'erica', 'heidi', 'holly', 'jenny',
  'jenna', 'jessie', 'katelyn', 'kelsey', 'kristen', 'kristin', 'lindsey', 'mandy', 'megan', 'melanie',
  'stacy', 'tara', 'tracy', 'vanessa', 'wendy', 'chelsea', 'brandy', 'candy', 'cindy', 'gina',
  'chad', 'brad', 'brett', 'brent', 'cody', 'corey', 'derek', 'drew', 'dustin', 'garrett',
  'grant', 'hunter', 'jarrod', 'jared', 'lance', 'logan', 'mason', 'mitchell', 'nathan', 'parker',
  'pierce', 'preston', 'ricky', 'roger', 'ross', 'shane', 'spencer', 'tanner', 'taylor', 'todd',
  'travis', 'trevor', 'troy', 'tyler', 'wade', 'wayne', 'zach', 'zack', 'zane', 'blake',
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
  
  // EARLY CITY DETECTION - Must happen before name detection
  // Detect "[word(s)] [2-letter state abbreviation]" patterns like "mesa az", "naperville il", "grand rapids mi"
  const STATE_ABBREVS_EARLY = ['az', 'ca', 'tx', 'nv', 'co', 'fl', 'ga', 'il', 'ny', 'wa', 'or', 'pa', 'oh', 'mi', 'nc', 'tn', 'mo', 'mn', 'wi', 'in', 'md', 'va', 'nj', 'ma', 'ct', 'sc', 'al', 'la', 'ky', 'ok', 'ut', 'nm', 'ks', 'ne', 'ia', 'ar', 'ms', 'wv', 'id', 'hi', 'me', 'nh', 'ri', 'mt', 'de', 'sd', 'nd', 'ak', 'vt', 'wy', 'dc'];
  
  // Pattern: "[city name], [state]" or "[city name] [state]" (e.g., "mesa az", "mesa, az", "grand rapids mi")
  const cityStatePattern = lowerText.match(/^([a-z][a-z\s]+?)[,\s]+([a-z]{2})$/i);
  if (cityStatePattern && STATE_ABBREVS_EARLY.includes(cityStatePattern[2].toLowerCase())) {
    const cityPart = cityStatePattern[1].trim();
    // Make sure city part is not just a single letter and doesn't look like a name
    if (cityPart.length >= 2) {
      const normalized = getNormalizedCity(lowerText) || getNormalizedCity(cityPart);
      return { 
        type: 'city', 
        value: trimmed, 
        confidence: 0.95, 
        original: trimmed,
        ...(normalized && { normalizedCity: normalized.normalized })
      };
    }
  }
  
  // Also check for known suburbs/cities that normalize (e.g., "naperville", "silverthorne", "mesa")
  // This catches single-word cities that should trigger vehicle search
  const normalizedEarly = getNormalizedCity(lowerText);
  if (normalizedEarly) {
    return { 
      type: 'city', 
      value: trimmed, 
      confidence: 0.92, 
      original: trimmed,
      normalizedCity: normalizedEarly.normalized
    };
  }
  
  // Detect agent names: "agent Floyd", "Agent Camille", "AGENT SHIELA", etc.
  const agentMatch = lowerText.match(/^agent\s+(\w+)$/i);
  if (agentMatch) {
    const agentName = agentMatch[1].toLowerCase();
    if (AGENT_NAMES.includes(agentName)) {
      const capitalizedName = agentName.charAt(0).toUpperCase() + agentName.slice(1);
      return { type: 'agent', value: capitalizedName, confidence: 0.99, original: trimmed };
    }
  }
  
  // Also detect just the agent name if it matches exactly
  if (AGENT_NAMES.includes(lowerText) && lowerText !== 'other') {
    const capitalizedName = lowerText.charAt(0).toUpperCase() + lowerText.slice(1);
    return { type: 'agent', value: capitalizedName, confidence: 0.85, original: trimmed };
  }
  
  const cleanTypoDigits = (text: string): string => {
    return text.replace(/([a-zA-Z])(\d+)$/, '$1').trim();
  };
  
  const puPostfixMatch = lowerText.match(/^(.+?)\s+(is|=|->|as)\s*(pu|up|p\.u\.|u\.p\.|p\/u|pickup|pick\s*-?\s*up)$/i);
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
  
  // Handle "pu time is 5pm", "pickup time is 5pm", "pu time 5pm"
  const puTimeIsMatch = lowerText.match(/^(pu|up|p\.u\.|u\.p\.|p\/u|pickup|pick\s*-?\s*up)\s*time\s*(is|=|:)?\s*(\d{1,2})(:\d{2})?\s*([ap]\.?m?\.?)?$/i);
  if (puTimeIsMatch) {
    const meridiem = puTimeIsMatch[5] ? (puTimeIsMatch[5].toLowerCase().startsWith('a') ? 'am' : 'pm') : 'pm';
    const timeVal = puTimeIsMatch[3] + (puTimeIsMatch[4] || '') + meridiem;
    return { type: 'time', value: timeVal, confidence: 0.92, original: trimmed };
  }
  
  // Handle "do time is 5pm", "dropoff time is 5pm"
  const doTimeIsMatch = lowerText.match(/^(do|d\.o\.|d\/o|dropoff|drop\s*-?\s*off)\s*time\s*(is|=|:)?\s*(\d{1,2})(:\d{2})?\s*([ap]\.?m?\.?)?$/i);
  if (doTimeIsMatch) {
    const meridiem = doTimeIsMatch[5] ? (doTimeIsMatch[5].toLowerCase().startsWith('a') ? 'am' : 'pm') : 'pm';
    const timeVal = doTimeIsMatch[3] + (doTimeIsMatch[4] || '') + meridiem;
    return { type: 'time', value: timeVal, confidence: 0.92, original: trimmed };
  }
  
  // Handle "pick up time", "pu time", "pickup time" - detect as asking about time (not address)
  const puTimeMatch = lowerText.match(/^(pu|up|p\.u\.|u\.p\.|p\/u|pickup|pick\s*-?\s*up)\s*(time|t)$/i);
  if (puTimeMatch) {
    // This is just "pickup time" without an actual time - skip, let other patterns handle
    // Return null to fall through
  }
  
  // Handle "5pm pu", "5p pickup", "5:30pm pick up" (time before pickup indicator)
  const timeBeforePuMatch = lowerText.match(/^(\d{1,2})(:\d{2})?\s*([ap]\.?m?\.?)?\s*(pu|up|p\.u\.|u\.p\.|p\/u|pickup|pick\s*-?\s*up)$/i);
  if (timeBeforePuMatch) {
    const meridiem = timeBeforePuMatch[3] ? (timeBeforePuMatch[3].toLowerCase().startsWith('a') ? 'am' : 'pm') : 'pm';
    const timeVal = timeBeforePuMatch[1] + (timeBeforePuMatch[2] || '') + meridiem;
    return { type: 'time', value: timeVal, confidence: 0.92, original: trimmed };
  }
  
  // Handle "5pm do", "5p dropoff", "5:30pm drop off"
  const timeBeforeDoMatch = lowerText.match(/^(\d{1,2})(:\d{2})?\s*([ap]\.?m?\.?)?\s*(do|d\.o\.|d\/o|dropoff|drop\s*-?\s*off)$/i);
  if (timeBeforeDoMatch) {
    const meridiem = timeBeforeDoMatch[3] ? (timeBeforeDoMatch[3].toLowerCase().startsWith('a') ? 'am' : 'pm') : 'pm';
    const timeVal = timeBeforeDoMatch[1] + (timeBeforeDoMatch[2] || '') + meridiem;
    return { type: 'time', value: timeVal, confidence: 0.92, original: trimmed };
  }
  
  // Enhanced pickup location parsing - handles many variations:
  // "pu dallas", "dallas pu", "pick up dallas", "dallas pick up", "pick up in dallas", 
  // "pickup at dallas", "pu at 123 main st", "mesa pick up", etc.
  
  // Pattern: [city/location] + pu/pickup (postfix) - e.g., "dallas pu", "mesa pick up"
  const puPostfixLocationMatch = lowerText.match(/^(.+?)\s+(pu|up|p\.u\.|u\.p\.|p\/u|pickup|pick\s*-?\s*up)$/i);
  if (puPostfixLocationMatch && puPostfixLocationMatch[1]) {
    const location = cleanTypoDigits(puPostfixLocationMatch[1].trim());
    // Make sure it's not a time (like "5pm pickup")
    const isTime = /^\d{1,2}(:\d{2})?\s*[ap]\.?m?\.?$/i.test(location);
    if (!isTime && location.length > 1) {
      // Check if location is a suburb that should normalize to a major metro
      const normalized = getNormalizedCity(location);
      return { 
        type: 'pickup_address', 
        value: location, 
        confidence: 0.92, 
        original: trimmed,
        ...(normalized && { normalizedCity: normalized.normalized })
      };
    }
  }
  
  // Pattern: pu/pickup + [in/at/@/:] + [location] - e.g., "pu dallas", "pick up in dallas", "pickup at 123 main"
  const puMatch = lowerText.match(/^(pu|up|p\.u\.|u\.p\.|p\/u|pickup|pick\s*-?\s*up)\s*(in|at|@|:|-|–|is)?\s*(.+)/i);
  if (puMatch && puMatch[3]) {
    let rest = puMatch[3].trim();
    // Skip if rest is just "time" or "t"
    if (rest === 'time' || rest === 't') {
      // Fall through to other patterns
    } else {
      // Check for time patterns including shortened meridiem (5p, 5pm, 5:30p, etc.)
      const timeCheck = rest.match(/^(\d{1,2})(:\d{2})?\s*([ap]\.?m?\.?)?$/i);
      if (timeCheck) {
        const meridiem = timeCheck[3] ? (timeCheck[3].toLowerCase().startsWith('a') ? 'am' : 'pm') : 'pm';
        const timeVal = timeCheck[1] + (timeCheck[2] || '') + meridiem;
        return { type: 'time', value: timeVal, confidence: 0.9, original: trimmed };
      }
      rest = cleanTypoDigits(rest);
      if (rest.length > 1) {
        // Check if location is a suburb that should normalize to a major metro
        const normalized = getNormalizedCity(rest);
        return { 
          type: 'pickup_address', 
          value: rest, 
          confidence: 0.92, 
          original: trimmed,
          ...(normalized && { normalizedCity: normalized.normalized })
        };
      }
    }
  }
  
  // Enhanced dropoff location parsing - similar to pickup
  // "do dallas", "dallas do", "drop off dallas", "dallas drop off", "dropoff at dallas"
  
  // Pattern: [city/location] + do/dropoff (postfix) - e.g., "dallas do", "mesa drop off"
  const doPostfixLocationMatch = lowerText.match(/^(.+?)\s+(do|d\.o\.|d\/o|dropoff|drop\s*-?\s*off)$/i);
  if (doPostfixLocationMatch && doPostfixLocationMatch[1]) {
    const location = cleanTypoDigits(doPostfixLocationMatch[1].trim());
    // Make sure it's not a time (like "5pm dropoff")
    const isTime = /^\d{1,2}(:\d{2})?\s*[ap]\.?m?\.?$/i.test(location);
    if (!isTime && location.length > 1) {
      // Check if location is a suburb that should normalize to a major metro
      const normalized = getNormalizedCity(location);
      return { 
        type: 'dropoff_address', 
        value: location, 
        confidence: 0.92, 
        original: trimmed,
        ...(normalized && { normalizedCity: normalized.normalized })
      };
    }
  }
  
  // Pattern: do/dropoff + [in/at/@/:] + [location] - e.g., "do dallas", "drop off in dallas"
  const doMatch = lowerText.match(/^(do|d\.o\.|d\/o|dropoff|drop\s*-?\s*off)\s*(in|at|@|:|-|–|is)?\s*(.+)/i);
  if (doMatch && doMatch[3]) {
    let rest = doMatch[3].trim();
    // Skip if rest is just "time" or "t"
    if (rest === 'time' || rest === 't') {
      // Fall through to other patterns
    } else {
      // Check for time patterns including shortened meridiem
      const timeCheck = rest.match(/^(\d{1,2})(:\d{2})?\s*([ap]\.?m?\.?)?$/i);
      if (timeCheck) {
        const meridiem = timeCheck[3] ? (timeCheck[3].toLowerCase().startsWith('a') ? 'am' : 'pm') : 'pm';
        const timeVal = timeCheck[1] + (timeCheck[2] || '') + meridiem;
        return { type: 'time', value: timeVal, confidence: 0.9, original: trimmed };
      }
      rest = cleanTypoDigits(rest);
      if (rest.length > 1) {
        // Check if location is a suburb that should normalize to a major metro
        const normalized = getNormalizedCity(rest);
        return { 
          type: 'dropoff_address', 
          value: rest, 
          confidence: 0.92, 
          original: trimmed,
          ...(normalized && { normalizedCity: normalized.normalized })
        };
      }
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
  
  const twoWordName = trimmed.match(/^([A-Za-z]+)\s+([A-Za-z]+)$/);
  if (twoWordName && trimmed.length >= 5 && trimmed.length <= 40) {
    const firstName = twoWordName[1].toLowerCase();
    const lastName = twoWordName[2].toLowerCase();
    const isNotCity = !CITY_KEYWORDS.some(c => c.toLowerCase() === firstName || c.toLowerCase() === trimmed.toLowerCase());
    const isNotVehicle = !Object.keys(VEHICLE_TYPE_KEYWORDS).some(v => v.toLowerCase() === trimmed.toLowerCase());
    const isNotEvent = !EVENT_KEYWORDS.some(e => e.toLowerCase() === trimmed.toLowerCase());
    const isNotVenue = !VENUE_KEYWORDS.some(v => firstName.includes(v) || lastName.includes(v) || trimmed.toLowerCase().includes(v));
    const isFirstNameCommon = COMMON_FIRST_NAMES.includes(firstName);
    if (isNotCity && isNotVehicle && isNotEvent && isNotVenue) {
      const formattedName = twoWordName[1].charAt(0).toUpperCase() + twoWordName[1].slice(1).toLowerCase() + ' ' + twoWordName[2].charAt(0).toUpperCase() + twoWordName[2].slice(1).toLowerCase();
      const confidence = isFirstNameCommon ? 0.9 : 0.75;
      return { type: 'name', value: formattedName, confidence, original: trimmed };
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
  
  // Check for relative dates: "next friday", "this saturday", "tomorrow", etc.
  const relativeDate = parseRelativeDate(trimmed);
  if (relativeDate) {
    return { type: 'date', value: relativeDate, confidence: 0.95, original: trimmed };
  }

  const passMatch = trimmed.match(PASSENGERS_REGEX);
  if (passMatch) {
    return { type: 'passengers', value: passMatch[1], confidence: 0.9, original: trimmed };
  }
  
  // Handle word-based passenger counts like "five people", "twenty passengers"
  const wordPassMatch = trimmed.match(WORD_PASSENGERS_REGEX);
  if (wordPassMatch) {
    const wordPart = wordPassMatch[1].toLowerCase().replace(/\s+/g, '');
    const numValue = WORD_TO_NUMBER[wordPart] || WORD_TO_NUMBER[wordPassMatch[1].toLowerCase()];
    if (numValue) {
      return { type: 'passengers', value: String(numValue), confidence: 0.9, original: trimmed };
    }
  }
  
  // Handle standalone word numbers like "five", "twenty"
  const standaloneWord = lowerText.replace(/\s+/g, '');
  if (WORD_TO_NUMBER[standaloneWord] || WORD_TO_NUMBER[lowerText]) {
    const numValue = WORD_TO_NUMBER[standaloneWord] || WORD_TO_NUMBER[lowerText];
    if (numValue >= 2 && numValue <= 60) {
      return { type: 'passengers', value: String(numValue), confidence: 0.8, original: trimmed };
    }
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
    const hoursNum = parseFloat(hoursMatch[1]);
    // Only accept hours up to 12 - anything more is likely a typo or phone number
    if (hoursNum > 0 && hoursNum <= 12) {
      return { type: 'hours', value: hoursMatch[1], confidence: 0.85, original: trimmed };
    }
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
        type: isPickup ? 'pickup_address' : 'stop', 
        value: trimmed, 
        confidence: 0.85, 
        original: trimmed 
      };
    }
  }

  const businessPattern = /\d{2,4}\s+(bar|grill|lounge|club|restaurant|steakhouse|brewery|pub|tavern)/i;
  if (businessPattern.test(trimmed)) {
    return { type: 'stop', value: trimmed, confidence: 0.85, original: trimmed };
  }
  
  const namedVenuePattern = /(bar|grill|club|restaurant|pub|tavern|lounge|brewery|winery|steakhouse|venue|arena|stadium|hotel|resort|casino|theater|theatre)\s+(called|named)\s+\w+/i;
  if (namedVenuePattern.test(trimmed)) {
    return { type: 'stop', value: trimmed, confidence: 0.9, original: trimmed };
  }
  
  const venueNearPattern = /\b(bar|grill|club|restaurant|pub|tavern|lounge|brewery|winery|steakhouse)\b.*\b(near|by|at|next\s+to|across\s+from)\b/i;
  if (venueNearPattern.test(trimmed)) {
    return { type: 'stop', value: trimmed, confidence: 0.85, original: trimmed };
  }
  
  const cityVenuePattern = new RegExp(`^(${CITY_KEYWORDS.join('|')})\\s+(bar|grill|club|restaurant|pub|tavern|lounge|brewery|venue|hotel|casino)`, 'i');
  if (cityVenuePattern.test(trimmed)) {
    return { type: 'stop', value: trimmed, confidence: 0.9, original: trimmed };
  }

  // Handle city + state patterns like "mesa az", "mesa arizona", "phoenix, az"
  const STATE_ABBREVS = ['az', 'ca', 'tx', 'nv', 'co', 'fl', 'ga', 'il', 'ny', 'wa', 'or', 'pa', 'oh', 'mi', 'nc', 'tn', 'mo', 'mn', 'wi', 'in', 'md', 'va', 'nj', 'ma', 'ct', 'sc', 'al', 'la', 'ky', 'ok', 'ut', 'nm', 'ks', 'ne', 'ia', 'ar', 'ms', 'wv', 'id', 'hi', 'me', 'nh', 'ri', 'mt', 'de', 'sd', 'nd', 'ak', 'vt', 'wy', 'dc'];
  const STATE_NAMES = ['arizona', 'california', 'texas', 'nevada', 'colorado', 'florida', 'georgia', 'illinois', 'new york', 'washington', 'oregon', 'pennsylvania', 'ohio', 'michigan', 'north carolina', 'tennessee', 'missouri', 'minnesota', 'wisconsin', 'indiana', 'maryland', 'virginia', 'new jersey', 'massachusetts', 'connecticut', 'south carolina', 'alabama', 'louisiana', 'kentucky', 'oklahoma', 'utah', 'new mexico', 'kansas', 'nebraska', 'iowa', 'arkansas', 'mississippi', 'west virginia', 'idaho', 'hawaii', 'maine', 'new hampshire', 'rhode island', 'montana', 'delaware', 'south dakota', 'north dakota', 'alaska', 'vermont', 'wyoming'];
  
  for (const city of CITY_KEYWORDS) {
    // Check for city + state abbreviation pattern (e.g., "mesa az", "mesa, az")
    const cityStateAbbrevPattern = new RegExp(`^${city}[,\\s]+([a-z]{2})$`, 'i');
    const cityStateMatch = lowerText.match(cityStateAbbrevPattern);
    if (cityStateMatch && STATE_ABBREVS.includes(cityStateMatch[1].toLowerCase())) {
      const normalized = getNormalizedCity(trimmed);
      return { 
        type: 'city', 
        value: trimmed, 
        confidence: 0.95, 
        original: trimmed,
        ...(normalized && { normalizedCity: normalized.normalized })
      };
    }
    
    // Check for city + state name pattern (e.g., "mesa arizona", "phoenix arizona")
    for (const state of STATE_NAMES) {
      if (lowerText === `${city} ${state}` || lowerText === `${city}, ${state}`) {
        const normalized = getNormalizedCity(trimmed);
        return { 
          type: 'city', 
          value: trimmed, 
          confidence: 0.95, 
          original: trimmed,
          ...(normalized && { normalizedCity: normalized.normalized })
        };
      }
    }
    
    if (lowerText === city || lowerText.startsWith(city + ' ') || lowerText.includes(' ' + city)) {
      const normalized = getNormalizedCity(trimmed);
      return { 
        type: 'city', 
        value: trimmed, 
        confidence: 0.9, 
        original: trimmed,
        ...(normalized && { normalizedCity: normalized.normalized })
      };
    }
  }
  
  // Also check if input is a suburb/small city that normalizes to a major metro
  // even if it's not in CITY_KEYWORDS (e.g., "silverthorne", "naperville")
  const normalized = getNormalizedCity(lowerText);
  if (normalized) {
    return { 
      type: 'city', 
      value: trimmed, 
      confidence: 0.9, 
      original: trimmed,
      normalizedCity: normalized.normalized
    };
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
