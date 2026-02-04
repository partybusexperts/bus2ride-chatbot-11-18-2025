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
  displayCity?: string; // For display when different from normalizedCity (e.g., "Washington DC" for display, "Washington" for search)
  isRemote?: boolean; // True if location is 1+ hour from nearest major metro
  travelMinutes?: number; // Estimated drive time in minutes from location to metro center
}

const PHONE_REGEX = /^[\d\s\-\(\)\.]{10,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ZIP_REGEX = /^\d{5}(-\d{4})?$/;
// Canadian postal code regex (e.g., M1B, L4K 2C3, N8A 1B2)
const CANADIAN_POSTAL_REGEX = /^[A-Za-z]\d[A-Za-z](\s?\d[A-Za-z]\d)?$/;

// ZIP code prefix to metro area mapping (first 3 digits)
const ZIP_TO_METRO: Record<string, string> = {
  // Phoenix AZ (850-853, 855-857, 859-860)
  '850': 'Phoenix', '851': 'Phoenix', '852': 'Phoenix', '853': 'Phoenix',
  '855': 'Phoenix', '856': 'Phoenix', '857': 'Phoenix', '859': 'Phoenix', '860': 'Phoenix',
  // Los Angeles CA (900-908, 910-918, 935)
  '900': 'Los Angeles', '901': 'Los Angeles', '902': 'Los Angeles', '903': 'Los Angeles',
  '904': 'Los Angeles', '905': 'Los Angeles', '906': 'Los Angeles', '907': 'Los Angeles',
  '908': 'Los Angeles', '910': 'Los Angeles', '911': 'Los Angeles', '912': 'Los Angeles',
  '913': 'Los Angeles', '914': 'Los Angeles', '915': 'Los Angeles', '916': 'Sacramento',
  '917': 'Los Angeles', '918': 'Los Angeles', '935': 'Los Angeles',
  // San Diego CA (919-921)
  '919': 'San Diego', '920': 'San Diego', '921': 'San Diego',
  // San Francisco Bay Area (940-944, 946-948)
  '940': 'San Francisco', '941': 'San Francisco', '942': 'San Francisco',
  '943': 'San Francisco', '944': 'San Francisco',
  '946': 'San Francisco', '947': 'San Francisco', '948': 'San Francisco',
  // San Jose (950-951)
  '950': 'San Jose', '951': 'San Jose',
  // Napa (945)
  '945': 'Napa',
  // Santa Rosa/Sonoma (949, 954-955)
  '949': 'Santa Rosa', '954': 'Santa Rosa', '955': 'Santa Rosa',
  // Denver CO (800-803, 805-806, 808-809)
  '800': 'Denver', '801': 'Denver', '802': 'Denver', '803': 'Denver',
  '805': 'Denver', '806': 'Denver', '808': 'Denver', '809': 'Denver', '804': 'Denver',
  // Miami FL (330-332, 334)
  '330': 'Miami', '331': 'Miami', '332': 'Miami', '334': 'Miami', '333': 'Miami',
  // Orlando FL (327-329)
  '327': 'Orlando', '328': 'Orlando', '329': 'Orlando',
  // Tampa FL (335-337, 346)
  '335': 'Tampa', '336': 'Tampa', '337': 'Tampa', '346': 'Tampa', '338': 'Tampa',
  // Atlanta GA (300-303, 306, 311-313)
  '300': 'Atlanta', '301': 'Atlanta', '302': 'Atlanta', '303': 'Atlanta',
  '306': 'Atlanta', '311': 'Atlanta', '312': 'Atlanta', '313': 'Atlanta',
  // Chicago IL (606-608, 600-605)
  '600': 'Chicago', '601': 'Chicago', '602': 'Chicago', '603': 'Chicago',
  '604': 'Chicago', '605': 'Chicago', '606': 'Chicago', '607': 'Chicago', '608': 'Chicago',
  // Indianapolis IN (460-462, 466)
  '460': 'Indianapolis', '461': 'Indianapolis', '462': 'Indianapolis', '466': 'Indianapolis',
  // Boston MA (010-024, 021-022)
  '010': 'Boston', '011': 'Boston', '012': 'Boston', '013': 'Boston', '014': 'Boston',
  '015': 'Boston', '016': 'Boston', '017': 'Boston', '018': 'Boston', '019': 'Boston',
  '020': 'Boston', '021': 'Boston', '022': 'Boston', '023': 'Boston', '024': 'Boston',
  // Detroit MI (480-484)
  '480': 'Detroit', '481': 'Detroit', '482': 'Detroit', '483': 'Detroit', '484': 'Detroit',
  // Minneapolis MN (550-551, 553-555)
  '550': 'Minneapolis', '551': 'Minneapolis', '553': 'Minneapolis', '554': 'Minneapolis', '555': 'Minneapolis',
  // Kansas City MO/KS (640-641, 660-662, 664-666)
  '640': 'Kansas City', '641': 'Kansas City', '660': 'Kansas City', '661': 'Kansas City',
  '662': 'Kansas City', '664': 'Kansas City', '665': 'Kansas City', '666': 'Kansas City',
  // St. Louis MO (630-631, 633, 636, 620-622)
  '630': 'St. Louis', '631': 'St. Louis', '633': 'St. Louis', '636': 'St. Louis',
  '620': 'St. Louis', '621': 'St. Louis', '622': 'St. Louis',
  // Las Vegas NV (889-891)
  '889': 'Las Vegas', '890': 'Las Vegas', '891': 'Las Vegas',
  // New York NY (100-104, 106-109, 110-119)
  '100': 'New York', '101': 'New York', '102': 'New York', '103': 'New York', '104': 'New York',
  '106': 'New York', '107': 'New York', '108': 'New York', '109': 'New York',
  '110': 'New York', '111': 'New York', '112': 'New York', '113': 'New York', '114': 'New York',
  '115': 'New York', '116': 'New York', '117': 'New York', '118': 'New York', '119': 'New York',
  // Rochester NY (145-146)
  '145': 'Rochester', '146': 'Rochester',
  // Buffalo NY (140-144)
  '140': 'Buffalo', '141': 'Buffalo', '142': 'Buffalo', '143': 'Buffalo', '144': 'Buffalo',
  // Syracuse NY (130-132)
  '130': 'Syracuse', '131': 'Syracuse', '132': 'Syracuse',
  // Albany NY (120-124, 128-129)
  '120': 'Albany', '121': 'Albany', '122': 'Albany', '123': 'Albany', '124': 'Albany',
  '128': 'Albany', '129': 'Albany',
  // Cleveland OH (440-442, 444)
  '440': 'Cleveland', '441': 'Cleveland', '442': 'Cleveland', '444': 'Cleveland',
  // Columbus OH (430-432)
  '430': 'Columbus', '431': 'Columbus', '432': 'Columbus',
  // Cincinnati OH (450-452)
  '450': 'Cincinnati', '451': 'Cincinnati', '452': 'Cincinnati',
  // Lexington KY (403-406)
  '403': 'Lexington', '404': 'Lexington', '405': 'Lexington', '406': 'Lexington',
  // Louisville KY (400-402)
  '400': 'Louisville', '401': 'Louisville', '402': 'Louisville',
  // Philadelphia PA (190-191, 193-196)
  '190': 'Philadelphia', '191': 'Philadelphia', '193': 'Philadelphia',
  '194': 'Philadelphia', '195': 'Philadelphia', '196': 'Philadelphia',
  // Pittsburgh PA (150-152)
  '150': 'Pittsburgh', '151': 'Pittsburgh', '152': 'Pittsburgh',
  // Nashville TN (370-372)
  '370': 'Nashville', '371': 'Nashville', '372': 'Nashville',
  // Austin TX (787, 786, 789, 785)
  '786': 'Austin', '787': 'Austin', '789': 'Austin', '785': 'Austin', '788': 'Austin',
  // Dallas TX (750-753, 755-759, 760-761, 762-763, 764-766, 768-769, 730-731)
  '750': 'Dallas', '751': 'Dallas', '752': 'Dallas', '753': 'Dallas',
  '755': 'Dallas', '756': 'Dallas', '757': 'Dallas', '758': 'Dallas', '759': 'Dallas',
  '760': 'Dallas', '761': 'Dallas', '762': 'Dallas', '763': 'Dallas',
  '764': 'Dallas', '765': 'Dallas', '766': 'Dallas', '768': 'Dallas', '769': 'Dallas',
  '730': 'Dallas', '731': 'Dallas', '754': 'Dallas',
  // Houston TX (770-772, 773-778)
  '770': 'Houston', '771': 'Houston', '772': 'Houston', '773': 'Houston',
  '774': 'Houston', '775': 'Houston', '776': 'Houston', '777': 'Houston', '778': 'Houston',
  // San Antonio TX (780-782, 784)
  '780': 'San Antonio', '781': 'San Antonio', '782': 'San Antonio', '784': 'San Antonio', '783': 'San Antonio',
  // Salt Lake City UT (840-841, 843, 846-847)
  '840': 'Salt Lake City', '841': 'Salt Lake City', '843': 'Salt Lake City', '846': 'Salt Lake City', '847': 'Salt Lake City',
  // Seattle WA (980-981, 983-984, 985-986)
  '980': 'Seattle', '981': 'Seattle', '983': 'Seattle', '984': 'Seattle',
  '985': 'Seattle', '986': 'Seattle',
  // Spokane WA (988-994)
  '988': 'Spokane', '989': 'Spokane', '990': 'Spokane', '991': 'Spokane',
  '992': 'Spokane', '993': 'Spokane', '994': 'Spokane',
  // Anchorage AK (995-999)
  '995': 'Anchorage', '996': 'Anchorage', '997': 'Anchorage', '998': 'Anchorage', '999': 'Anchorage',
  // Washington DC and Northern Virginia (200-205, 209, 220-224)
  // Use "Washington" to match database format "Washington, DC"
  '200': 'Washington', '201': 'Washington', '202': 'Washington',
  '203': 'Washington', '204': 'Washington', '205': 'Washington', '209': 'Washington',
  '220': 'Washington', '221': 'Washington', '222': 'Washington', '223': 'Washington',
  '224': 'Washington',
  // Baltimore MD (210-212, 214-215, 217, 219)
  '210': 'Baltimore', '211': 'Baltimore', '212': 'Baltimore', '214': 'Baltimore',
  '215': 'Baltimore', '217': 'Baltimore', '219': 'Baltimore',
  // Charlotte NC (280-282, 284)
  '280': 'Charlotte', '281': 'Charlotte', '282': 'Charlotte', '284': 'Charlotte',
  // Raleigh NC (276-277)
  '276': 'Raleigh', '277': 'Raleigh',
  // New Orleans LA (700-701, 704)
  '700': 'New Orleans', '701': 'New Orleans', '704': 'New Orleans',
  // Portland OR (970-972, 974-975)
  '970': 'Portland', '971': 'Portland', '972': 'Portland', '974': 'Portland', '975': 'Portland',
  // Milwaukee WI (530-532, 534)
  '530': 'Milwaukee', '531': 'Milwaukee', '532': 'Milwaukee', '534': 'Milwaukee',
  // Grand Rapids MI (493-495, 496-499)
  '493': 'Grand Rapids', '494': 'Grand Rapids', '495': 'Grand Rapids',
  '496': 'Grand Rapids', '497': 'Grand Rapids', '498': 'Grand Rapids', '499': 'Grand Rapids',
  // New Jersey (near NYC) (070-089)
  '070': 'New York', '071': 'New York', '072': 'New York', '073': 'New York', '074': 'New York',
  '075': 'New York', '076': 'New York', '077': 'New York', '078': 'New York', '079': 'New York',
  '080': 'Philadelphia', '081': 'Philadelphia', '082': 'Philadelphia', '083': 'Philadelphia',
  '084': 'Philadelphia', '085': 'Philadelphia', '086': 'Philadelphia', '087': 'Philadelphia',
  '088': 'Philadelphia', '089': 'Philadelphia',
  // Connecticut (060-069) - near NYC/Boston
  '060': 'New York', '061': 'New York', '062': 'New York', '063': 'New York', '064': 'New York',
  '065': 'New York', '066': 'New York', '067': 'New York', '068': 'New York', '069': 'New York',
  // Maryland suburbs of DC (206-208, 218, 207)
  '206': 'Washington', '207': 'Washington', '208': 'Washington', '218': 'Baltimore',
  // Note: Tucson (856-857) is served by Phoenix vehicles
  // Richmond VA (230-234)
  '230': 'Richmond', '231': 'Richmond', '232': 'Richmond', '233': 'Richmond', '234': 'Richmond',
  // Virginia Beach/Norfolk (233-239)
  '235': 'Virginia Beach', '236': 'Virginia Beach', '237': 'Virginia Beach', '238': 'Virginia Beach', '239': 'Virginia Beach',
  // Raleigh extended (275, 278-279)
  '275': 'Raleigh', '278': 'Raleigh', '279': 'Raleigh',
  // Charlotte extended (283, 285-289)
  '283': 'Charlotte', '285': 'Charlotte', '286': 'Charlotte', '287': 'Charlotte', '288': 'Charlotte', '289': 'Charlotte',
  // Jacksonville FL (320-322)
  '320': 'Jacksonville', '321': 'Jacksonville', '322': 'Jacksonville',
  // Albuquerque NM (870-871, 873)
  '870': 'Albuquerque', '871': 'Albuquerque', '873': 'Albuquerque',
  // Oklahoma City OK (730-731, 733, 734-735)
  '733': 'Oklahoma City', '734': 'Oklahoma City', '735': 'Oklahoma City',
  // Tulsa OK (740-741, 743-745)
  '740': 'Tulsa', '741': 'Tulsa', '743': 'Tulsa', '744': 'Tulsa', '745': 'Tulsa',
  // Omaha NE (680-681, 683-685)
  '680': 'Omaha', '681': 'Omaha', '683': 'Omaha', '684': 'Omaha', '685': 'Omaha',
  // Providence RI (028-029)
  '028': 'Providence', '029': 'Providence',
  // Hartford CT (060-061, 062-069) - already covered above with NYC
  // Sacramento CA (956-958)
  '956': 'Sacramento', '957': 'Sacramento', '958': 'Sacramento',
  // Fresno CA (936-937, 939)
  '936': 'Fresno', '937': 'Fresno', '939': 'Fresno',
  // Long Island NY (115-119) - already covered
  // Birmingham AL (350-352, 354-359)
  '350': 'Birmingham', '351': 'Birmingham', '352': 'Birmingham', '354': 'Birmingham',
  '355': 'Birmingham', '356': 'Birmingham', '357': 'Birmingham', '358': 'Birmingham', '359': 'Birmingham',
  // Montgomery AL (360-361, 363)
  '360': 'Montgomery', '361': 'Montgomery', '363': 'Montgomery',
  // Mobile AL (365-366)
  '365': 'Mobile', '366': 'Mobile',
  // Huntsville AL (357-358) - already covered by Birmingham
  
  // ===== CANADA =====
  // Toronto ON (M and L postal codes)
  'M1B': 'Toronto', 'M1C': 'Toronto', 'M1E': 'Toronto', 'M1G': 'Toronto', 'M1H': 'Toronto',
  'M1J': 'Toronto', 'M1K': 'Toronto', 'M1L': 'Toronto', 'M1M': 'Toronto', 'M1N': 'Toronto',
  'M1P': 'Toronto', 'M1R': 'Toronto', 'M1S': 'Toronto', 'M1T': 'Toronto', 'M1V': 'Toronto',
  'M1W': 'Toronto', 'M1X': 'Toronto', 'M2H': 'Toronto', 'M2J': 'Toronto', 'M2K': 'Toronto',
  'M2L': 'Toronto', 'M2M': 'Toronto', 'M2N': 'Toronto', 'M2P': 'Toronto', 'M2R': 'Toronto',
  'M3A': 'Toronto', 'M3B': 'Toronto', 'M3C': 'Toronto', 'M3H': 'Toronto', 'M3J': 'Toronto',
  'M3K': 'Toronto', 'M3L': 'Toronto', 'M3M': 'Toronto', 'M3N': 'Toronto', 'M4A': 'Toronto',
  'M4B': 'Toronto', 'M4C': 'Toronto', 'M4E': 'Toronto', 'M4G': 'Toronto', 'M4H': 'Toronto',
  'M4J': 'Toronto', 'M4K': 'Toronto', 'M4L': 'Toronto', 'M4M': 'Toronto', 'M4N': 'Toronto',
  'M4P': 'Toronto', 'M4R': 'Toronto', 'M4S': 'Toronto', 'M4T': 'Toronto', 'M4V': 'Toronto',
  'M4W': 'Toronto', 'M4X': 'Toronto', 'M4Y': 'Toronto', 'M5A': 'Toronto', 'M5B': 'Toronto',
  'M5C': 'Toronto', 'M5E': 'Toronto', 'M5G': 'Toronto', 'M5H': 'Toronto', 'M5J': 'Toronto',
  'M5K': 'Toronto', 'M5L': 'Toronto', 'M5M': 'Toronto', 'M5N': 'Toronto', 'M5P': 'Toronto',
  'M5R': 'Toronto', 'M5S': 'Toronto', 'M5T': 'Toronto', 'M5V': 'Toronto', 'M5W': 'Toronto',
  'M5X': 'Toronto', 'M6A': 'Toronto', 'M6B': 'Toronto', 'M6C': 'Toronto', 'M6E': 'Toronto',
  'M6G': 'Toronto', 'M6H': 'Toronto', 'M6J': 'Toronto', 'M6K': 'Toronto', 'M6L': 'Toronto',
  'M6M': 'Toronto', 'M6N': 'Toronto', 'M6P': 'Toronto', 'M6R': 'Toronto', 'M6S': 'Toronto',
  'M7A': 'Toronto', 'M7Y': 'Toronto', 'M8V': 'Toronto', 'M8W': 'Toronto', 'M8X': 'Toronto',
  'M8Y': 'Toronto', 'M8Z': 'Toronto', 'M9A': 'Toronto', 'M9B': 'Toronto', 'M9C': 'Toronto',
  'M9L': 'Toronto', 'M9M': 'Toronto', 'M9N': 'Toronto', 'M9P': 'Toronto', 'M9R': 'Toronto',
  'M9V': 'Toronto', 'M9W': 'Toronto',
  // Toronto GTA (L postal codes)
  'L4B': 'Toronto', 'L4C': 'Toronto', 'L4E': 'Toronto', 'L4G': 'Toronto', 'L4H': 'Toronto',
  'L4J': 'Toronto', 'L4K': 'Toronto', 'L4L': 'Toronto', 'L4S': 'Toronto', 'L4T': 'Toronto',
  'L4V': 'Toronto', 'L4W': 'Toronto', 'L4X': 'Toronto', 'L4Y': 'Toronto', 'L4Z': 'Toronto',
  'L5A': 'Toronto', 'L5B': 'Toronto', 'L5C': 'Toronto', 'L5E': 'Toronto', 'L5G': 'Toronto',
  'L5H': 'Toronto', 'L5J': 'Toronto', 'L5K': 'Toronto', 'L5L': 'Toronto', 'L5M': 'Toronto',
  'L5N': 'Toronto', 'L5P': 'Toronto', 'L5R': 'Toronto', 'L5S': 'Toronto', 'L5T': 'Toronto',
  'L5V': 'Toronto', 'L5W': 'Toronto', 'L6B': 'Toronto', 'L6C': 'Toronto', 'L6E': 'Toronto',
  'L6G': 'Toronto', 'L6H': 'Toronto', 'L6J': 'Toronto', 'L6K': 'Toronto', 'L6L': 'Toronto',
  'L6M': 'Toronto', 'L6P': 'Toronto', 'L6R': 'Toronto', 'L6S': 'Toronto', 'L6T': 'Toronto',
  'L6V': 'Toronto', 'L6W': 'Toronto', 'L6X': 'Toronto', 'L6Y': 'Toronto', 'L6Z': 'Toronto',
  'L7A': 'Toronto', 'L3P': 'Toronto', 'L3R': 'Toronto', 'L3S': 'Toronto', 'L3T': 'Toronto',
  'L1S': 'Toronto', 'L1T': 'Toronto', 'L1V': 'Toronto', 'L1W': 'Toronto', 'L1X': 'Toronto',
  'L1Y': 'Toronto', 'L1Z': 'Toronto', 'L3X': 'Toronto', 'L3Y': 'Toronto',
  
  // Windsor ON (N postal codes)
  'N0P': 'Windsor', 'N0R': 'Windsor', 'N8A': 'Windsor', 'N8H': 'Windsor', 'N8M': 'Windsor',
  'N8N': 'Windsor', 'N8P': 'Windsor', 'N8R': 'Windsor', 'N8S': 'Windsor', 'N8T': 'Windsor',
  'N8V': 'Windsor', 'N8W': 'Windsor', 'N8X': 'Windsor', 'N8Y': 'Windsor', 'N9A': 'Windsor',
  'N9B': 'Windsor', 'N9C': 'Windsor', 'N9E': 'Windsor', 'N9G': 'Windsor', 'N9H': 'Windsor',
  'N9J': 'Windsor', 'N9K': 'Windsor', 'N9V': 'Windsor', 'N9Y': 'Windsor',
  
  // Winnipeg MB (R postal codes)
  'R0C': 'Winnipeg', 'R0G': 'Winnipeg', 'R0H': 'Winnipeg', 'R1A': 'Winnipeg', 'R1B': 'Winnipeg',
  'R1C': 'Winnipeg', 'R2C': 'Winnipeg', 'R2E': 'Winnipeg', 'R2G': 'Winnipeg', 'R2H': 'Winnipeg',
  'R2J': 'Winnipeg', 'R2K': 'Winnipeg', 'R2L': 'Winnipeg', 'R2M': 'Winnipeg', 'R2N': 'Winnipeg',
  'R2P': 'Winnipeg', 'R2R': 'Winnipeg', 'R2V': 'Winnipeg', 'R2W': 'Winnipeg', 'R2X': 'Winnipeg',
  'R2Y': 'Winnipeg', 'R3A': 'Winnipeg', 'R3B': 'Winnipeg', 'R3C': 'Winnipeg', 'R3E': 'Winnipeg',
  'R3G': 'Winnipeg', 'R3H': 'Winnipeg', 'R3J': 'Winnipeg', 'R3K': 'Winnipeg', 'R3L': 'Winnipeg',
  'R3M': 'Winnipeg', 'R3N': 'Winnipeg', 'R3P': 'Winnipeg', 'R3R': 'Winnipeg', 'R3S': 'Winnipeg',
  'R3T': 'Winnipeg', 'R3V': 'Winnipeg', 'R3W': 'Winnipeg', 'R3X': 'Winnipeg', 'R3Y': 'Winnipeg',
  'R4A': 'Winnipeg', 'R4G': 'Winnipeg', 'R4H': 'Winnipeg', 'R4J': 'Winnipeg', 'R4K': 'Winnipeg',
  'R4L': 'Winnipeg', 'R5A': 'Winnipeg', 'R5G': 'Winnipeg',
  
  // Montreal QC (H postal codes)
  'H1A': 'Montreal', 'H1B': 'Montreal', 'H1C': 'Montreal', 'H1E': 'Montreal', 'H1G': 'Montreal',
  'H1H': 'Montreal', 'H1J': 'Montreal', 'H1K': 'Montreal', 'H1L': 'Montreal', 'H1M': 'Montreal',
  'H1N': 'Montreal', 'H1P': 'Montreal', 'H1R': 'Montreal', 'H1S': 'Montreal', 'H1T': 'Montreal',
  'H1V': 'Montreal', 'H1W': 'Montreal', 'H1X': 'Montreal', 'H1Y': 'Montreal', 'H1Z': 'Montreal',
  'H2A': 'Montreal', 'H2B': 'Montreal', 'H2C': 'Montreal', 'H2E': 'Montreal', 'H2G': 'Montreal',
  'H2H': 'Montreal', 'H2J': 'Montreal', 'H2K': 'Montreal', 'H2L': 'Montreal', 'H2M': 'Montreal',
  'H2N': 'Montreal', 'H2P': 'Montreal', 'H2R': 'Montreal', 'H2S': 'Montreal', 'H2T': 'Montreal',
  'H2V': 'Montreal', 'H2W': 'Montreal', 'H2X': 'Montreal', 'H2Y': 'Montreal', 'H2Z': 'Montreal',
  'H3A': 'Montreal', 'H3B': 'Montreal', 'H3C': 'Montreal', 'H3E': 'Montreal', 'H3G': 'Montreal',
  'H3H': 'Montreal', 'H3J': 'Montreal', 'H3K': 'Montreal', 'H3L': 'Montreal', 'H3M': 'Montreal',
  'H3N': 'Montreal', 'H3P': 'Montreal', 'H3R': 'Montreal', 'H3S': 'Montreal', 'H3T': 'Montreal',
  'H3V': 'Montreal', 'H3W': 'Montreal', 'H3X': 'Montreal', 'H3Y': 'Montreal', 'H3Z': 'Montreal',
  'H4A': 'Montreal', 'H4B': 'Montreal', 'H4C': 'Montreal', 'H4E': 'Montreal', 'H4G': 'Montreal',
  'H4H': 'Montreal', 'H4J': 'Montreal', 'H4K': 'Montreal', 'H4L': 'Montreal', 'H4M': 'Montreal',
  'H4N': 'Montreal', 'H4P': 'Montreal', 'H4R': 'Montreal', 'H4S': 'Montreal', 'H4T': 'Montreal',
  'H4V': 'Montreal', 'H4W': 'Montreal', 'H4X': 'Montreal', 'H4Y': 'Montreal', 'H4Z': 'Montreal',
  'H5A': 'Montreal', 'H5B': 'Montreal', 'H7A': 'Montreal', 'H7B': 'Montreal', 'H7C': 'Montreal',
  'H7E': 'Montreal', 'H7G': 'Montreal', 'H7H': 'Montreal', 'H7J': 'Montreal', 'H7K': 'Montreal',
  'H7L': 'Montreal', 'H7M': 'Montreal', 'H7N': 'Montreal', 'H7P': 'Montreal', 'H7R': 'Montreal',
  'H7S': 'Montreal', 'H7T': 'Montreal', 'H7V': 'Montreal', 'H7W': 'Montreal', 'H7X': 'Montreal',
  'H7Y': 'Montreal', 'H8N': 'Montreal', 'H8P': 'Montreal', 'H8R': 'Montreal', 'H8S': 'Montreal',
  'H8T': 'Montreal', 'H8Y': 'Montreal', 'H8Z': 'Montreal', 'H9A': 'Montreal', 'H9B': 'Montreal',
  'H9C': 'Montreal', 'H9E': 'Montreal', 'H9G': 'Montreal', 'H9H': 'Montreal', 'H9J': 'Montreal',
  'H9K': 'Montreal', 'H9P': 'Montreal', 'H9R': 'Montreal', 'H9S': 'Montreal', 'H9W': 'Montreal',
  'H9X': 'Montreal', 'J4B': 'Montreal', 'J4G': 'Montreal', 'J4H': 'Montreal', 'J4J': 'Montreal',
  'J4K': 'Montreal', 'J4L': 'Montreal', 'J4M': 'Montreal', 'J4N': 'Montreal', 'J4P': 'Montreal',
  'J4R': 'Montreal', 'J4S': 'Montreal', 'J4T': 'Montreal', 'J4V': 'Montreal', 'J4W': 'Montreal',
  'J4X': 'Montreal', 'J4Y': 'Montreal', 'J4Z': 'Montreal',
};

// Display names for cities where search term differs from display
// Key = search term (what we send to API), Value = display name (what user sees)
const CITY_DISPLAY_NAMES: Record<string, string> = {
  'Washington': 'Washington DC',
};

// Get metro area from ZIP/postal code (US or Canada)
// Returns { searchCity, displayCity } where searchCity is for API and displayCity is for UI
function getMetroFromZip(zip: string): { searchCity: string; displayCity: string } | null {
  const cleanZip = zip.toUpperCase().replace(/\s+/g, '');
  // Canadian postal codes: first 3 chars (e.g., M1B, L4K, N8A, R2C)
  const canadianPrefix = cleanZip.substring(0, 3);
  if (ZIP_TO_METRO[canadianPrefix]) {
    const searchCity = ZIP_TO_METRO[canadianPrefix];
    return { 
      searchCity, 
      displayCity: CITY_DISPLAY_NAMES[searchCity] || searchCity 
    };
  }
  // US ZIP codes: first 3 digits
  const usPrefix = cleanZip.substring(0, 3);
  const searchCity = ZIP_TO_METRO[usPrefix];
  if (searchCity) {
    return { 
      searchCity, 
      displayCity: CITY_DISPLAY_NAMES[searchCity] || searchCity 
    };
  }
  return null;
}
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

function convertToISODate(text: string): string | null {
  const lower = text.toLowerCase().trim();
  const today = new Date();
  
  // Handle mm/dd or mm/dd/yyyy formats (US format)
  const slashMatch = lower.match(/^(\d{1,2})\/(\d{1,2})(\/(\d{2,4}))?$/);
  if (slashMatch) {
    const month = parseInt(slashMatch[1], 10);
    const day = parseInt(slashMatch[2], 10);
    let year = slashMatch[4] ? parseInt(slashMatch[4], 10) : today.getFullYear();
    
    // Handle 2-digit year
    if (year < 100) {
      year += 2000;
    }
    
    // If date has passed this year, assume next year
    if (!slashMatch[4]) {
      const targetDate = new Date(year, month - 1, day);
      if (targetDate < today) {
        year++;
      }
    }
    
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  
  // Handle "march 29", "march 29th", "mar 29", "march 29 2026", "on march 29"
  const monthDayMatch = lower.match(/^(?:on\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?$/i);
  if (monthDayMatch) {
    const monthStr = monthDayMatch[1].toLowerCase();
    const day = parseInt(monthDayMatch[2], 10);
    let year = monthDayMatch[3] ? parseInt(monthDayMatch[3], 10) : today.getFullYear();
    
    const monthNum = MONTH_ABBREVS[monthStr];
    if (monthNum !== undefined && day >= 1 && day <= 31) {
      // If date has passed this year, assume next year
      if (!monthDayMatch[3]) {
        const targetDate = new Date(year, monthNum, day);
        if (targetDate < today) {
          year++;
        }
      }
      return `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  
  // Handle "29th march", "29 march 2026"
  const dayMonthMatch = lower.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}))?$/i);
  if (dayMonthMatch) {
    const day = parseInt(dayMonthMatch[1], 10);
    const monthStr = dayMonthMatch[2].toLowerCase();
    let year = dayMonthMatch[3] ? parseInt(dayMonthMatch[3], 10) : today.getFullYear();
    
    const monthNum = MONTH_ABBREVS[monthStr];
    if (monthNum !== undefined && day >= 1 && day <= 31) {
      if (!dayMonthMatch[3]) {
        const targetDate = new Date(year, monthNum, day);
        if (targetDate < today) {
          year++;
        }
      }
      return `${year}-${String(monthNum + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  
  return null;
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

// Single-word event identifiers
const EVENT_KEYWORDS = [
  'wedding', 'prom', 'birthday', 'bachelor', 'bachelorette', 'graduation',
  'concert', 'party', 'quinceanera', 'anniversary', 'corporate', 'airport',
  'funeral', 'bar mitzvah', 'bat mitzvah', 'homecoming', 'formal',
  'reception', 'ceremony', 'gala', 'banquet', 'retreat', 'conference',
  'meeting', 'seminar', 'symposium', 'convention', 'expo', 'showcase',
  'festival', 'carnival', 'fair', 'parade', 'rally', 'fundraiser',
  'charity', 'auction', 'premiere', 'launch', 'reveal', 'opening',
  'celebration', 'shower', 'rehearsal', 'engagement', 'proposal',
];

// Multi-word event phrases that should ALWAYS be detected as events
// These take priority over name detection
const EVENT_PHRASES = [
  'corporate event', 'corporate outing', 'corporate trip', 'corporate party',
  'company event', 'company outing', 'company party', 'team building',
  'birthday party', 'birthday celebration', 'birthday bash',
  'bachelor party', 'bachelorette party', 'bridal shower', 'baby shower',
  'wedding reception', 'wedding ceremony', 'rehearsal dinner',
  'wine tour', 'wine tasting', 'brewery tour', 'bar crawl', 'bar hopping',
  'night out', 'night on the town', 'girls night', 'guys night', 'ladies night',
  'sweet sixteen', 'sweet 16', 'quince', 'quinces',
  'sporting event', 'football game', 'basketball game', 'baseball game',
  'hockey game', 'soccer game', 'golf outing', 'golf tournament',
  'holiday party', 'christmas party', 'new years', 'new year',
  'casino trip', 'casino night', 'vegas trip',
  'airport transfer', 'airport pickup', 'airport dropoff', 'airport run',
  'school dance', 'prom night', 'homecoming dance', 'formal dance',
  'business trip', 'business meeting', 'client event', 'client meeting',
  'award ceremony', 'awards dinner', 'awards gala',
  'private event', 'special event', 'special occasion',
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
  'shuttle van': 'Shuttle',
  'sprinter': 'Sprinter',
  'mercedes sprinter': 'Sprinter',
  'sprinter van': 'Sprinter',
  'executive': 'Executive',
  'executive van': 'Executive',
  'charter': 'Charter Bus',
  'charter bus': 'Charter Bus',
  'coach': 'Charter Bus',
  'coach bus': 'Charter Bus',
  'motor coach': 'Charter Bus',
  'sedan': 'Sedan',
  'town car': 'Sedan',
  'towncar': 'Sedan',
  'lincoln': 'Sedan',
  'suv': 'SUV',
  'escalade': 'SUV',
  'navigator': 'SUV',
  'suburban': 'SUV',
  'yukon': 'SUV',
  'hummer': 'Hummer',
  'h2': 'Hummer',
  'trolley': 'Trolley',
  'vintage': 'Vintage',
  'classic': 'Vintage',
  'rolls royce': 'Rolls Royce',
  'bentley': 'Bentley',
  'van': 'Van',
  'passenger van': 'Van',
  'minivan': 'Van',
  'mini van': 'Van',
  'bus': 'Bus',
  'mini bus': 'Mini Bus',
  'minibus': 'Mini Bus',
};

const CITY_KEYWORDS = [
  // Major metros
  'phoenix', 'scottsdale', 'mesa', 'tempe', 'glendale', 'chandler', 'gilbert',
  'peoria', 'surprise', 'goodyear', 'avondale', 'tucson', 'las vegas', 'denver',
  'chicago', 'dallas', 'houston', 'austin', 'san antonio', 'los angeles',
  'san diego', 'san francisco', 'seattle', 'portland', 'atlanta', 'miami',
  'orlando', 'tampa', 'boston', 'new york', 'philadelphia', 'detroit', 'napa',
  'birmingham', 'tuscaloosa', 'huntsville', 'montgomery', 'mobile',
  'minneapolis', 'st louis', 'kansas city', 'nashville', 'memphis', 'charlotte',
  'westmont', 'springfield', 'clinton', 'franklin', 'madison', 'madison wi',
  'madison wisconsin', 'georgetown', 'greenville', 'bristol', 'auburn', 'oxford', 
  'riverside', 'fairfield', 'manchester', 'columbia', 'lexington', 
  'nyc', 'la', 'sf', 'dc', 'philly',
  'grand rapids', 'ann arbor', 'salt lake city', 'oklahoma city', 'fort worth',
  'san jose', 'jacksonville', 'indianapolis', 'columbus', 'fort lauderdale',
  'el paso', 'milwaukee', 'albuquerque', 'raleigh', 'omaha', 'virginia beach',
  'colorado springs', 'long beach', 'oakland', 'sacramento', 'fresno', 'tulsa',
  'cleveland', 'pittsburgh', 'cincinnati', 'bakersfield', 'wichita', 'arlington',
  'aurora', 'pasadena', 'ontario', 'richmond',
  // Michigan cities
  'battle creek', 'kalamazoo', 'lansing', 'flint', 'saginaw', 'muskegon', 'traverse city',
  'holland', 'port huron', 'jackson', 'midland', 'bay city', 'dearborn', 'livonia',
  'warren', 'sterling heights', 'troy', 'farmington hills', 'southfield', 'novi',
  // Ohio cities
  'akron', 'toledo', 'dayton', 'youngstown', 'canton', 'parma', 'lorain', 'hamilton',
  'kettering', 'elyria', 'lakewood', 'cuyahoga falls', 'euclid', 'mentor', 'dublin',
  // Indiana cities
  'fort wayne', 'evansville', 'south bend', 'carmel', 'fishers', 'bloomington',
  'hammond', 'gary', 'muncie', 'terre haute', 'kokomo', 'lafayette', 'noblesville',
  // Illinois cities (beyond Chicago)
  'rockford', 'naperville', 'joliet', 'elgin', 'waukegan', 'champaign', 'urbana',
  'peoria il', 'bloomington il', 'normal', 'decatur', 'aurora il', 'schaumburg',
  // Wisconsin cities
  'green bay', 'kenosha', 'racine', 'appleton', 'waukesha', 'oshkosh', 'eau claire',
  'janesville', 'la crosse', 'sheboygan', 'fond du lac', 'brookfield', 'wausau',
  // Minnesota cities
  'st paul', 'rochester mn', 'duluth', 'bloomington mn', 'brooklyn park', 'plymouth',
  'woodbury', 'maple grove', 'blaine', 'lakeville', 'burnsville', 'eden prairie',
  // Iowa cities
  'des moines', 'cedar rapids', 'davenport', 'sioux city', 'iowa city', 'waterloo',
  'council bluffs', 'ames', 'dubuque', 'west des moines', 'ankeny', 'urbandale',
  // Missouri cities
  'st charles', 'independence', 'columbia mo', 'lee summit', 'ofallon', 'springfield mo',
  'joplin', 'jefferson city', 'cape girardeau', 'florissant', 'chesterfield',
  // Kansas cities
  'wichita', 'overland park', 'kansas city ks', 'olathe', 'topeka', 'lawrence',
  'shawnee', 'manhattan ks', 'lenexa', 'salina', 'hutchinson',
  // Nebraska cities
  'omaha', 'lincoln', 'bellevue', 'grand island', 'kearney', 'fremont', 'hastings',
  // North Dakota / South Dakota
  'fargo', 'bismarck', 'grand forks', 'minot', 'sioux falls', 'rapid city', 'aberdeen',
  // Texas cities (comprehensive)
  'lubbock', 'amarillo', 'laredo', 'corpus christi', 'brownsville', 'mcallen',
  'midland tx', 'odessa', 'beaumont', 'waco', 'abilene', 'tyler', 'college station',
  'round rock', 'pearland', 'sugar land', 'the woodlands', 'killeen', 'carrollton',
  // Florida cities (comprehensive)
  'st petersburg', 'hialeah', 'tallahassee', 'cape coral', 'fort myers', 'pembroke pines',
  'hollywood fl', 'gainesville fl', 'miramar', 'coral springs', 'clearwater', 'palm bay',
  'lakeland', 'pompano beach', 'west palm beach', 'davie', 'boca raton', 'sunrise',
  // Georgia cities
  'savannah', 'augusta', 'macon', 'athens', 'sandy springs', 'roswell', 'johns creek',
  'alpharetta', 'marietta', 'smyrna', 'albany ga', 'valdosta', 'warner robins',
  // North Carolina cities
  'durham', 'greensboro', 'winston salem', 'fayetteville', 'cary', 'wilmington nc',
  'high point', 'concord', 'asheville', 'gastonia', 'jacksonville nc', 'chapel hill',
  // South Carolina cities
  'columbia sc', 'charleston', 'north charleston', 'mount pleasant', 'rock hill',
  'greenville sc', 'summerville', 'goose creek', 'hilton head', 'myrtle beach',
  // Virginia cities
  'virginia beach', 'norfolk', 'chesapeake', 'richmond', 'newport news', 'alexandria',
  'hampton', 'roanoke', 'portsmouth', 'suffolk', 'lynchburg', 'harrisonburg',
  // Tennessee cities
  'knoxville', 'chattanooga', 'clarksville', 'murfreesboro', 'franklin tn', 'jackson tn',
  'johnson city', 'bartlett', 'hendersonville', 'kingsport', 'collierville', 'smyrna tn',
  // Kentucky cities
  'louisville', 'lexington ky', 'bowling green', 'owensboro', 'covington', 'hopkinsville',
  'richmond ky', 'florence ky', 'georgetown ky', 'elizabethtown', 'nicholasville',
  // Alabama cities
  'birmingham', 'montgomery', 'mobile', 'huntsville', 'tuscaloosa', 'hoover',
  'dothan', 'auburn al', 'decatur al', 'madison al', 'florence al', 'gadsden',
  // Mississippi cities
  'jackson ms', 'gulfport', 'southaven', 'biloxi', 'hattiesburg', 'olive branch',
  'tupelo', 'meridian', 'greenville ms', 'horn lake', 'clinton ms', 'pearl',
  // Louisiana cities
  'new orleans', 'baton rouge', 'shreveport', 'metairie', 'lafayette la', 'lake charles',
  'kenner', 'bossier city', 'monroe la', 'alexandria la', 'houma', 'new iberia',
  // Arkansas cities
  'little rock', 'fort smith', 'fayetteville ar', 'springdale ar', 'jonesboro',
  'north little rock', 'conway', 'rogers ar', 'bentonville', 'pine bluff', 'hot springs',
  // Oklahoma cities
  'oklahoma city', 'tulsa', 'norman', 'broken arrow', 'lawton', 'edmond', 'moore ok',
  'midwest city', 'enid', 'stillwater', 'muskogee', 'bartlesville', 'owasso',
  // New Mexico cities
  'albuquerque', 'las cruces', 'rio rancho', 'santa fe', 'roswell nm', 'farmington nm',
  'clovis nm', 'hobbs', 'alamogordo', 'carlsbad nm',
  // Arizona cities (beyond Phoenix metro)
  'tucson', 'yuma', 'flagstaff', 'prescott', 'lake havasu city', 'bullhead city',
  'casa grande', 'sierra vista', 'maricopa az', 'apache junction', 'prescott valley',
  // Nevada cities
  'las vegas', 'henderson', 'reno', 'north las vegas', 'sparks', 'carson city',
  // Utah cities
  'salt lake city', 'west valley city', 'provo', 'west jordan', 'orem', 'sandy ut',
  'ogden', 'st george', 'layton', 'south jordan', 'lehi', 'millcreek', 'taylorsville',
  // Colorado cities
  'denver', 'colorado springs', 'aurora co', 'fort collins', 'lakewood co', 'thornton',
  'arvada', 'westminster co', 'pueblo', 'centennial', 'boulder', 'greeley', 'longmont',
  // Idaho cities
  'boise', 'meridian id', 'nampa', 'idaho falls', 'pocatello', 'caldwell', 'coeur dalene',
  'twin falls', 'lewiston', 'post falls', 'rexburg', 'moscow id',
  // Montana cities
  'billings', 'missoula', 'great falls', 'bozeman', 'butte', 'helena', 'kalispell',
  // Wyoming cities
  'cheyenne', 'casper', 'laramie', 'gillette', 'rock springs', 'sheridan', 'jackson wy',
  // Washington cities
  'seattle', 'spokane', 'tacoma', 'vancouver wa', 'bellevue', 'kent', 'everett',
  'renton', 'spokane valley', 'federal way', 'yakima', 'bellingham', 'kirkland',
  // Oregon cities
  'portland', 'salem', 'eugene', 'gresham', 'hillsboro', 'beaverton', 'bend',
  'medford', 'springfield or', 'corvallis', 'albany or', 'tigard', 'lake oswego',
  // California cities (comprehensive)
  'los angeles', 'san diego', 'san jose', 'san francisco', 'fresno', 'sacramento',
  'long beach', 'oakland', 'bakersfield', 'anaheim', 'santa ana', 'riverside',
  'stockton', 'irvine', 'chula vista', 'fremont', 'san bernardino', 'modesto',
  'fontana', 'moreno valley', 'glendale ca', 'huntington beach', 'santa clarita',
  'garden grove', 'oceanside', 'rancho cucamonga', 'ontario ca', 'santa rosa',
  'elk grove', 'corona', 'lancaster', 'palmdale', 'salinas', 'pomona', 'hayward',
  'escondido', 'sunnyvale', 'torrance', 'pasadena ca', 'orange', 'fullerton',
  'thousand oaks', 'roseville', 'concord ca', 'simi valley', 'santa clara',
  'victorville', 'vallejo', 'berkeley', 'el monte', 'downey', 'costa mesa',
  'inglewood', 'carlsbad', 'san buenaventura', 'ventura', 'fairfield ca', 'west covina',
  'murrieta', 'richmond ca', 'norwalk', 'antioch ca', 'temecula', 'burbank',
  'daly city', 'el cajon', 'san mateo', 'clovis', 'compton', 'jurupa valley',
  'vista', 'south gate', 'mission viejo', 'vacaville', 'carson', 'hesperia',
  'santa maria', 'redding', 'westminster ca', 'santa monica', 'chico', 'newport beach',
  // New England cities
  'hartford', 'new haven', 'stamford', 'bridgeport', 'waterbury', 'norwalk ct',
  'providence', 'warwick', 'cranston', 'pawtucket', 'worcester', 'springfield ma',
  'lowell', 'cambridge', 'new bedford', 'brockton', 'quincy', 'lynn', 'fall river',
  'manchester nh', 'nashua', 'concord nh', 'portsmouth nh', 'dover nh', 'rochester nh',
  'burlington vt', 'south burlington', 'rutland', 'barre', 'montpelier',
  'portland me', 'lewiston me', 'bangor', 'south portland', 'auburn me',
  // Mid-Atlantic cities
  'newark', 'jersey city', 'paterson', 'elizabeth', 'edison', 'woodbridge',
  'lakewood nj', 'toms river', 'trenton', 'camden', 'cherry hill', 'atlantic city',
  'yonkers', 'rochester ny', 'buffalo', 'syracuse', 'albany ny', 'new rochelle',
  'mount vernon ny', 'schenectady', 'utica', 'white plains', 'hempstead', 'troy ny',
  'wilmington de', 'dover de', 'newark de', 'middletown de', 'smyrna de',
  'baltimore', 'frederick', 'rockville', 'gaithersburg', 'bowie', 'hagerstown',
  'annapolis', 'college park md', 'salisbury', 'laurel md', 'greenbelt',
  'washington dc', 'arlington va', 'fairfax', 'falls church', 'manassas', 'leesburg',
  // Alaska / Hawaii
  'anchorage', 'fairbanks', 'juneau', 'sitka', 'ketchikan', 'wasilla',
  'honolulu', 'pearl city', 'hilo', 'kailua', 'kapolei', 'kaneohe', 'maui', 'kona',
  // Canada
  'toronto', 'windsor', 'winnipeg', 'montreal', 'windsor ontario', 'windsor on', 'toronto ontario',
  'toronto on', 'winnipeg manitoba', 'winnipeg mb', 'montreal quebec', 'montreal qc',
  'mississauga', 'brampton', 'markham', 'vaughan', 'oakville', 'scarborough', 'north york', 
  'etobicoke', 'richmond hill', 'laval', 'longueuil', 'brossard', 'terrebonne',
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
  'silverthorne': 'Denver', 'silverthorn': 'Denver', 'aurora co': 'Denver',
  'lakewood': 'Denver', 'thornton': 'Denver', 'arvada': 'Denver', 'westminster': 'Denver', 
  'centennial': 'Denver', 'highlands ranch': 'Denver', 'boulder': 'Denver', 
  'broomfield': 'Denver', 'littleton': 'Denver', 'parker': 'Denver', 'castle rock': 'Denver', 
  'golden': 'Denver', 'englewood': 'Denver', 'commerce city': 'Denver', 
  'lone tree': 'Denver', 'greenwood village': 'Denver', 'fort collins': 'Denver',
  'colorado springs': 'Denver', 'vail': 'Denver', 'breckenridge': 'Denver', 'aspen': 'Denver',
  // Dallas-Fort Worth metro
  'fort worth': 'Dallas', 'arlington tx': 'Dallas', 'plano': 'Dallas', 
  'irving': 'Dallas', 'garland': 'Dallas', 'frisco': 'Dallas', 'mckinney': 'Dallas', 
  'denton': 'Dallas', 'carrollton': 'Dallas', 'richardson': 'Dallas', 'lewisville': 'Dallas', 
  'allen': 'Dallas', 'flower mound': 'Dallas', 'grapevine': 'Dallas', 'mesquite': 'Dallas', 
  'grand prairie': 'Dallas', 'euless': 'Dallas', 'bedford': 'Dallas', 'hurst': 'Dallas',
  'colleyville': 'Dallas', 'southlake': 'Dallas', 'keller': 'Dallas', 'coppell': 'Dallas',
  'rockwall': 'Dallas', 'rowlett': 'Dallas', 'wylie': 'Dallas', 'sachse': 'Dallas',
  'azle': 'Dallas', 'azle tx': 'Dallas', 'azle texas': 'Dallas',
  'weatherford': 'Dallas', 'weatherford tx': 'Dallas', 'weatherford texas': 'Dallas',
  // Houston metro (including Galveston)
  'the woodlands': 'Houston', 'sugar land': 'Houston', 'pearland': 'Houston', 
  'league city': 'Houston', 'katy': 'Houston', 'baytown': 'Houston', 'conroe': 'Houston', 
  'pasadena tx': 'Houston', 'missouri city': 'Houston', 
  'spring': 'Houston', 'cypress': 'Houston', 'humble': 'Houston',
  'galveston': 'Houston', 'galveston tx': 'Houston', 'texas city': 'Houston',
  'jamaica beach': 'Houston', 'jamaica beach tx': 'Houston', 'crystal beach': 'Houston',
  'bolivar': 'Houston', 'bolivar peninsula': 'Houston', 'port bolivar': 'Houston',
  'surfside': 'Houston', 'surfside beach': 'Houston', 'freeport': 'Houston', 'freeport tx': 'Houston',
  'clear lake': 'Houston', 'friendswood': 'Houston', 'seabrook': 'Houston',
  'kemah': 'Houston', 'webster': 'Houston', 'la porte': 'Houston', 'deer park': 'Houston',
  'tomball': 'Houston', 'kingwood': 'Houston', 'atascocita': 'Houston', 'richmond tx': 'Houston',
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
  'santa clarita': 'Los Angeles', 'garden grove': 'Los Angeles',
  'ontario ca': 'Los Angeles', 'rancho cucamonga': 'Los Angeles', 'pomona': 'Los Angeles', 
  'fullerton': 'Los Angeles', 'pasadena ca': 'Los Angeles', 'burbank': 'Los Angeles', 
  'torrance': 'Los Angeles', 'costa mesa': 'Los Angeles', 'newport beach': 'Los Angeles',
  'laguna beach': 'Los Angeles', 'san clemente': 'San Diego',
  // San Diego North County & Temecula Valley
  'carlsbad': 'San Diego', 'oceanside': 'San Diego', 'escondido': 'San Diego', 
  'temecula': 'San Diego', 'murrieta': 'San Diego', 'temecula ca': 'San Diego',
  'murrieta ca': 'San Diego', 'wine country ca': 'San Diego',
  'riverside': 'Los Angeles', 'riverside ca': 'Los Angeles', 'corona': 'Los Angeles',
  'fontana': 'Los Angeles', 'moreno valley': 'Los Angeles', 'san bernardino': 'Los Angeles',
  // San Francisco Bay Area (excluding San Jose and Napa which have own rates)
  'oakland': 'San Francisco', 'fremont': 'San Francisco',
  'hayward': 'San Francisco', 'concord': 'San Francisco', 'berkeley': 'San Francisco',
  'daly city': 'San Francisco', 'walnut creek': 'San Francisco', 'pleasanton': 'San Francisco',
  'livermore': 'San Francisco', 'san mateo': 'San Francisco', 'redwood city': 'San Francisco',
  // San Jose metro (separate from SF)
  'sunnyvale': 'San Jose', 'santa clara': 'San Jose', 'milpitas': 'San Jose',
  'cupertino': 'San Jose', 'mountain view': 'San Jose', 'palo alto': 'San Jose',
  'menlo park': 'San Jose', 'los gatos': 'San Jose', 'campbell': 'San Jose',
  // Napa/Wine Country (separate from SF)
  'napa': 'Napa', 'napa valley': 'Napa', 'yountville': 'Napa', 'st helena': 'Napa', 'calistoga': 'Napa',
  // Santa Rosa/Sonoma (could be separate or grouped)
  'santa rosa': 'Santa Rosa', 'sonoma': 'Santa Rosa', 'petaluma': 'Santa Rosa', 'rohnert park': 'Santa Rosa',
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
  // Atlanta metro - comprehensive coverage
  'sandy springs': 'Atlanta', 'roswell': 'Atlanta', 'johns creek': 'Atlanta', 
  'alpharetta': 'Atlanta', 'marietta': 'Atlanta', 'smyrna': 'Atlanta', 
  'dunwoody': 'Atlanta', 'brookhaven': 'Atlanta', 'decatur': 'Atlanta', 
  'lawrenceville': 'Atlanta', 'duluth': 'Atlanta', 'duluth ga': 'Atlanta', 
  'kennesaw': 'Atlanta', 'peachtree city': 'Atlanta', 'newnan': 'Atlanta',
  'douglasville': 'Atlanta', 'woodstock ga': 'Atlanta', 'canton ga': 'Atlanta',
  'mableton': 'Atlanta', 'mableton ga': 'Atlanta', 'austell': 'Atlanta', 'austell ga': 'Atlanta',
  'powder springs': 'Atlanta', 'acworth': 'Atlanta', 'cartersville': 'Atlanta',
  'rome ga': 'Atlanta', 'dallas ga': 'Atlanta', 'hiram': 'Atlanta', 'hiram ga': 'Atlanta',
  'villa rica': 'Atlanta', 'temple ga': 'Atlanta', 'lithia springs': 'Atlanta',
  'fairburn': 'Atlanta', 'union city': 'Atlanta', 'union city ga': 'Atlanta',
  'college park': 'Atlanta', 'college park ga': 'Atlanta', 'east point': 'Atlanta',
  'hapeville': 'Atlanta', 'forest park': 'Atlanta', 'forest park ga': 'Atlanta',
  'riverdale': 'Atlanta', 'riverdale ga': 'Atlanta', 'jonesboro': 'Atlanta', 'jonesboro ga': 'Atlanta',
  'morrow': 'Atlanta', 'morrow ga': 'Atlanta', 'lake city ga': 'Atlanta', 'rex': 'Atlanta',
  'stockbridge': 'Atlanta', 'mcdonough': 'Atlanta', 'hampton': 'Atlanta', 'hampton ga': 'Atlanta',
  'locust grove': 'Atlanta', 'jackson ga': 'Atlanta', 'griffin': 'Atlanta', 'griffin ga': 'Atlanta',
  'fayetteville': 'Atlanta', 'fayetteville ga': 'Atlanta', 'tyrone': 'Atlanta', 'tyrone ga': 'Atlanta',
  'senoia': 'Atlanta', 'brooks ga': 'Atlanta', 'sharpsburg': 'Atlanta',
  'peachtree corners': 'Atlanta', 'norcross': 'Atlanta', 'lilburn': 'Atlanta',
  'snellville': 'Atlanta', 'loganville': 'Atlanta', 'grayson': 'Atlanta',
  'dacula': 'Atlanta', 'buford': 'Atlanta', 'buford ga': 'Atlanta', 'flowery branch': 'Atlanta',
  'suwanee': 'Atlanta', 'cumming': 'Atlanta', 'cumming ga': 'Atlanta', 'dawsonville': 'Atlanta',
  'gainesville': 'Atlanta', 'gainesville ga': 'Atlanta', 'oakwood': 'Atlanta', 'oakwood ga': 'Atlanta',
  'braselton': 'Atlanta', 'hoschton': 'Atlanta', 'winder': 'Atlanta', 'winder ga': 'Atlanta',
  'bethlehem ga': 'Atlanta', 'auburn ga': 'Atlanta', 'statham': 'Atlanta',
  'tucker': 'Atlanta', 'stone mountain': 'Atlanta', 'clarkston': 'Atlanta',
  'scottdale': 'Atlanta', 'avondale estates': 'Atlanta', 'pine lake': 'Atlanta',
  'lithonia': 'Atlanta', 'conyers': 'Atlanta', 'covington': 'Atlanta', 'covington ga': 'Atlanta',
  'social circle': 'Atlanta', 'monroe ga': 'Atlanta', 'loganville ga': 'Atlanta',
  'chamblee': 'Atlanta', 'doraville': 'Atlanta', 'berkeley lake': 'Atlanta',
  'vinings': 'Atlanta', 'buckhead': 'Atlanta', 'midtown atlanta': 'Atlanta',
  'atlantic station': 'Atlanta', 'downtown atlanta': 'Atlanta', 'old fourth ward': 'Atlanta',
  'inman park': 'Atlanta', 'little five points': 'Atlanta', 'east atlanta': 'Atlanta',
  'grant park': 'Atlanta', 'kirkwood ga': 'Atlanta', 'edgewood': 'Atlanta',
  'west end': 'Atlanta', 'westview': 'Atlanta', 'cascade': 'Atlanta', 'camp creek': 'Atlanta',
  'sandy plains': 'Atlanta', 'east cobb': 'Atlanta', 'west cobb': 'Atlanta',
  'south cobb': 'Atlanta', 'north cobb': 'Atlanta', 'cobb county': 'Atlanta',
  'gwinnett': 'Atlanta', 'gwinnett county': 'Atlanta', 'dekalb': 'Atlanta', 'dekalb county': 'Atlanta',
  'fulton county': 'Atlanta', 'forsyth county ga': 'Atlanta', 'cherokee county ga': 'Atlanta',
  'henry county ga': 'Atlanta', 'clayton county': 'Atlanta', 'cobb': 'Atlanta',
  // Las Vegas metro
  'henderson': 'Las Vegas', 'north las vegas': 'Las Vegas', 'enterprise': 'Las Vegas',
  'spring valley': 'Las Vegas', 'spring valley nv': 'Las Vegas', 
  'sunrise manor': 'Las Vegas', 'paradise nv': 'Las Vegas',
  'summerlin': 'Las Vegas', 'green valley': 'Las Vegas', 'boulder city': 'Las Vegas',
  // Seattle metro
  'tacoma': 'Seattle', 'bellevue': 'Seattle', 'kent': 'Seattle', 'everett': 'Seattle',
  'renton': 'Seattle', 'federal way': 'Seattle', 'kirkland': 'Seattle',
  'redmond': 'Seattle', 'auburn wa': 'Seattle', 'sammamish': 'Seattle', 'issaquah': 'Seattle',
  'bothell': 'Seattle', 'lynnwood': 'Seattle', 'edmonds': 'Seattle', 'burien': 'Seattle',
  // Spokane metro (not part of Seattle)
  'spokane valley': 'Spokane', 'liberty lake': 'Spokane', 'cheney': 'Spokane',
  'airway heights': 'Spokane', 'deer park wa': 'Spokane', 'mead': 'Spokane',
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
  // Philadelphia metro (extensive coverage)
  'camden': 'Philadelphia', 'cherry hill': 'Philadelphia', 'wilmington': 'Philadelphia',
  'chester': 'Philadelphia', 'norristown': 'Philadelphia', 'king of prussia': 'Philadelphia',
  'havertown': 'Philadelphia', 'haverford': 'Philadelphia', 'bryn mawr': 'Philadelphia',
  'ardmore': 'Philadelphia', 'wayne pa': 'Philadelphia', 'devon': 'Philadelphia',
  'malvern': 'Philadelphia', 'paoli': 'Philadelphia', 'west chester': 'Philadelphia',
  'media pa': 'Philadelphia', 'springfield pa': 'Philadelphia', 'drexel hill': 'Philadelphia',
  'upper darby': 'Philadelphia', 'lansdowne': 'Philadelphia', 'yeadon': 'Philadelphia',
  'darby': 'Philadelphia', 'collingdale': 'Philadelphia', 'sharon hill': 'Philadelphia',
  'ridley park': 'Philadelphia', 'swarthmore': 'Philadelphia', 'wallingford pa': 'Philadelphia',
  'newtown square': 'Philadelphia', 'glen mills': 'Philadelphia', 'chadds ford': 'Philadelphia',
  'kennett square': 'Philadelphia', 'conshohocken': 'Philadelphia', 'plymouth meeting': 'Philadelphia',
  'blue bell': 'Philadelphia', 'lafayette hill': 'Philadelphia', 'fort washington pa': 'Philadelphia',
  'ambler': 'Philadelphia', 'horsham': 'Philadelphia', 'willow grove': 'Philadelphia',
  'jenkintown': 'Philadelphia', 'elkins park': 'Philadelphia', 'cheltenham': 'Philadelphia',
  'abington': 'Philadelphia', 'glenside': 'Philadelphia', 'wyncote': 'Philadelphia',
  'huntingdon valley': 'Philadelphia', 'meadowbrook': 'Philadelphia', 'feasterville': 'Philadelphia',
  'trevose': 'Philadelphia', 'bensalem': 'Philadelphia', 'langhorne': 'Philadelphia',
  'newtown pa': 'Philadelphia', 'yardley': 'Philadelphia', 'morrisville pa': 'Philadelphia',
  'doylestown': 'Philadelphia', 'warrington pa': 'Philadelphia', 'warminster': 'Philadelphia',
  'hatboro': 'Philadelphia', 'lansdale': 'Philadelphia', 'north wales': 'Philadelphia',
  'collegeville': 'Philadelphia', 'trappe': 'Philadelphia', 'phoenixville': 'Philadelphia',
  'pottstown': 'Philadelphia', 'exton': 'Philadelphia', 'downingtown': 'Philadelphia',
  'coatesville': 'Philadelphia', 'radnor': 'Philadelphia', 'villanova': 'Philadelphia',
  'gladwyne': 'Philadelphia', 'narberth': 'Philadelphia', 'bala cynwyd': 'Philadelphia',
  'merion': 'Philadelphia', 'wynnewood': 'Philadelphia', 'overbrook': 'Philadelphia',
  'manayunk': 'Philadelphia', 'roxborough': 'Philadelphia', 'chestnut hill': 'Philadelphia',
  'germantown pa': 'Philadelphia', 'mount airy': 'Philadelphia', 'wissahickon': 'Philadelphia',
  'northeast philly': 'Philadelphia', 'center city': 'Philadelphia', 'south philly': 'Philadelphia',
  'delaware county': 'Philadelphia', 'delco': 'Philadelphia', 'montgomery county pa': 'Philadelphia',
  'bucks county': 'Philadelphia', 'chester county': 'Philadelphia', 'main line': 'Philadelphia',
  'voorhees': 'Philadelphia', 'moorestown': 'Philadelphia', 'marlton': 'Philadelphia',
  'mt laurel': 'Philadelphia', 'mount laurel': 'Philadelphia', 'haddonfield': 'Philadelphia',
  'collingswood': 'Philadelphia', 'gloucester city': 'Philadelphia', 'woodbury nj': 'Philadelphia',
  'deptford': 'Philadelphia', 'sewell': 'Philadelphia', 'glassboro': 'Philadelphia',
  'sicklerville': 'Philadelphia', 'williamstown nj': 'Philadelphia', 'vineland': 'Philadelphia',
  // New York metro
  'brooklyn': 'New York', 'queens': 'New York', 'bronx': 'New York', 'staten island': 'New York',
  'yonkers': 'New York', 'new rochelle': 'New York', 'white plains': 'New York',
  'jersey city': 'New York', 'newark': 'New York', 'hoboken': 'New York',
  'stamford': 'New York', 'greenwich': 'New York', 'long island': 'New York',
  'garden city': 'New York', 'great neck': 'New York', 'huntington': 'New York',
  // Rochester NY metro
  'rochester': 'Rochester', 'rochester ny': 'Rochester', 'rochester new york': 'Rochester',
  'greece': 'Rochester', 'greece ny': 'Rochester', 'gates': 'Rochester', 'henrietta': 'Rochester',
  'pittsford': 'Rochester', 'webster ny': 'Rochester', 'victor ny': 'Rochester', 'fairport': 'Rochester',
  'penfield': 'Rochester', 'brighton ny': 'Rochester', 'irondequoit': 'Rochester', 'chili ny': 'Rochester',
  'perinton': 'Rochester', 'mendon': 'Rochester', 'rush ny': 'Rochester', 'spencerport': 'Rochester',
  'brockport': 'Rochester', 'hilton ny': 'Rochester', 'hamlin': 'Rochester', 'churchville': 'Rochester',
  'scottsville': 'Rochester', 'honeoye falls': 'Rochester', 'canandaigua': 'Rochester',
  'farmington ny': 'Rochester', 'macedon': 'Rochester', 'palmyra ny': 'Rochester', 'newark ny': 'Rochester',
  'geneva ny': 'Rochester', 'batavia ny': 'Rochester', 'geneseo': 'Rochester', 'avon ny': 'Rochester',
  // Buffalo NY metro
  'buffalo': 'Buffalo', 'buffalo ny': 'Buffalo', 'buffalo new york': 'Buffalo',
  'niagara falls': 'Buffalo', 'niagara falls ny': 'Buffalo', 'amherst ny': 'Buffalo',
  'cheektowaga': 'Buffalo', 'tonawanda': 'Buffalo', 'west seneca': 'Buffalo', 'hamburg ny': 'Buffalo',
  'orchard park': 'Buffalo', 'williamsville': 'Buffalo', 'clarence': 'Buffalo', 'lancaster ny': 'Buffalo',
  'depew': 'Buffalo', 'lackawanna': 'Buffalo', 'kenmore': 'Buffalo', 'grand island': 'Buffalo',
  'lewiston ny': 'Buffalo', 'lockport ny': 'Buffalo', 'north tonawanda': 'Buffalo', 'east aurora': 'Buffalo',
  'dunkirk': 'Buffalo', 'fredonia': 'Buffalo', 'jamestown ny': 'Buffalo',
  // Syracuse NY metro
  'syracuse': 'Syracuse', 'syracuse ny': 'Syracuse', 'syracuse new york': 'Syracuse',
  'cicero ny': 'Syracuse', 'clay ny': 'Syracuse', 'dewitt': 'Syracuse', 'manlius': 'Syracuse',
  'fayetteville ny': 'Syracuse', 'liverpool ny': 'Syracuse', 'salina ny': 'Syracuse',
  'camillus': 'Syracuse', 'geddes': 'Syracuse', 'solvay': 'Syracuse', 'baldwinsville': 'Syracuse',
  'auburn ny': 'Syracuse', 'cortland ny': 'Syracuse', 'fulton ny': 'Syracuse', 'oswego ny': 'Syracuse',
  'oneida ny': 'Syracuse', 'rome ny': 'Syracuse', 'utica': 'Syracuse', 'utica ny': 'Syracuse',
  // Albany NY metro
  'albany': 'Albany', 'albany ny': 'Albany', 'albany new york': 'Albany',
  'schenectady': 'Albany', 'schenectady ny': 'Albany', 'troy ny': 'Albany', 'troy new york': 'Albany',
  'saratoga springs ny': 'Albany', 'saratoga ny': 'Albany', 'clifton park': 'Albany', 'colonie': 'Albany',
  'guilderland': 'Albany', 'latham': 'Albany', 'delmar': 'Albany', 'bethlehem ny': 'Albany',
  'cohoes': 'Albany', 'watervliet': 'Albany', 'rensselaer': 'Albany', 'east greenbush': 'Albany',
  'niskayuna': 'Albany', 'rotterdam': 'Albany', 'glenville': 'Albany', 'malta ny': 'Albany',
  'ballston spa': 'Albany', 'glens falls': 'Albany', 'kingston ny': 'Albany', 'poughkeepsie': 'Albany',
  'newburgh ny': 'Albany', 'middletown ny': 'Albany',
  // Washington DC metro
  'arlington va': 'Washington', 'alexandria': 'Washington',
  'bethesda': 'Washington', 'silver spring': 'Washington', 'rockville': 'Washington',
  'tysons': 'Washington', 'reston': 'Washington', 'fairfax': 'Washington',
  'mclean': 'Washington', 'falls church': 'Washington',
  'herndon': 'Washington', 'chantilly': 'Washington', 'centreville': 'Washington',
  'manassas': 'Washington', 'woodbridge': 'Washington', 'woodbridge va': 'Washington',
  'springfield va': 'Washington', 'burke': 'Washington', 'annandale': 'Washington',
  'vienna': 'Washington', 'vienna va': 'Washington', 'oakton': 'Washington',
  'great falls': 'Washington', 'potomac': 'Washington', 'gaithersburg': 'Washington',
  'germantown md': 'Washington', 'frederick md': 'Washington', 'columbia md': 'Washington',
  'laurel md': 'Washington', 'bowie': 'Washington', 'college park md': 'Washington',
  'hyattsville': 'Washington', 'greenbelt': 'Washington', 'upper marlboro': 'Washington',
  'waldorf': 'Washington', 'la plata': 'Washington', 'brandywine md': 'Washington',
  // Richmond VA metro (distinct from Richmond TX suburb of Houston)
  'richmond': 'Richmond', 'richmond va': 'Richmond', 'richmond virginia': 'Richmond',
  'henrico': 'Richmond', 'chesterfield va': 'Richmond', 'mechanicsville': 'Richmond',
  'glen allen': 'Richmond', 'midlothian va': 'Richmond', 'short pump': 'Richmond',
  // Tampa Bay metro
  'st petersburg': 'Tampa', 'saint petersburg': 'Tampa', 'clearwater': 'Tampa',
  'largo': 'Tampa', 'brandon': 'Tampa', 'palm harbor': 'Tampa', 'dunedin': 'Tampa',
  'tarpon springs': 'Tampa', 'temple terrace': 'Tampa', 'plant city': 'Tampa',
  'new port richey': 'Tampa', 'port richey': 'Tampa', 'trinity fl': 'Tampa',
  'wesley chapel': 'Tampa', 'land o lakes': 'Tampa', 'lutz': 'Tampa', 'odessa fl': 'Tampa',
  'riverview fl': 'Tampa', 'apollo beach': 'Tampa', 'ruskin': 'Tampa', 'sun city center': 'Tampa',
  'gibsonton': 'Tampa', 'seffner': 'Tampa', 'valrico': 'Tampa', 'lithia fl': 'Tampa',
  'fishhawk': 'Tampa', 'bayshore': 'Tampa', 'carrollwood': 'Tampa', 'westchase': 'Tampa',
  'town n country': 'Tampa', 'citrus park': 'Tampa', 'oldsmar': 'Tampa', 'safety harbor': 'Tampa',
  'pinellas park': 'Tampa', 'seminole fl': 'Tampa', 'indian rocks beach': 'Tampa',
  'treasure island fl': 'Tampa', 'st pete beach': 'Tampa', 'madeira beach': 'Tampa',
  'redington beach': 'Tampa', 'belleair': 'Tampa', 'belleair beach': 'Tampa',
  'clearwater beach': 'Tampa', 'palm harbor fl': 'Tampa', 'east lake': 'Tampa',
  'holiday fl': 'Tampa', 'hudson fl': 'Tampa', 'spring hill fl': 'Tampa',
  'brooksville': 'Tampa', 'zephyrhills': 'Tampa', 'dade city': 'Tampa',
  // Orlando metro
  'kissimmee': 'Orlando', 'sanford': 'Orlando', 'altamonte springs': 'Orlando',
  'winter park': 'Orlando', 'winter park fl': 'Orlando', 'oviedo': 'Orlando',
  'winter garden': 'Orlando', 'apopka': 'Orlando', 'clermont': 'Orlando',
  'lake mary': 'Orlando', 'longwood': 'Orlando', 'casselberry': 'Orlando',
  'maitland': 'Orlando', 'celebration': 'Orlando', 'st cloud fl': 'Orlando',
  'poinciana': 'Orlando', 'davenport fl': 'Orlando', 'haines city': 'Orlando',
  'winter haven': 'Orlando', 'lakeland': 'Orlando', 'lakeland fl': 'Orlando',
  'deltona': 'Orlando', 'debary': 'Orlando', 'orange city fl': 'Orlando',
  'deland': 'Orlando', 'leesburg': 'Orlando', 'tavares': 'Orlando', 'mount dora': 'Orlando',
  'eustis': 'Orlando', 'lady lake': 'Orlando', 'the villages': 'Orlando',
  'ocala': 'Orlando', 'ocala fl': 'Orlando', 'windermere': 'Orlando', 'dr phillips': 'Orlando',
  'bay hill': 'Orlando', 'international drive': 'Orlando', 'i-drive': 'Orlando',
  'lake buena vista': 'Orlando', 'disney': 'Orlando', 'disney world': 'Orlando',
  'universal orlando': 'Orlando', 'seaworld': 'Orlando', 'ucf': 'Orlando',
  // Indianapolis metro
  'carmel': 'Indianapolis', 'carmel in': 'Indianapolis', 'fishers': 'Indianapolis',
  'noblesville': 'Indianapolis', 'westfield in': 'Indianapolis', 'zionsville': 'Indianapolis',
  'brownsburg': 'Indianapolis', 'avon in': 'Indianapolis', 'plainfield in': 'Indianapolis',
  'greenwood in': 'Indianapolis', 'franklin in': 'Indianapolis', 'whiteland': 'Indianapolis',
  'greenfield in': 'Indianapolis', 'mccordsville': 'Indianapolis', 'fortville': 'Indianapolis',
  'pendleton in': 'Indianapolis', 'anderson in': 'Indianapolis', 'muncie': 'Indianapolis',
  'lawrence in': 'Indianapolis', 'speedway': 'Indianapolis', 'clermont in': 'Indianapolis',
  'mooresville in': 'Indianapolis', 'martinsville in': 'Indianapolis', 'lebanon in': 'Indianapolis',
  'kokomo': 'Indianapolis', 'kokomo in': 'Indianapolis', 'lafayette in': 'Indianapolis',
  'west lafayette': 'Indianapolis', 'crawfordsville': 'Indianapolis', 'shelbyville in': 'Indianapolis',
  'broad ripple': 'Indianapolis', 'downtown indy': 'Indianapolis', 'fountain square': 'Indianapolis',
  'mass ave': 'Indianapolis', 'irvington': 'Indianapolis', 'beech grove': 'Indianapolis',
  'southport in': 'Indianapolis', 'pike township': 'Indianapolis', 'washington township in': 'Indianapolis',
  // Nashville metro
  'franklin tn': 'Nashville', 'brentwood tn': 'Nashville', 'murfreesboro': 'Nashville',
  'smyrna tn': 'Nashville', 'la vergne': 'Nashville', 'hendersonville tn': 'Nashville',
  'gallatin': 'Nashville', 'mount juliet': 'Nashville', 'mt juliet': 'Nashville',
  'lebanon tn': 'Nashville', 'hermitage': 'Nashville', 'donelson': 'Nashville',
  'antioch tn': 'Nashville', 'bellevue tn': 'Nashville', 'whites creek': 'Nashville',
  'goodlettsville': 'Nashville', 'madison tn': 'Nashville', 'old hickory': 'Nashville',
  'nolensville': 'Nashville', 'spring hill tn': 'Nashville', 'thompson station': 'Nashville',
  'columbia tn': 'Nashville', 'dickson tn': 'Nashville', 'clarksville': 'Nashville',
  'clarksville tn': 'Nashville', 'springfield tn': 'Nashville', 'cookeville': 'Nashville',
  'east nashville': 'Nashville', 'downtown nashville': 'Nashville', 'broadway nashville': 'Nashville',
  'the gulch': 'Nashville', 'midtown nashville': 'Nashville', 'green hills': 'Nashville',
  'west end nashville': 'Nashville', 'sylvan park': 'Nashville', 'germantown tn': 'Nashville',
  '12 south': 'Nashville', 'berry hill': 'Nashville', 'music row': 'Nashville',
  // Birmingham metro
  'tuscaloosa': 'Birmingham', 'tuscaloosa al': 'Birmingham', 'hoover': 'Birmingham',
  'hoover al': 'Birmingham', 'vestavia hills': 'Birmingham', 'homewood al': 'Birmingham',
  'mountain brook': 'Birmingham', 'bessemer': 'Birmingham', 'alabaster': 'Birmingham',
  'pelham': 'Birmingham', 'trussville': 'Birmingham', 'gardendale': 'Birmingham',
  'helena': 'Birmingham', 'helena al': 'Birmingham', 'fultondale': 'Birmingham',
  'hueytown': 'Birmingham', 'jasper al': 'Birmingham', 'cullman': 'Birmingham',
  // Charlotte metro
  'matthews': 'Charlotte', 'matthews nc': 'Charlotte', 'mint hill': 'Charlotte',
  'pineville': 'Charlotte', 'huntersville': 'Charlotte', 'cornelius': 'Charlotte',
  'davidson nc': 'Charlotte', 'mooresville nc': 'Charlotte', 'concord nc': 'Charlotte',
  'kannapolis': 'Charlotte', 'gastonia': 'Charlotte', 'rock hill': 'Charlotte',
  'rock hill sc': 'Charlotte', 'fort mill': 'Charlotte', 'fort mill sc': 'Charlotte',
  'indian trail': 'Charlotte', 'waxhaw': 'Charlotte', 'monroe nc': 'Charlotte',
  'ballantyne': 'Charlotte', 'southpark': 'Charlotte', 'dilworth': 'Charlotte',
  'plaza midwood': 'Charlotte', 'noda': 'Charlotte', 'uptown charlotte': 'Charlotte',
  'south end charlotte': 'Charlotte', 'myers park': 'Charlotte', 'eastover': 'Charlotte',
  'university city': 'Charlotte', 'university area': 'Charlotte', 'steele creek': 'Charlotte',
  'belmont nc': 'Charlotte', 'mount holly nc': 'Charlotte', 'cramerton': 'Charlotte',
  'lowell nc': 'Charlotte', 'mcadenville': 'Charlotte', 'stanley nc': 'Charlotte',
  'harrisburg nc': 'Charlotte', 'midland nc': 'Charlotte', 'locust nc': 'Charlotte',
  // St Louis metro
  'clayton': 'St Louis', 'clayton mo': 'St Louis', 'kirkwood': 'St Louis', 'kirkwood mo': 'St Louis',
  'webster groves': 'St Louis', 'maplewood': 'St Louis', 'brentwood mo': 'St Louis',
  'richmond heights': 'St Louis', 'university city mo': 'St Louis', 'ladue': 'St Louis',
  'creve coeur': 'St Louis', 'town and country': 'St Louis', 'chesterfield': 'St Louis',
  'ballwin': 'St Louis', 'ellisville': 'St Louis', 'wildwood mo': 'St Louis',
  'manchester mo': 'St Louis', 'des peres': 'St Louis', 'frontenac': 'St Louis',
  'olivette': 'St Louis', 'overland': 'St Louis', 'st ann': 'St Louis',
  'bridgeton': 'St Louis', 'maryland heights': 'St Louis', 'hazelwood': 'St Louis',
  'florissant': 'St Louis', 'ferguson': 'St Louis', 'spanish lake': 'St Louis',
  'saint charles mo': 'St Louis', 'st charles mo': 'St Louis', 'st peters': 'St Louis',
  'ofallon mo': 'St Louis', "o'fallon mo": 'St Louis', 'wentzville': 'St Louis',
  'cottleville': 'St Louis', 'lake st louis': 'St Louis', 'dardenne prairie': 'St Louis',
  'affton': 'St Louis', 'lemay': 'St Louis', 'mehlville': 'St Louis', 'oakville': 'St Louis',
  'arnold': 'St Louis', 'imperial mo': 'St Louis', 'festus': 'St Louis',
  'south county': 'St Louis', 'west county': 'St Louis', 'north county': 'St Louis',
  'belleville': 'St Louis', 'belleville il': 'St Louis', 'east st louis': 'St Louis',
  'collinsville': 'St Louis', 'edwardsville': 'St Louis', 'alton': 'St Louis', 'granite city': 'St Louis',
  // Kansas City metro
  'overland park': 'Kansas City', 'olathe': 'Kansas City', 'shawnee ks': 'Kansas City',
  'lenexa': 'Kansas City', 'leawood': 'Kansas City', 'prairie village': 'Kansas City',
  'merriam': 'Kansas City', 'mission ks': 'Kansas City', 'roeland park': 'Kansas City',
  'fairway': 'Kansas City', 'westwood ks': 'Kansas City', 'lees summit': 'Kansas City',
  'independence mo': 'Kansas City', 'blue springs': 'Kansas City', 'liberty mo': 'Kansas City',
  'gladstone': 'Kansas City', 'north kansas city': 'Kansas City', 'parkville': 'Kansas City',
  'platte city': 'Kansas City', 'smithville': 'Kansas City', 'kearney mo': 'Kansas City',
  'raytown': 'Kansas City', 'grandview mo': 'Kansas City', 'belton': 'Kansas City',
  'raymore': 'Kansas City', 'peculiar': 'Kansas City', 'harrisonville': 'Kansas City',
  'grain valley': 'Kansas City', 'oak grove mo': 'Kansas City', 'excelsior springs': 'Kansas City',
  'bonner springs': 'Kansas City', 'edwardsville ks': 'Kansas City', 'basehor': 'Kansas City',
  'lansing ks': 'Kansas City', 'leavenworth': 'Kansas City', 'gardner ks': 'Kansas City',
  'spring hill ks': 'Kansas City', 'de soto ks': 'Kansas City', 'eudora ks': 'Kansas City',
  'lawrence ks': 'Kansas City', 'topeka': 'Kansas City',
  // Cincinnati metro
  'covington ky': 'Cincinnati', 'newport ky': 'Cincinnati', 'florence ky': 'Cincinnati',
  'fort thomas': 'Cincinnati', 'erlanger': 'Cincinnati', 'independence ky': 'Cincinnati',
  'mason oh': 'Cincinnati', 'west chester oh': 'Cincinnati', 'liberty township oh': 'Cincinnati',
  'fairfield oh': 'Cincinnati', 'hamilton oh': 'Cincinnati', 'middletown oh': 'Cincinnati',
  'blue ash': 'Cincinnati', 'montgomery oh': 'Cincinnati', 'kenwood': 'Cincinnati',
  'loveland oh': 'Cincinnati', 'milford oh': 'Cincinnati', 'anderson township': 'Cincinnati',
  'indian hill': 'Cincinnati', 'mariemont': 'Cincinnati', 'madeira oh': 'Cincinnati',
  'hyde park oh': 'Cincinnati', 'oakley': 'Cincinnati', 'clifton oh': 'Cincinnati',
  'northside cincinnati': 'Cincinnati', 'over the rhine': 'Cincinnati', 'otr': 'Cincinnati',
  'downtown cincinnati': 'Cincinnati', 'the banks': 'Cincinnati', 'mt adams': 'Cincinnati',
  'norwood oh': 'Cincinnati', 'sharonville': 'Cincinnati', 'springdale oh': 'Cincinnati',
  'forest park oh': 'Cincinnati', 'greenhills': 'Cincinnati', 'finneytown': 'Cincinnati',
  // Columbus metro
  'dublin oh': 'Columbus', 'westerville': 'Columbus', 'gahanna': 'Columbus',
  'reynoldsburg': 'Columbus', 'pickerington': 'Columbus', 'grove city oh': 'Columbus',
  'hilliard': 'Columbus', 'upper arlington': 'Columbus', 'worthington oh': 'Columbus',
  'powell oh': 'Columbus', 'delaware oh': 'Columbus', 'lewis center': 'Columbus',
  'new albany oh': 'Columbus', 'canal winchester': 'Columbus', 'groveport': 'Columbus',
  'obetz': 'Columbus', 'whitehall oh': 'Columbus', 'bexley': 'Columbus',
  'grandview heights': 'Columbus', 'clintonville': 'Columbus', 'victorian village': 'Columbus',
  'german village': 'Columbus', 'short north': 'Columbus', 'downtown columbus': 'Columbus',
  'arena district': 'Columbus', 'italian village': 'Columbus', 'franklinton': 'Columbus',
  'polaris': 'Columbus', 'easton': 'Columbus', 'tuttle crossing': 'Columbus',
  // Cleveland metro
  'lakewood oh': 'Cleveland', 'parma': 'Cleveland', 'euclid': 'Cleveland',
  'cleveland heights': 'Cleveland', 'shaker heights': 'Cleveland', 'beachwood': 'Cleveland',
  'mayfield heights': 'Cleveland', 'solon': 'Cleveland', 'strongsville': 'Cleveland',
  'north olmsted': 'Cleveland', 'westlake oh': 'Cleveland', 'rocky river': 'Cleveland',
  'bay village': 'Cleveland', 'avon oh': 'Cleveland', 'avon lake': 'Cleveland',
  'elyria': 'Cleveland', 'lorain': 'Cleveland', 'mentor': 'Cleveland', 'willoughby': 'Cleveland',
  'independence oh': 'Cleveland', 'brooklyn oh': 'Cleveland', 'brook park': 'Cleveland',
  'garfield heights': 'Cleveland', 'maple heights': 'Cleveland', 'bedford oh': 'Cleveland',
  'twinsburg': 'Cleveland', 'hudson oh': 'Cleveland', 'stow oh': 'Cleveland',
  'akron': 'Cleveland', 'akron oh': 'Cleveland', 'canton oh': 'Cleveland',
  'tremont': 'Cleveland', 'ohio city': 'Cleveland', 'downtown cleveland': 'Cleveland',
  'university circle': 'Cleveland', 'little italy cleveland': 'Cleveland',
  // Pittsburgh metro
  'monroeville': 'Pittsburgh', 'bethel park': 'Pittsburgh', 'mount lebanon': 'Pittsburgh',
  'mt lebanon': 'Pittsburgh', 'upper st clair': 'Pittsburgh', 'south hills': 'Pittsburgh',
  'north hills': 'Pittsburgh', 'ross township': 'Pittsburgh', 'mccandless': 'Pittsburgh',
  'cranberry township': 'Pittsburgh', 'wexford': 'Pittsburgh', 'sewickley': 'Pittsburgh',
  'moon township': 'Pittsburgh', 'robinson': 'Pittsburgh', 'mckees rocks': 'Pittsburgh',
  'coraopolis': 'Pittsburgh', 'carnegie': 'Pittsburgh', 'dormont': 'Pittsburgh',
  'mt washington': 'Pittsburgh', 'shadyside': 'Pittsburgh', 'squirrel hill': 'Pittsburgh',
  'oakland pittsburgh': 'Pittsburgh', 'downtown pittsburgh': 'Pittsburgh',
  'strip district': 'Pittsburgh', 'lawrenceville pa': 'Pittsburgh', 'bloomfield': 'Pittsburgh',
  'east liberty': 'Pittsburgh', 'point breeze': 'Pittsburgh', 'regent square': 'Pittsburgh',
  'wilkinsburg': 'Pittsburgh', 'forest hills pa': 'Pittsburgh', 'murrysville': 'Pittsburgh',
  'irwin': 'Pittsburgh', 'greensburg pa': 'Pittsburgh', 'latrobe': 'Pittsburgh',
  'washington pa': 'Pittsburgh', 'canonsburg': 'Pittsburgh', 'mcmurray': 'Pittsburgh',
  'bridgeville': 'Pittsburgh', 'south fayette': 'Pittsburgh', 'peters township': 'Pittsburgh',
  // Raleigh-Durham metro
  'durham': 'Raleigh', 'durham nc': 'Raleigh', 'chapel hill': 'Raleigh',
  'cary nc': 'Raleigh', 'apex': 'Raleigh', 'holly springs nc': 'Raleigh',
  'morrisville nc': 'Raleigh', 'wake forest': 'Raleigh', 'garner nc': 'Raleigh',
  'fuquay varina': 'Raleigh', 'knightdale': 'Raleigh', 'wendell': 'Raleigh',
  'zebulon': 'Raleigh', 'youngsville': 'Raleigh', 'franklinton nc': 'Raleigh',
  'research triangle': 'Raleigh', 'rtp': 'Raleigh', 'carrboro': 'Raleigh',
  'hillsborough nc': 'Raleigh', 'mebane': 'Raleigh', 'burlington nc': 'Raleigh',
  'downtown raleigh': 'Raleigh', 'north hills raleigh': 'Raleigh', 'glenwood south': 'Raleigh',
  'brier creek': 'Raleigh', 'crabtree': 'Raleigh',
  // San Diego extended
  'chula vista': 'San Diego', 'national city': 'San Diego', 'el cajon': 'San Diego',
  'la mesa': 'San Diego', 'santee': 'San Diego', 'poway': 'San Diego',
  'encinitas': 'San Diego', 'solana beach': 'San Diego', 'del mar': 'San Diego',
  'la jolla': 'San Diego', 'pacific beach': 'San Diego', 'mission beach': 'San Diego',
  'ocean beach': 'San Diego', 'point loma': 'San Diego', 'coronado': 'San Diego',
  'imperial beach': 'San Diego', 'bonita': 'San Diego', 'spring valley ca': 'San Diego',
  'lemon grove': 'San Diego', 'rancho san diego': 'San Diego', 'alpine ca': 'San Diego',
  'ramona': 'San Diego', 'rancho bernardo': 'San Diego', 'rancho penasquitos': 'San Diego',
  'scripps ranch': 'San Diego', 'mira mesa': 'San Diego', 'clairemont': 'San Diego',
  'university city sd': 'San Diego', 'hillcrest': 'San Diego', 'north park': 'San Diego',
  'south park sd': 'San Diego', 'downtown san diego': 'San Diego', 'gaslamp': 'San Diego',
  'east village sd': 'San Diego', 'little italy sd': 'San Diego',
  'vista ca': 'San Diego', 'san marcos ca': 'San Diego', 'fallbrook': 'San Diego',
  // Portland metro
  'beaverton': 'Portland', 'hillsboro': 'Portland', 'gresham': 'Portland',
  'tigard': 'Portland', 'lake oswego': 'Portland', 'tualatin': 'Portland',
  'west linn': 'Portland', 'oregon city': 'Portland', 'milwaukie or': 'Portland',
  'clackamas': 'Portland', 'happy valley or': 'Portland', 'damascus': 'Portland',
  'troutdale': 'Portland', 'fairview or': 'Portland', 'wood village': 'Portland',
  'sherwood or': 'Portland', 'wilsonville': 'Portland', 'canby': 'Portland',
  'mcminnville': 'Portland', 'newberg': 'Portland', 'forest grove': 'Portland',
  'cornelius or': 'Portland', 'aloha': 'Portland', 'cedar hills': 'Portland',
  'cedar mill': 'Portland', 'bethany or': 'Portland', 'tanasbourne': 'Portland',
  'pearl district': 'Portland', 'downtown portland': 'Portland', 'lloyd district': 'Portland',
  'alberta arts': 'Portland', 'hawthorne': 'Portland', 'division': 'Portland',
  'sellwood': 'Portland', 'st johns': 'Portland', 'mississippi': 'Portland',
  'vancouver wa': 'Portland', 'camas': 'Portland', 'washougal': 'Portland',
  // Salt Lake City metro
  'west valley city': 'Salt Lake City', 'sandy ut': 'Salt Lake City', 'west jordan': 'Salt Lake City',
  'south jordan': 'Salt Lake City', 'provo': 'Salt Lake City', 'orem': 'Salt Lake City',
  'ogden': 'Salt Lake City', 'layton': 'Salt Lake City', 'taylorsville': 'Salt Lake City',
  'murray ut': 'Salt Lake City', 'midvale': 'Salt Lake City', 'cottonwood heights': 'Salt Lake City',
  'holladay': 'Salt Lake City', 'millcreek': 'Salt Lake City', 'south salt lake': 'Salt Lake City',
  'draper ut': 'Salt Lake City', 'riverton ut': 'Salt Lake City', 'herriman': 'Salt Lake City',
  'bluffdale': 'Salt Lake City', 'lehi': 'Salt Lake City', 'american fork': 'Salt Lake City',
  'pleasant grove': 'Salt Lake City', 'lindon': 'Salt Lake City', 'vineyard ut': 'Salt Lake City',
  'saratoga springs': 'Salt Lake City', 'eagle mountain': 'Salt Lake City',
  'bountiful': 'Salt Lake City', 'centerville ut': 'Salt Lake City', 'farmington ut': 'Salt Lake City',
  'kaysville': 'Salt Lake City', 'clearfield ut': 'Salt Lake City', 'clinton ut': 'Salt Lake City',
  'roy ut': 'Salt Lake City', 'syracuse ut': 'Salt Lake City', 'park city': 'Salt Lake City',
  'downtown slc': 'Salt Lake City', 'sugar house': 'Salt Lake City', 'the avenues': 'Salt Lake City',
  // Madison WI - major city (not a suburb, maps to itself)
  'madison wi': 'Madison', 'madison wisconsin': 'Madison', 'madison, wi': 'Madison', 'madison, wisconsin': 'Madison',
  
  // ===== CANADA =====
  // Toronto GTA suburbs
  'mississauga': 'Toronto', 'brampton': 'Toronto', 'markham': 'Toronto', 'vaughan': 'Toronto',
  'oakville on': 'Toronto', 'oakville ontario': 'Toronto', 'richmond hill': 'Toronto', 'scarborough': 'Toronto', 'north york': 'Toronto',
  'etobicoke': 'Toronto', 'pickering': 'Toronto', 'ajax': 'Toronto', 'whitby': 'Toronto',
  'oshawa': 'Toronto', 'newmarket': 'Toronto', 'aurora on': 'Toronto', 'king city': 'Toronto',
  'thornhill': 'Toronto', 'maple on': 'Toronto', 'woodbridge on': 'Toronto', 'concord on': 'Toronto',
  'bolton on': 'Toronto', 'caledon': 'Toronto', 'milton on': 'Toronto', 'burlington on': 'Toronto',
  'hamilton on': 'Toronto', 'st catharines': 'Toronto', 'niagara falls on': 'Toronto',
  'georgetown on': 'Toronto', 'halton hills': 'Toronto', 'stouffville': 'Toronto',
  'toronto on': 'Toronto', 'toronto ontario': 'Toronto',
  // Windsor ON suburbs
  'windsor on': 'Windsor', 'windsor ontario': 'Windsor', 'tecumseh on': 'Windsor',
  'lakeshore on': 'Windsor', 'lasalle on': 'Windsor', 'amherstburg': 'Windsor',
  'kingsville on': 'Windsor', 'leamington on': 'Windsor', 'essex on': 'Windsor',
  // Winnipeg MB suburbs
  'winnipeg mb': 'Winnipeg', 'winnipeg manitoba': 'Winnipeg',
  'st boniface': 'Winnipeg', 'transcona': 'Winnipeg', 'st vital': 'Winnipeg',
  'charleswood': 'Winnipeg', 'tuxedo mb': 'Winnipeg', 'river heights mb': 'Winnipeg',
  'selkirk mb': 'Winnipeg', 'steinbach': 'Winnipeg',
  // Montreal QC suburbs
  'montreal qc': 'Montreal', 'montreal quebec': 'Montreal',
  'laval': 'Montreal', 'longueuil': 'Montreal', 'brossard': 'Montreal',
  'terrebonne': 'Montreal', 'repentigny': 'Montreal', 'saint-laurent': 'Montreal',
  'dollard-des-ormeaux': 'Montreal', 'pointe-claire': 'Montreal', 'dorval': 'Montreal',
  'kirkland qc': 'Montreal', 'beaconsfield': 'Montreal', 'pierrefonds': 'Montreal',
  'lasalle qc': 'Montreal', 'verdun': 'Montreal', 'westmount': 'Montreal',
  'outremont': 'Montreal', 'mount royal': 'Montreal', 'cote-saint-luc': 'Montreal',
};

// Estimated travel times in minutes from suburb to metro center (one-way driving)
const CITY_TRAVEL_TIMES: Record<string, number> = {
  // Chicago suburbs (from downtown Chicago)
  'glen ellyn': 35, 'glen ellyn il': 35, 'wheaton': 35, 'wheaton il': 35,
  'naperville': 40, 'naperville il': 40, 'aurora il': 45, 'joliet': 50,
  'downers grove': 30, 'oak brook': 25, 'schaumburg': 35, 'arlington heights': 30,
  'evanston': 20, 'oak park': 15, 'skokie': 20, 'palatine': 35,
  'elgin': 45, 'waukegan': 45, 'highland park': 30, 'lake forest': 35,
  'orland park': 30, 'tinley park': 35, 'bolingbrook': 35, 'lombard': 25,
  'elmhurst': 20, 'hinsdale': 25, 'la grange': 20, 'barrington': 40,
  'crystal lake': 55, 'libertyville': 40, 'gurnee': 45, 'st charles': 45,
  'geneva': 45, 'batavia': 40, 'west chicago': 40, 'carol stream': 35,
  // Dallas-Fort Worth suburbs
  'fort worth': 35, 'arlington tx': 25, 'plano': 25, 'frisco': 35,
  'irving': 15, 'garland': 20, 'mckinney': 40, 'denton': 45,
  'carrollton': 20, 'richardson': 15, 'lewisville': 25, 'grapevine': 25,
  'southlake': 30, 'keller': 35, 'flower mound': 30, 'allen': 30,
  'mesquite': 20, 'grand prairie': 20, 'rockwall': 30, 'rowlett': 25,
  'azle': 25, 'azle tx': 25, 'azle texas': 25,
  'weatherford': 35, 'weatherford tx': 35, 'weatherford texas': 35,
  // Houston suburbs
  'the woodlands': 35, 'sugar land': 30, 'katy': 35, 'pearland': 25,
  'league city': 35, 'baytown': 30, 'conroe': 45, 'spring': 25,
  'cypress': 35, 'humble': 25, 'galveston': 55, 'galveston tx': 55,
  'clear lake': 30, 'friendswood': 30, 'tomball': 35, 'kingwood': 30,
  // Phoenix suburbs
  'mesa': 25, 'mesa az': 25, 'tempe': 15, 'scottsdale': 20,
  'glendale': 15, 'glendale az': 15, 'chandler': 25, 'gilbert': 30,
  'peoria': 25, 'peoria az': 25, 'surprise': 35, 'goodyear': 30,
  'fountain hills': 35, 'queen creek': 40, 'cave creek': 35,
  // Denver suburbs
  'aurora co': 20, 'lakewood': 15, 'boulder': 35, 'thornton': 20,
  'arvada': 20, 'westminster': 20, 'broomfield': 25, 'littleton': 20,
  'centennial': 20, 'highlands ranch': 25, 'parker': 30, 'castle rock': 35,
  'fort collins': 65, 'colorado springs': 70, 'golden': 20,
  'vail': 100, 'breckenridge': 90, 'aspen': 180, 'silverthorne': 75,
  // Los Angeles suburbs
  'long beach': 30, 'anaheim': 35, 'irvine': 45, 'santa ana': 40,
  'glendale ca': 15, 'pasadena ca': 20, 'burbank': 15, 'torrance': 25,
  'huntington beach': 45, 'costa mesa': 45, 'newport beach': 50,
  'ontario ca': 45, 'rancho cucamonga': 50, 'riverside': 60, 'riverside ca': 60,
  'palm desert': 120, 'san bernardino': 65,
  // San Diego suburbs (temecula/murrieta now map to SD)
  'temecula': 55, 'murrieta': 50, 'oceanside': 35, 'carlsbad': 30, 'escondido': 30,
  // San Francisco suburbs
  'oakland': 20, 'fremont': 40, 'berkeley': 20, 'hayward': 35,
  'concord': 35, 'walnut creek': 30, 'pleasanton': 45, 'livermore': 50,
  'daly city': 15, 'san mateo': 25, 'redwood city': 30,
  // Miami suburbs
  'fort lauderdale': 35, 'boca raton': 50, 'west palm beach': 75,
  'hollywood': 25, 'hollywood fl': 25, 'pembroke pines': 30, 'coral springs': 45,
  'davie': 30, 'weston': 35, 'plantation': 30, 'sunrise': 35,
  'delray beach': 60, 'boynton beach': 55, 'coral gables': 15,
  // Atlanta suburbs
  'marietta': 25, 'alpharetta': 30, 'roswell': 25, 'sandy springs': 15,
  'dunwoody': 15, 'smyrna': 20, 'kennesaw': 30, 'lawrenceville': 35,
  'duluth': 30, 'duluth ga': 30, 'johns creek': 30, 'peachtree city': 35,
  'newnan': 40, 'douglasville': 25, 'cumming': 40, 'cumming ga': 40,
  // Detroit suburbs
  'ann arbor': 45, 'troy': 25, 'sterling heights': 25, 'dearborn': 15,
  'livonia': 25, 'warren': 20, 'farmington hills': 25, 'royal oak': 15,
  'southfield': 20, 'novi': 30, 'rochester hills': 30,
  // Remote locations (1+ hour)
  'sedona': 120, 'flagstaff': 150, 'prescott': 100,
  'lake tahoe': 200, 'south lake tahoe': 200, 'mammoth lakes': 300,
  'key west': 180, 'traverse city': 250,
  // Rochester NY suburbs
  'greece': 10, 'greece ny': 10, 'gates': 10, 'henrietta': 15,
  'pittsford': 15, 'webster ny': 20, 'victor ny': 25, 'fairport': 15,
  'penfield': 15, 'brighton ny': 10, 'irondequoit': 10, 'chili ny': 15,
  'spencerport': 20, 'brockport': 25, 'canandaigua': 30, 'geneseo': 35,
  // Buffalo NY suburbs
  'niagara falls': 25, 'niagara falls ny': 25, 'amherst ny': 15,
  'cheektowaga': 10, 'tonawanda': 15, 'west seneca': 15, 'orchard park': 20,
  'williamsville': 15, 'clarence': 20, 'lancaster ny': 20, 'lockport ny': 30,
  // Syracuse NY suburbs
  'cicero ny': 15, 'clay ny': 15, 'dewitt': 10, 'manlius': 15,
  'fayetteville ny': 15, 'liverpool ny': 10, 'baldwinsville': 20,
  'auburn ny': 30, 'cortland ny': 35, 'utica': 55, 'utica ny': 55,
  // Albany NY suburbs
  'schenectady': 20, 'schenectady ny': 20, 'troy ny': 15, 'saratoga springs ny': 35,
  'clifton park': 20, 'colonie': 10, 'guilderland': 15, 'latham': 15,
  'glens falls': 55, 'kingston ny': 55, 'poughkeepsie': 85, 'newburgh ny': 75,
};

// Remote locations that are 1+ hour from the nearest major metro - agent should be warned
const REMOTE_LOCATIONS: Set<string> = new Set([
  // Texas Gulf Coast (1+ hour from Houston)
  'jamaica beach', 'jamaica beach tx', 'crystal beach', 'crystal beach tx',
  'bolivar', 'bolivar peninsula', 'port bolivar', 'bolivar tx',
  'surfside', 'surfside beach', 'freeport', 'freeport tx',
  'port aransas', 'port aransas tx', 'rockport', 'rockport tx',
  'south padre', 'south padre island',
  // Colorado mountains (1+ hour from Denver)
  'vail', 'breckenridge', 'aspen', 'steamboat springs', 'telluride',
  'winter park', 'keystone', 'copper mountain', 'crested butte',
  // Arizona remote
  'sedona', 'flagstaff', 'prescott', 'lake havasu', 'lake havasu city',
  'yuma', 'page', 'williams',
  // California remote
  'lake tahoe', 'south lake tahoe', 'mammoth', 'mammoth lakes',
  'big bear', 'big bear lake', 'palm desert', 'coachella',
  // Nevada
  'reno', 'lake tahoe nv', 'laughlin',
  // Florida remote
  'key west', 'key largo', 'islamorada', 'marathon fl',
  // Michigan remote
  'traverse city', 'mackinac', 'mackinac island', 'sault ste marie',
  // Wisconsin remote
  'door county', 'sturgeon bay', 'wisconsin dells',
]);

// Get normalized city for vehicle search
// Cities that exist in multiple states - track which metro they default to
// When user searches these without state qualifier, we show "SEARCHED: X → SHOWING: Y RATES"
const AMBIGUOUS_CITIES: Record<string, { metro: string; displayAs: string }> = {
  'arlington': { metro: 'Dallas', displayAs: 'Arlington' },
  'aurora': { metro: 'Denver', displayAs: 'Aurora' },
  'pasadena': { metro: 'Los Angeles', displayAs: 'Pasadena' },
  'ontario': { metro: 'Los Angeles', displayAs: 'Ontario' },
  'springfield': { metro: 'St Louis', displayAs: 'Springfield' },
  'columbia': { metro: 'Columbia', displayAs: 'Columbia' },
  'jacksonville': { metro: 'Jacksonville', displayAs: 'Jacksonville' },
  'columbus': { metro: 'Columbus', displayAs: 'Columbus' },
  'birmingham': { metro: 'Birmingham', displayAs: 'Birmingham' },
  'memphis': { metro: 'Memphis', displayAs: 'Memphis' },
  'portland': { metro: 'Portland', displayAs: 'Portland' },
};

function getNormalizedCity(city: string): { normalized: string; original: string; isRemote: boolean; displayCity?: string; travelMinutes?: number } | null {
  const lower = city.toLowerCase().trim();
  // Remove trailing state abbreviations for lookup
  const withoutState = lower.replace(/,?\s*(az|co|tx|ca|il|mi|fl|ga|nv|wa|mn|oh|pa|ny|nj|ma)\.?$/i, '').trim();
  
  // Check with state first (more specific), then without state (fallback)
  // This ensures "aurora il" maps to Chicago, not Denver
  const normalized = CITY_NORMALIZATION[lower] || CITY_NORMALIZATION[withoutState];
  const isRemote = REMOTE_LOCATIONS.has(lower) || REMOTE_LOCATIONS.has(withoutState);
  
  // Get travel time (check with state first, then without)
  const travelMinutes = CITY_TRAVEL_TIMES[lower] || CITY_TRAVEL_TIMES[withoutState];
  
  // Check if this is an ambiguous city (without state qualifier)
  const ambiguous = AMBIGUOUS_CITIES[withoutState];
  if (ambiguous && !CITY_NORMALIZATION[lower]) {
    // User entered ambiguous city without state - normalize but track display name
    return { 
      normalized: ambiguous.metro, 
      original: city, 
      isRemote,
      displayCity: ambiguous.displayAs,
      travelMinutes
    };
  }
  
  if (normalized) {
    return { normalized, original: city, isRemote, travelMinutes };
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
  'dane', 'dean', 'dale', 'darren', 'daryl', 'devin', 'dominic', 'don', 'doug', 'dwight', 'dylan',
  'earl', 'eddie', 'edgar', 'edwin', 'elliot', 'elmer', 'ernest', 'eugene', 'felix', 'floyd',
  'freddie', 'fred', 'gene', 'gerald', 'glen', 'glenn', 'gordon', 'graham', 'hal', 'hank',
  'harold', 'harry', 'harvey', 'hector', 'henry', 'herbert', 'herman', 'howard', 'hugh', 'ivan',
  'irving', 'jackie', 'jaden', 'jaiden', 'jake', 'jamie', 'jared', 'jarrett', 'jay', 'jesse',
  'jess', 'jimmy', 'johnny', 'jonas', 'jonah', 'jordan', 'jorge', 'juan', 'karl', 'keith',
  'ken', 'kenny', 'kerry', 'kirk', 'kurt', 'lance', 'leo', 'leon', 'leonard', 'leroy',
  'leslie', 'lester', 'lloyd', 'lonnie', 'louis', 'lou', 'luke', 'lyle', 'manny', 'marty',
  'marvin', 'mel', 'melvin', 'mickey', 'miles', 'milo', 'mitch', 'morris', 'murray', 'neil',
  'nelson', 'norm', 'norman', 'ollie', 'orlando', 'oscar', 'otis', 'otto', 'owen', 'pat',
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
  'terry', 'carrie', 'jerry', 'barry', 'gary', 'larry', 'harry', 'mary', 'perry', 'sherry', 'kerry',
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

  // US ZIP codes (5 digits, optionally with -4 extension)
  if (ZIP_REGEX.test(trimmed)) {
    const metro = getMetroFromZip(trimmed);
    return { 
      type: 'zip', 
      value: trimmed, 
      confidence: 0.95, 
      original: trimmed,
      ...(metro && { 
        normalizedCity: metro.searchCity,
        ...(metro.displayCity !== metro.searchCity && { displayCity: metro.displayCity })
      })
    };
  }
  
  // Canadian postal codes (e.g., M1B, L4K, N8A 1B2)
  if (CANADIAN_POSTAL_REGEX.test(trimmed)) {
    const metro = getMetroFromZip(trimmed);
    return { 
      type: 'zip', 
      value: trimmed.toUpperCase().substring(0, 3), 
      confidence: 0.95, 
      original: trimmed,
      ...(metro && { 
        normalizedCity: metro.searchCity,
        ...(metro.displayCity !== metro.searchCity && { displayCity: metro.displayCity })
      })
    };
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
        ...(normalized && { 
          normalizedCity: normalized.normalized, 
          isRemote: normalized.isRemote,
          ...(normalized.displayCity && { displayCity: normalized.displayCity }),
          ...(normalized.travelMinutes && { travelMinutes: normalized.travelMinutes })
        })
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
      normalizedCity: normalizedEarly.normalized,
      ...(normalizedEarly.displayCity && { displayCity: normalizedEarly.displayCity }),
      ...(normalizedEarly.travelMinutes && { travelMinutes: normalizedEarly.travelMinutes })
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
  
  // Helper to parse time like "630pm" -> "6:30pm", "5pm" -> "5pm", "530" -> "5:30pm"
  function parseTimeValue(hourPart: string, colonMinutes: string | undefined, rawMinutes: string | undefined, meridiem: string | undefined): string {
    let hour = hourPart;
    let minutes = '00';
    
    // If we have colon minutes like ":30", use those
    if (colonMinutes) {
      minutes = colonMinutes.replace(':', '');
    }
    // If hour part is 3-4 digits like "630" or "1030", split it
    else if (hourPart.length >= 3) {
      if (hourPart.length === 3) {
        // "630" -> hour="6", minutes="30"
        hour = hourPart.charAt(0);
        minutes = hourPart.slice(1);
      } else if (hourPart.length === 4) {
        // "1030" -> hour="10", minutes="30"
        hour = hourPart.slice(0, 2);
        minutes = hourPart.slice(2);
      }
    }
    // If we have raw minutes like "30" after space
    else if (rawMinutes) {
      minutes = rawMinutes.padStart(2, '0');
    }
    
    const period = meridiem ? (meridiem.toLowerCase().startsWith('a') ? 'am' : 'pm') : 'pm';
    return `${hour}:${minutes}${period}`;
  }
  
  // Handle "pu at 630pm", "pu 630pm", "pu at 6:30pm", "pickup at 630 pm", etc.
  // Matches: pu/pickup + (at)? + time (630pm, 6:30pm, 630 pm, 6 30 pm, etc.)
  const puAtTimeMatch = lowerText.match(/^(pu|up|p\.u\.|u\.p\.|p\/u|pickup|pick\s*-?\s*up)\s*(at|@)?\s*(\d{1,4})(:\d{2})?\s*(\d{2})?\s*([ap]\.?m?\.?)?$/i);
  if (puAtTimeMatch) {
    const timeVal = parseTimeValue(puAtTimeMatch[3], puAtTimeMatch[4], puAtTimeMatch[5], puAtTimeMatch[6]);
    return { type: 'time', value: timeVal, confidence: 0.95, original: trimmed };
  }
  
  // Handle "630pm pu", "6:30pm pickup", "630 pm pick up", "6 30 pm pu"
  const timeBeforePuPatternMatch = lowerText.match(/^(\d{1,4})(:\d{2})?\s*(\d{2})?\s*([ap]\.?m?\.?)?\s*(pu|up|p\.u\.|u\.p\.|p\/u|pickup|pick\s*-?\s*up)$/i);
  if (timeBeforePuPatternMatch) {
    const timeVal = parseTimeValue(timeBeforePuPatternMatch[1], timeBeforePuPatternMatch[2], timeBeforePuPatternMatch[3], timeBeforePuPatternMatch[4]);
    return { type: 'time', value: timeVal, confidence: 0.95, original: trimmed };
  }
  
  // Handle "do at 630pm", "dropoff at 6:30pm", etc.
  const doAtTimeMatch = lowerText.match(/^(do|d\.o\.|d\/o|dropoff|drop\s*-?\s*off)\s*(at|@)?\s*(\d{1,4})(:\d{2})?\s*(\d{2})?\s*([ap]\.?m?\.?)?$/i);
  if (doAtTimeMatch) {
    const timeVal = parseTimeValue(doAtTimeMatch[3], doAtTimeMatch[4], doAtTimeMatch[5], doAtTimeMatch[6]);
    return { type: 'time', value: timeVal, confidence: 0.95, original: trimmed };
  }
  
  // Handle "630pm do", "6:30pm dropoff", etc.
  const timeBeforeDoPatternMatch = lowerText.match(/^(\d{1,4})(:\d{2})?\s*(\d{2})?\s*([ap]\.?m?\.?)?\s*(do|d\.o\.|d\/o|dropoff|drop\s*-?\s*off)$/i);
  if (timeBeforeDoPatternMatch) {
    const timeVal = parseTimeValue(timeBeforeDoPatternMatch[1], timeBeforeDoPatternMatch[2], timeBeforeDoPatternMatch[3], timeBeforeDoPatternMatch[4]);
    return { type: 'time', value: timeVal, confidence: 0.95, original: trimmed };
  }
  
  // Handle "pu time is 5pm", "pickup time is 5pm", "pu time 5pm"
  const puTimeIsMatch = lowerText.match(/^(pu|up|p\.u\.|u\.p\.|p\/u|pickup|pick\s*-?\s*up)\s*time\s*(is|=|:)?\s*(\d{1,4})(:\d{2})?\s*(\d{2})?\s*([ap]\.?m?\.?)?$/i);
  if (puTimeIsMatch) {
    const timeVal = parseTimeValue(puTimeIsMatch[3], puTimeIsMatch[4], puTimeIsMatch[5], puTimeIsMatch[6]);
    return { type: 'time', value: timeVal, confidence: 0.92, original: trimmed };
  }
  
  // Handle "do time is 5pm", "dropoff time is 5pm"
  const doTimeIsMatch = lowerText.match(/^(do|d\.o\.|d\/o|dropoff|drop\s*-?\s*off)\s*time\s*(is|=|:)?\s*(\d{1,4})(:\d{2})?\s*(\d{2})?\s*([ap]\.?m?\.?)?$/i);
  if (doTimeIsMatch) {
    const timeVal = parseTimeValue(doTimeIsMatch[3], doTimeIsMatch[4], doTimeIsMatch[5], doTimeIsMatch[6]);
    return { type: 'time', value: timeVal, confidence: 0.92, original: trimmed };
  }
  
  // Handle "pick up time", "pu time", "pickup time" - detect as asking about time (not address)
  const puTimeMatch = lowerText.match(/^(pu|up|p\.u\.|u\.p\.|p\/u|pickup|pick\s*-?\s*up)\s*(time|t)$/i);
  if (puTimeMatch) {
    // This is just "pickup time" without an actual time - skip, let other patterns handle
    // Return null to fall through
  }
  
  // Handle "5pm pu", "5p pickup", "5:30pm pick up" (time before pickup indicator) - legacy pattern
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
  
  // Handle "pu near", "pickup near", "pick up near" patterns
  // e.g., "pu near jamaica beach", "pickup near galveston", "pick up near clear lake"
  const puNearMatch = lowerText.match(/^(pu|up|p\.u\.|u\.p\.|p\/u|pickup|pick\s*-?\s*up)\s*near\s+(.+)/i);
  if (puNearMatch && puNearMatch[2]) {
    const location = puNearMatch[2].trim();
    if (location.length > 1) {
      // Check if location normalizes to a major metro (for pricing lookup)
      const normalized = getNormalizedCity(location);
      return { 
        type: 'pickup_address', 
        value: `Near ${location}`, 
        confidence: 0.92, 
        original: trimmed,
        ...(normalized && { normalizedCity: normalized.normalized, isRemote: normalized.isRemote, ...(normalized.displayCity && { displayCity: normalized.displayCity }) })
      };
    }
  }
  
  // Handle "do near", "dropoff near", "drop off near" patterns
  const doNearMatch = lowerText.match(/^(do|d\.o\.|d\/o|dropoff|drop\s*-?\s*off)\s*near\s+(.+)/i);
  if (doNearMatch && doNearMatch[2]) {
    const location = doNearMatch[2].trim();
    if (location.length > 1) {
      const normalized = getNormalizedCity(location);
      return { 
        type: 'dropoff_address', 
        value: `Near ${location}`, 
        confidence: 0.92, 
        original: trimmed,
        ...(normalized && { normalizedCity: normalized.normalized, isRemote: normalized.isRemote, ...(normalized.displayCity && { displayCity: normalized.displayCity }) })
      };
    }
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
        ...(normalized && { normalizedCity: normalized.normalized, isRemote: normalized.isRemote, ...(normalized.displayCity && { displayCity: normalized.displayCity }) })
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
          ...(normalized && { normalizedCity: normalized.normalized, isRemote: normalized.isRemote, ...(normalized.displayCity && { displayCity: normalized.displayCity }) })
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
        ...(normalized && { normalizedCity: normalized.normalized, isRemote: normalized.isRemote, ...(normalized.displayCity && { displayCity: normalized.displayCity }) })
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
          ...(normalized && { normalizedCity: normalized.normalized, isRemote: normalized.isRemote, ...(normalized.displayCity && { displayCity: normalized.displayCity }) })
        };
      }
    }
  }
  
  const destMatch = lowerText.match(/^(to|going\s+to|destination|dest)\s+(.+)/i);
  if (destMatch && destMatch[2] && destMatch[2].length > 2) {
    return { type: 'destination', value: destMatch[2], confidence: 0.85, original: trimmed };
  }
  
  // PRIORITY: Check for city BEFORE name detection - cities must be detected first!
  // This prevents "Battle Creek", "Grand Rapids", etc. from being detected as names
  const lowerForCity = lowerText.replace(/,/g, '').trim();
  const isCityKeyword = CITY_KEYWORDS.some(c => {
    const lowerCity = c.toLowerCase();
    // Exact match or match with state suffix
    return lowerForCity === lowerCity || 
           lowerForCity.startsWith(lowerCity + ' ') ||
           lowerForCity.endsWith(' ' + lowerCity) ||
           lowerForCity.replace(/\s+(al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)$/i, '').trim() === lowerCity;
  });
  
  if (isCityKeyword) {
    const normalized = getNormalizedCity(lowerText);
    return { 
      type: 'city', 
      value: trimmed, 
      confidence: 0.92, 
      original: trimmed,
      ...(normalized && { normalizedCity: normalized.normalized, isRemote: normalized.isRemote, ...(normalized.displayCity && { displayCity: normalized.displayCity }) })
    };
  }
  
  // Also check if it's in CITY_NORMALIZATION (suburbs/metros)
  const normalizedBeforeName = getNormalizedCity(lowerText);
  if (normalizedBeforeName) {
    return { 
      type: 'city', 
      value: trimmed, 
      confidence: 0.9, 
      original: trimmed,
      normalizedCity: normalizedBeforeName.normalized,
      isRemote: normalizedBeforeName.isRemote,
      ...(normalizedBeforeName.displayCity && { displayCity: normalizedBeforeName.displayCity })
    };
  }
  
  // CHECK VEHICLE TYPES FIRST - before event detection
  // This ensures "party bus", "limo bus", etc. are detected as vehicles, not events
  // Sort keywords by length (longest first) to match "limo bus" before "limo"
  const sortedVehicleKeywords = Object.entries(VEHICLE_TYPE_KEYWORDS).sort((a, b) => b[0].length - a[0].length);
  for (const [keyword, vehicleType] of sortedVehicleKeywords) {
    if (lowerText === keyword || lowerText.includes(keyword)) {
      return { type: 'vehicle_type', value: vehicleType, confidence: 0.95, original: trimmed };
    }
  }
  
  // DETECT TRIP NOTES EARLY - sentences with instructional language
  // These are notes about what to do, not event types
  const tripNotePatterns = [
    /\b(pick\s*up|pickup|pu)\b.*\b(and|then)\b.*\b(take|bring|drop|go)\b/i,
    /\b(take|bring)\b.*\b(to|from)\b.*\b(church|airport|hotel|venue|home|house|office|station)\b/i,
    /\b(groom|bride|groomsman|bridesmaid|best man|maid of honor)\b.*\b(and|then)\b/i,
    /\b(meet|wait|pick)\b.*\b(at|for|in)\b.*\b(then|and)\b/i,
    /^\d{1,2}(:\d{2})?\s*(am|pm|a|p)?\s*(pick|pu|take|meet|go)/i,
  ];
  const isTripNote = tripNotePatterns.some(pattern => pattern.test(lowerText));
  if (isTripNote && trimmed.length > 15) {
    return { type: 'unknown', value: trimmed, confidence: 0.8, original: trimmed };
  }
  
  // CHECK EVENT PHRASES BEFORE NAME DETECTION
  // This prevents "corporate event", "birthday party" etc. from being detected as names
  // But only for SHORT inputs that look like event labels, not longer trip notes
  const isShortEnoughForEvent = trimmed.length < 40;
  for (const phrase of EVENT_PHRASES) {
    if (isShortEnoughForEvent && (lowerText === phrase || lowerText.includes(phrase))) {
      const formatted = trimmed.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      return { type: 'event_type', value: formatted, confidence: 0.95, original: trimmed };
    }
  }
  
  // Check if ANY word in input is an event keyword (catches "corporate event" via "corporate")
  // But only for short inputs - longer sentences are likely trip notes
  const words = lowerText.split(/\s+/);
  const hasEventWord = words.some(word => EVENT_KEYWORDS.includes(word));
  const containsEventModifier = /\b(event|party|outing|trip|celebration|gathering|tour|night|game|meeting|dinner|gala)\b/i.test(lowerText);
  if (hasEventWord && containsEventModifier && isShortEnoughForEvent) {
    const formatted = trimmed.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    return { type: 'event_type', value: formatted, confidence: 0.92, original: trimmed };
  }
  
  const nameMatch = trimmed.match(/^(customer|caller|name|cust)\s*:?\s*(.+)/i);
  if (nameMatch && nameMatch[2] && nameMatch[2].length > 2) {
    return { type: 'name', value: nameMatch[2], confidence: 0.85, original: trimmed };
  }
  
  const twoWordName = trimmed.match(/^([A-Za-z]+)\s+([A-Za-z]+)$/);
  if (twoWordName && trimmed.length >= 5 && trimmed.length <= 40) {
    const firstName = twoWordName[1].toLowerCase();
    const lastName = twoWordName[2].toLowerCase();
    
    // Check if this is a city+state pattern (e.g., "Azle Texas", "Dallas TX", "Mesa Arizona")
    const STATE_ABBREVS_TWO = ['al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga', 'hi', 'id', 'il', 'in', 'ia', 'ks', 'ky', 'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh', 'nj', 'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc', 'sd', 'tn', 'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy', 'dc'];
    const STATE_NAMES_FULL = ['alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming'];
    const isStateAbbrev = STATE_ABBREVS_TWO.includes(lastName);
    const isStateName = STATE_NAMES_FULL.includes(lastName);
    if (isStateAbbrev || isStateName) {
      // This is a city+state pattern - return as city for vehicle search
      const cityName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
      const statePart = isStateAbbrev ? lastName.toUpperCase() : lastName.charAt(0).toUpperCase() + lastName.slice(1);
      return { type: 'city', value: `${cityName}, ${statePart}`, confidence: 0.95, original: trimmed };
    }
    
    // Double-check it's not a city (should have been caught above, but just in case)
    const isNotCity = !CITY_KEYWORDS.some(c => c.toLowerCase() === trimmed.toLowerCase());
    const isNotVehicle = !Object.keys(VEHICLE_TYPE_KEYWORDS).some(v => v.toLowerCase() === trimmed.toLowerCase());
    // Check if EITHER word is an event keyword (not just exact match)
    const isNotEvent = !EVENT_KEYWORDS.some(e => firstName === e || lastName === e);
    const isNotVenue = !VENUE_KEYWORDS.some(v => firstName.includes(v) || lastName.includes(v) || trimmed.toLowerCase().includes(v));
    // Also reject if input contains event modifier words
    const hasEventModifier = /\b(event|party|outing|trip|celebration|gathering|tour|night|game|meeting|dinner|gala|shower|reception)\b/i.test(lowerText);
    const isFirstNameCommon = COMMON_FIRST_NAMES.includes(firstName);
    if (isNotCity && isNotVehicle && isNotEvent && isNotVenue && !hasEventModifier) {
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

  // Check for date patterns and convert to ISO format (YYYY-MM-DD)
  for (const pattern of DATE_PATTERNS) {
    if (pattern.test(trimmed)) {
      const isoDate = convertToISODate(trimmed);
      if (isoDate) {
        return { type: 'date', value: isoDate, confidence: 0.9, original: trimmed };
      }
      // Fallback to raw value if conversion fails
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

  // VEHICLE TYPES MUST BE CHECKED BEFORE EVENTS (so "party bus" matches vehicle, not "party" event)
  for (const [keyword, vehicleType] of Object.entries(VEHICLE_TYPE_KEYWORDS)) {
    if (lowerText === keyword || lowerText.includes(keyword)) {
      return { type: 'vehicle_type', value: vehicleType, confidence: 0.9, original: trimmed };
    }
  }

  for (const event of EVENT_KEYWORDS) {
    if (lowerText === event || lowerText.startsWith(event + ' ') || lowerText.endsWith(' ' + event)) {
      return { type: 'event_type', value: trimmed, confidence: 0.9, original: trimmed };
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
        ...(normalized && { 
          normalizedCity: normalized.normalized, 
          isRemote: normalized.isRemote,
          ...(normalized.displayCity && { displayCity: normalized.displayCity }),
          ...(normalized.travelMinutes && { travelMinutes: normalized.travelMinutes })
        })
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
          ...(normalized && { normalizedCity: normalized.normalized, isRemote: normalized.isRemote, ...(normalized.displayCity && { displayCity: normalized.displayCity }), ...(normalized.travelMinutes && { travelMinutes: normalized.travelMinutes }) })
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
        ...(normalized && { normalizedCity: normalized.normalized, isRemote: normalized.isRemote, ...(normalized.displayCity && { displayCity: normalized.displayCity }), ...(normalized.travelMinutes && { travelMinutes: normalized.travelMinutes }) })
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
      normalizedCity: normalized.normalized,
      isRemote: normalized.isRemote,
      ...(normalized.displayCity && { displayCity: normalized.displayCity }),
      ...(normalized.travelMinutes && { travelMinutes: normalized.travelMinutes })
    };
  }

  return null;
}

const US_STATE_NAMES = [
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut',
  'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa',
  'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan',
  'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire',
  'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio',
  'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina', 'south dakota',
  'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia',
  'wisconsin', 'wyoming', 'district of columbia'
];

const US_STATE_ABBREVS = [
  'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'de', 'fl', 'ga', 'hi', 'id', 'il', 'in',
  'ia', 'ks', 'ky', 'la', 'me', 'md', 'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv',
  'nh', 'nj', 'nm', 'ny', 'nc', 'nd', 'oh', 'ok', 'or', 'pa', 'ri', 'sc', 'sd', 'tn',
  'tx', 'ut', 'vt', 'va', 'wa', 'wv', 'wi', 'wy', 'dc'
];

function isCityStatePattern(text: string): boolean {
  const lower = text.toLowerCase().trim();
  const parts = lower.split(/[\s,]+/);
  if (parts.length < 2) return false;
  
  const lastPart = parts[parts.length - 1];
  const lastTwoParts = parts.slice(-2).join(' ');
  
  if (US_STATE_ABBREVS.includes(lastPart)) return true;
  if (US_STATE_NAMES.includes(lastPart)) return true;
  if (US_STATE_NAMES.includes(lastTwoParts)) return true;
  
  return false;
}

async function detectNameWithAI(text: string): Promise<{ isName: boolean; confidence: number }> {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length < 2 || trimmed.length > 50) {
    return { isName: false, confidence: 0 };
  }
  
  // Skip if it's a city+state pattern (e.g., "Azle Texas", "Dallas TX")
  if (isCityStatePattern(trimmed)) {
    return { isName: false, confidence: 0.99 };
  }
  
  // Skip if it contains numbers, special chars (except hyphens/apostrophes in names)
  if (/[0-9@#$%^&*()+=\[\]{}|\\:;<>,.?\/~`]/.test(trimmed)) {
    return { isName: false, confidence: 0 };
  }
  
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a name detector. Determine if the given text is a person's first name or full name.

Return JSON with:
- isName: boolean (true if this is likely a person's name)
- confidence: number 0-1 (how confident you are)

Consider:
- First names from ANY culture/language (American, Hispanic, Asian, African, European, Middle Eastern, etc.)
- Nicknames and diminutives (Terry, Carrie, Bobby, etc.)
- Unusual or uncommon names are still names
- Two-word inputs like "Terry Smith" or "Maria Garcia" are full names

NOT names:
- Common English words (trip, party, event, airport, hotel, etc.)
- Place names (cities, countries, venues)
- Event types (wedding, concert, etc.)
- CITY + STATE patterns like "Azle Texas", "Dallas TX", "Mesa Arizona" - these are LOCATIONS, not names
- Any word followed by a US state name or abbreviation (e.g., "Weatherford Texas", "Hoboken NJ")

Examples:
"Terry" → {"isName": true, "confidence": 0.95}
"Carrie" → {"isName": true, "confidence": 0.95}
"Xiang" → {"isName": true, "confidence": 0.9}
"D'Andre" → {"isName": true, "confidence": 0.95}
"trip" → {"isName": false, "confidence": 0.98}
"airport" → {"isName": false, "confidence": 0.99}
"Phoenix" → {"isName": false, "confidence": 0.85}
"Terry Smith" → {"isName": true, "confidence": 0.98}
"Azle Texas" → {"isName": false, "confidence": 0.99}
"Dallas TX" → {"isName": false, "confidence": 0.99}
"Weatherford Texas" → {"isName": false, "confidence": 0.99}
"Mesa AZ" → {"isName": false, "confidence": 0.99}`
        },
        {
          role: "user",
          content: trimmed
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 50,
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    return {
      isName: parsed.isName === true,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0
    };
  } catch (error) {
    console.error("AI name detection error:", error);
    return { isName: false, confidence: 0 };
  }
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

    // Always try AI name detection for unknown segments (names are important to detect)
    if (unknownSegments.length > 0) {
      for (const segment of unknownSegments) {
        // First, try AI name detection for single words or two-word patterns that look like names
        const trimmedSegment = segment.trim();
        const wordCount = trimmedSegment.split(/\s+/).length;
        
        if (wordCount <= 2 && trimmedSegment.length >= 2 && trimmedSegment.length <= 40) {
          // Could be a name - ask AI
          const nameResult = await detectNameWithAI(trimmedSegment);
          if (nameResult.isName && nameResult.confidence >= 0.7) {
            const capitalizedName = trimmedSegment
              .split(/\s+/)
              .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
              .join(' ');
            allItems.push({ 
              type: 'name', 
              value: capitalizedName, 
              confidence: nameResult.confidence, 
              original: segment 
            });
            continue;
          }
        }
        
        // Fall back to full AI parsing if enabled
        if (useAI && segment.length > 3) {
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
    }

    return NextResponse.json({ items: allItems });
  } catch (error) {
    console.error("Parse input error:", error);
    return NextResponse.json({ items: [] }, { status: 500 });
  }
}
