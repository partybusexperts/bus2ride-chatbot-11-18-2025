import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getZipsForLocation, buildCityZipIndex, searchCityIndex, isCacheBuilt } from '@/lib/zip-lookup';
import { getZipCoordinates, findNearestMetros, METRO_COORDS } from '@/lib/geo-utils';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

type VehicleRecord = {
  id: string;
  vehicle_title: string;
  capacity: number | null;
  city: string | null;
  zips_raw: string | null;
  price_3hr: number | null;
  price_4hr: number | null;
  price_5hr: number | null;
  price_6hr: number | null;
  price_7hr: number | null;
  price_8hr: number | null;
  price_9hr: number | null;
  price_10hr: number | null;
  active: boolean | null;
  image_main: string | null;
  image_2: string | null;
  image_3: string | null;
  category: string | null;
};

function getPriceForHours(vehicle: VehicleRecord, hours: number | null): { price: number; hours: number } | null {
  const priceFields: Record<number, keyof VehicleRecord> = {
    3: 'price_3hr',
    4: 'price_4hr',
    5: 'price_5hr',
    6: 'price_6hr',
    7: 'price_7hr',
    8: 'price_8hr',
    9: 'price_9hr',
    10: 'price_10hr',
  };

  if (hours && priceFields[hours]) {
    const price = vehicle[priceFields[hours]];
    if (typeof price === 'number' && price > 0) {
      return { price, hours };
    }
  }

  for (const h of [4, 5, 6, 3, 7, 8, 9, 10]) {
    const price = vehicle[priceFields[h]];
    if (typeof price === 'number' && price > 0) {
      return { price, hours: h };
    }
  }

  return null;
}

function normalizeCityQuery(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const CITY_ALIASES: Record<string, string[]> = {
  // === ARIZONA ===
  'phoenix': [
    'mesa', 'tempe', 'scottsdale', 'glendale az', 'chandler', 'gilbert', 'peoria az', 'surprise', 'goodyear',
    'avondale', 'buckeye', 'cave creek', 'carefree', 'paradise valley', 'fountain hills', 'queen creek',
    'apache junction', 'sun city', 'sun lakes', 'anthem', 'litchfield park', 'tolleson', 'laveen',
    'ahwatukee', 'maricopa', 'casa grande', 'florence', 'coolidge', 'eloy', 'gold canyon',
  ],
  'tucson': ['oro valley', 'marana', 'sahuarita', 'green valley', 'sierra vista', 'vail az', 'catalina'],

  // === CALIFORNIA ===
  'los angeles': [
    'la', 'hollywood', 'beverly hills', 'santa monica', 'pasadena ca', 'glendale ca', 'burbank', 'torrance',
    'inglewood', 'culver city', 'west hollywood', 'malibu', 'venice', 'marina del rey', 'downtown la', 'dtla',
    'calabasas', 'encino', 'sherman oaks', 'studio city', 'north hollywood', 'woodland hills', 'tarzana',
    'canoga park', 'reseda', 'van nuys', 'sun valley', 'sylmar', 'san fernando', 'la canada flintridge',
    'alhambra', 'monterey park', 'arcadia', 'covina', 'west covina', 'glendora', 'azusa', 'pomona',
    'claremont', 'upland', 'rancho cucamonga', 'ontario ca', 'fontana', 'rialto', 'san bernardino',
    'redlands', 'riverside', 'corona', 'norco', 'moreno valley', 'temecula', 'murrieta',
    'whittier', 'la mirada', 'cerritos', 'downey', 'norwalk', 'bellflower', 'compton', 'carson',
    'gardena', 'hawthorne', 'el segundo', 'manhattan beach', 'hermosa beach', 'redondo beach',
    'palos verdes', 'san pedro', 'wilmington ca', 'santa clarita', 'valencia', 'palmdale', 'lancaster',
  ],
  'long beach': ['signal hill', 'lakewood ca', 'seal beach', 'los alamitos', 'cypress', 'hawaiian gardens'],
  'san diego': [
    'la jolla', 'del mar', 'coronado', 'chula vista', 'oceanside', 'carlsbad', 'encinitas', 'escondido',
    'national city', 'el cajon', 'santee', 'poway', 'san marcos ca', 'vista', 'fallbrook', 'ramona',
    'alpine', 'la mesa', 'lemon grove', 'imperial beach', 'solana beach', 'rancho bernardo',
  ],
  'san francisco': [
    'sf', 'oakland', 'berkeley', 'hayward', 'daly city', 'south sf', 'san mateo', 'richmond ca',
    'walnut creek', 'concord', 'pleasanton', 'livermore', 'dublin ca', 'san ramon', 'danville ca',
    'alameda', 'san leandro', 'fremont', 'union city', 'newark ca', 'redwood city', 'menlo park',
    'palo alto', 'mountain view', 'foster city', 'burlingame', 'millbrae', 'pacifica', 'half moon bay',
    'san bruno', 'south san francisco', 'vallejo', 'benicia', 'martinez', 'antioch', 'brentwood ca',
    'pittsburg ca', 'hercules', 'el cerrito', 'albany ca', 'emeryville', 'piedmont',
  ],
  'san jose': [
    'sunnyvale', 'santa clara', 'milpitas', 'cupertino', 'campbell', 'los gatos', 'saratoga',
    'gilroy', 'morgan hill', 'los altos', 'los altos hills', 'monte sereno',
  ],
  'sacramento': ['elk grove', 'roseville', 'folsom', 'citrus heights', 'rancho cordova', 'davis', 'woodland', 'west sacramento', 'rocklin', 'lincoln ca'],
  'fresno': ['clovis', 'madera', 'visalia', 'tulare', 'hanford', 'selma', 'sanger', 'coalinga'],
  'napa': ['yountville', 'st helena', 'calistoga', 'american canyon', 'napa valley'],
  'santa rosa': ['petaluma', 'rohnert park', 'cotati', 'sebastopol', 'healdsburg', 'windsor ca', 'sonoma'],

  // === COLORADO ===
  'denver': [
    'aurora co', 'lakewood co', 'thornton', 'arvada', 'westminster co', 'boulder', 'centennial',
    'littleton', 'highlands ranch', 'cherry hills', 'greenwood village', 'englewood co', 'parker',
    'castle rock', 'lone tree', 'broomfield', 'brighton co', 'commerce city', 'northglenn', 'wheat ridge',
    'golden', 'evergreen co', 'morrison', 'erie co', 'louisville co', 'superior co', 'lafayette co',
    'longmont', 'loveland', 'fort collins', 'greeley',
  ],

  // === FLORIDA ===
  'miami': [
    'miami beach', 'south beach', 'fort lauderdale', 'boca raton', 'west palm beach', 'coral gables',
    'hialeah', 'hollywood fl', 'pompano beach', 'deerfield beach', 'delray beach', 'boynton beach',
    'coconut grove', 'key biscayne', 'aventura', 'sunny isles', 'hallandale beach', 'pembroke pines',
    'miramar fl', 'davie', 'plantation', 'sunrise fl', 'weston', 'coral springs', 'margate',
    'homestead', 'kendall', 'doral', 'miami gardens', 'miami lakes', 'opa locka', 'north miami',
    'jupiter', 'palm beach gardens', 'royal palm beach', 'wellington fl',
  ],
  'orlando': [
    'kissimmee', 'lake buena vista', 'winter park', 'sanford', 'altamonte springs', 'celebration',
    'daytona beach', 'ocoee', 'windermere', 'winter garden', 'clermont', 'apopka', 'deltona',
    'deland', 'lake mary', 'longwood', 'casselberry', 'maitland', 'oviedo', 'winter springs',
    'st cloud fl', 'poinciana', 'tavares', 'leesburg fl', 'mount dora', 'ocala',
  ],
  'tampa': [
    'st petersburg', 'clearwater', 'brandon', 'lakeland', 'sarasota', 'bradenton', 'st pete beach',
    'temple terrace', 'plant city', 'riverview fl', 'valrico', 'wesley chapel', 'land o lakes',
    'lutz', 'new port richey', 'palm harbor', 'dunedin', 'tarpon springs', 'largo', 'pinellas park',
    'seminole fl', 'ruskin', 'apollo beach', 'gibsonton', 'zephyrhills', 'dade city',
    'venice fl', 'north port', 'port charlotte', 'punta gorda',
  ],
  'jacksonville': ['orange park', 'fleming island', 'ponte vedra', 'st augustine', 'fernandina beach', 'neptune beach', 'atlantic beach fl', 'jacksonville beach'],

  // === GEORGIA ===
  'atlanta': [
    'marietta', 'sandy springs', 'roswell', 'alpharetta', 'johns creek', 'smyrna ga', 'dunwoody',
    'kennesaw', 'decatur', 'buckhead', 'brookhaven', 'peachtree city', 'newnan', 'griffin',
    'lawrenceville', 'duluth ga', 'suwanee', 'buford', 'cumming', 'canton ga', 'woodstock ga',
    'acworth', 'powder springs', 'austell', 'douglasville', 'lithia springs', 'union city ga',
    'college park ga', 'east point', 'hapeville', 'forest park ga', 'riverdale ga', 'fayetteville ga',
    'mcdonough', 'stockbridge', 'conyers', 'covington ga', 'snellville', 'lilburn', 'norcross',
    'tucker ga', 'stone mountain', 'clarkston', 'chamblee',
  ],

  // === ILLINOIS ===
  'chicago': [
    'evanston', 'oak park', 'naperville', 'schaumburg', 'aurora il', 'joliet', 'elgin', 'waukegan', 'cicero',
    'glen ellyn', 'wheaton', 'downers grove', 'lombard', 'elmhurst', 'oak brook', 'hinsdale', 'clarendon hills',
    'western springs', 'la grange', 'brookfield il', 'berwyn', 'riverside il', 'villa park', 'addison il', 'carol stream',
    'bloomingdale il', 'glendale heights', 'hanover park', 'bartlett il', 'st charles il', 'geneva il', 'batavia il',
    'north aurora il', 'oswego il', 'yorkville il', 'plainfield il', 'bolingbrook', 'romeoville', 'lockport il', 'lemont',
    'orland park', 'tinley park', 'oak lawn', 'evergreen park', 'alsip', 'burbank il', 'chicago heights',
    'homewood il', 'flossmoor', 'olympia fields', 'matteson', 'frankfort il', 'mokena', 'new lenox',
    'palatine', 'arlington heights', 'des plaines', 'park ridge', 'niles il', 'morton grove', 'skokie',
    'lincolnwood', 'wilmette', 'winnetka', 'kenilworth', 'glencoe', 'highland park il', 'lake forest il',
    'libertyville', 'mundelein', 'vernon hills', 'buffalo grove', 'wheeling il', 'prospect heights',
    'mount prospect', 'rolling meadows', 'hoffman estates', 'streamwood', 'carpentersville',
    'crystal lake', 'mchenry', 'woodstock il', 'lake zurich', 'barrington il', 'fox lake il',
    'gurnee', 'zion il', 'north chicago', 'lake bluff', 'deerfield il', 'northbrook', 'glenview',
    'oak forest', 'country club hills', 'harvey il', 'dolton', 'calumet city', 'lansing il',
    'lisle', 'woodridge', 'darien il', 'willowbrook', 'westmont il', 'warrenville',
    'naperville il', 'oswego', 'yorkville', 'sandwich il', 'plano il', 'morris il',
    'romeoville il', 'crest hill', 'shorewood il', 'channahon', 'minooka', 'manhattan il',
  ],

  // === INDIANA ===
  'indianapolis': [
    'carmel', 'fishers', 'noblesville', 'westfield in', 'zionsville', 'brownsburg', 'avon in',
    'plainfield in', 'greenwood in', 'franklin in', 'lawrence in', 'speedway', 'beech grove',
    'southport in', 'whiteland', 'mooresville in', 'martinsville in',
  ],

  // === KENTUCKY ===
  'louisville': ['jeffersontown', 'st matthews', 'shively', 'new albany', 'jeffersonville', 'clarksville in', 'shepherdsville', 'shelbyville ky', 'bardstown', 'elizabethtown'],
  'lexington': ['nicholasville', 'georgetown ky', 'richmond ky', 'winchester ky', 'versailles ky', 'frankfort ky', 'paris ky', 'danville ky'],

  // === LOUISIANA ===
  'new orleans': ['nola', 'metairie', 'kenner', 'slidell', 'gretna', 'harvey la', 'marrero', 'french quarter', 'chalmette', 'westwego', 'terrytown', 'algiers', 'laplace', 'covington la', 'mandeville'],

  // === MARYLAND ===
  'baltimore': ['towson', 'columbia md', 'ellicott city', 'catonsville', 'dundalk', 'essex md', 'parkville md', 'perry hall', 'owings mills', 'reisterstown', 'pikesville', 'cockeysville', 'hunt valley', 'glen burnie', 'severna park', 'annapolis', 'bel air md', 'aberdeen md'],

  // === MASSACHUSETTS ===
  'boston': [
    'cambridge', 'brookline', 'newton', 'somerville', 'quincy', 'waltham', 'medford', 'worcester',
    'braintree ma', 'weymouth', 'framingham', 'natick', 'wellesley', 'needham', 'dedham', 'norwood ma',
    'brockton', 'plymouth ma', 'salem ma', 'beverly ma', 'peabody ma', 'danvers', 'gloucester',
    'lowell', 'lawrence ma', 'haverhill', 'methuen', 'andover ma', 'north andover', 'chelmsford',
    'lexington ma', 'arlington ma', 'belmont ma', 'watertown ma', 'malden', 'everett ma', 'revere', 'chelsea ma',
    'marlborough', 'hudson ma', 'shrewsbury', 'westborough', 'milford ma',
  ],

  // === MICHIGAN ===
  'detroit': [
    'dearborn', 'livonia', 'westland', 'canton mi', 'plymouth mi', 'northville', 'farmington hills',
    'novi', 'southfield', 'troy mi', 'royal oak', 'birmingham mi', 'bloomfield hills', 'pontiac',
    'auburn hills', 'rochester hills', 'sterling heights', 'warren mi', 'st clair shores',
    'grosse pointe', 'taylor mi', 'romulus', 'ypsilanti', 'ann arbor', 'brighton mi',
  ],
  'grand rapids': ['wyoming mi', 'kentwood', 'walker mi', 'grandville', 'jenison', 'hudsonville', 'holland mi', 'muskegon', 'kalamazoo'],

  // === MINNESOTA ===
  'minneapolis': [
    'st paul', 'bloomington mn', 'brooklyn park', 'plymouth mn', 'eagan', 'burnsville', 'eden prairie',
    'maple grove', 'woodbury mn', 'lakeville mn', 'blaine mn', 'coon rapids', 'edina', 'minnetonka',
    'richfield mn', 'st louis park', 'hopkins mn', 'golden valley mn', 'roseville mn', 'maplewood mn',
    'shoreview', 'fridley', 'anoka', 'champlin', 'shakopee', 'prior lake', 'savage mn', 'apple valley mn',
  ],

  // === MISSOURI ===
  'st louis': [
    'clayton mo', 'kirkwood', 'webster groves', 'creve coeur', 'chesterfield mo', 'ballwin', 'town and country mo',
    'ladue', 'university city', 'maplewood mo', 'brentwood mo', 'richmond heights', 'frontenac',
    'florissant', 'hazelwood', 'maryland heights', 'bridgeton mo', 'st charles mo', 'o fallon mo',
    'st peters', 'wentzville', 'wildwood mo', 'fenton', 'arnold mo', 'oakville', 'mehlville',
    'affton', 'lemay', 'belleville il', 'edwardsville', 'collinsville il', 'granite city', 'alton il',
  ],
  'kansas city': [
    'overland park', 'olathe', 'lenexa', 'shawnee ks', 'leawood', 'prairie village',
    'merriam', 'mission ks', 'lees summit', 'independence mo', 'blue springs', 'liberty mo',
    'gladstone mo', 'raytown', 'grandview mo', 'belton mo', 'raymore', 'grain valley',
  ],

  // === NEVADA ===
  'las vegas': [
    'vegas', 'henderson', 'north las vegas', 'summerlin', 'the strip', 'downtown vegas', 'boulder city',
    'paradise', 'spring valley nv', 'enterprise nv', 'green valley nv', 'anthem nv', 'lake las vegas',
    'centennial hills', 'aliante', 'mountains edge', 'rhodes ranch', 'southern highlands',
  ],

  // === NEW YORK ===
  'new york': [
    'nyc', 'manhattan', 'brooklyn', 'queens', 'bronx', 'staten island', 'harlem', 'soho', 'tribeca',
    'chelsea', 'midtown', 'upper east side', 'upper west side', 'lower east side', 'williamsburg',
    'bushwick', 'astoria', 'long island city', 'flushing', 'jamaica ny', 'forest hills',
    'yonkers', 'new rochelle', 'mount vernon ny', 'white plains', 'scarsdale', 'mamaroneck',
    'rye', 'port chester', 'tarrytown', 'dobbs ferry', 'hastings on hudson', 'ossining',
    'hoboken', 'jersey city', 'newark nj', 'fort lee', 'edgewater nj', 'weehawken', 'union city nj',
    'bayonne', 'elizabeth nj', 'clifton nj', 'passaic', 'paterson nj', 'hackensack', 'paramus',
    'garden city', 'hempstead', 'mineola', 'great neck', 'manhasset', 'roslyn',
    'huntington ny', 'babylon', 'islip', 'smithtown', 'brookhaven ny',
  ],

  // === NORTH CAROLINA ===
  'charlotte': [
    'matthews', 'mint hill', 'huntersville', 'cornelius', 'davidson nc', 'mooresville', 'lake norman',
    'concord nc', 'kannapolis', 'gastonia', 'rock hill', 'fort mill', 'indian trail', 'waxhaw',
    'pineville nc', 'ballantyne', 'south charlotte', 'university city nc', 'dilworth', 'southend',
  ],
  'raleigh': [
    'durham', 'chapel hill', 'cary', 'apex', 'morrisville', 'holly springs nc', 'fuquay varina',
    'garner', 'wake forest nc', 'knightdale', 'wendell', 'zebulon nc', 'research triangle', 'rtp',
  ],

  // === OHIO ===
  'columbus': [
    'dublin oh', 'westerville', 'gahanna', 'grove city oh', 'hilliard', 'upper arlington', 'worthington oh',
    'powell oh', 'delaware oh', 'pickerington', 'reynoldsburg', 'pataskala', 'canal winchester',
    'new albany oh', 'lewis center', 'marysville oh', 'circleville', 'lancaster oh',
  ],
  'cleveland': [
    'lakewood oh', 'parma', 'strongsville', 'westlake oh', 'avon oh', 'avon lake', 'north olmsted',
    'rocky river', 'bay village', 'north royalton', 'broadview heights', 'brecksville', 'independence oh',
    'solon', 'aurora oh', 'hudson oh', 'twinsburg', 'macedonia oh', 'kent oh', 'medina oh',
    'elyria', 'lorain', 'mentor', 'willoughby', 'eastlake', 'euclid', 'lyndhurst oh', 'beachwood',
    'shaker heights', 'cleveland heights', 'university heights oh', 'south euclid',
  ],
  'cincinnati': [
    'mason oh', 'west chester oh', 'liberty township oh', 'fairfield oh', 'hamilton oh', 'middletown oh',
    'montgomery oh', 'blue ash', 'kenwood oh', 'madeira oh', 'indian hill', 'mariemont',
    'anderson township', 'milford oh', 'loveland oh', 'lebanon oh', 'springboro', 'centerville oh',
    'dayton', 'kettering', 'beavercreek', 'huber heights', 'xenia', 'miamisburg', 'troy oh',
    'florence ky', 'covington ky', 'newport ky', 'fort thomas', 'erlanger', 'burlington ky',
  ],
  'toledo': [
    'maumee', 'perrysburg', 'sylvania oh', 'oregon oh', 'bowling green oh', 'findlay', 'rossford',
    'northwood oh', 'holland oh', 'waterville oh', 'whitehouse oh', 'ottawa hills', 'temperance mi',
    'lambertville mi', 'monroe mi', 'adrian mi',
  ],

  // === OKLAHOMA ===
  'oklahoma city': ['edmond', 'norman', 'moore ok', 'midwest city', 'del city', 'yukon ok', 'mustang ok', 'bethany ok', 'warr acres', 'the village ok', 'nichols hills'],
  'tulsa': ['broken arrow', 'owasso', 'bixby', 'jenks', 'sand springs', 'sapulpa', 'claremore', 'catoosa', 'coweta'],

  // === OREGON ===
  'portland': [
    'beaverton', 'hillsboro', 'tigard', 'tualatin', 'lake oswego', 'west linn', 'oregon city',
    'milwaukie or', 'gresham', 'troutdale', 'wood village', 'fairview or', 'clackamas',
    'happy valley or', 'wilsonville', 'sherwood or', 'newberg', 'canby',
    'vancouver wa', 'camas', 'washougal', 'battle ground wa', 'ridgefield wa',
  ],

  // === PENNSYLVANIA ===
  'philadelphia': [
    'philly', 'camden', 'cherry hill', 'king of prussia', 'media pa', 'norristown', 'upper darby',
    'wilmington de', 'west chester pa', 'lansdale', 'doylestown', 'newtown pa', 'ardmore',
    'bryn mawr', 'wayne pa', 'conshohocken', 'plymouth meeting', 'blue bell pa', 'fort washington pa',
    'jenkintown', 'elkins park', 'abington pa', 'cheltenham pa', 'bensalem', 'levittown pa',
    'trenton', 'princeton', 'lawrenceville nj', 'moorestown', 'marlton', 'voorhees', 'haddonfield',
  ],
  'pittsburgh': [
    'mount lebanon', 'bethel park', 'upper st clair', 'south hills', 'north hills',
    'cranberry township', 'wexford', 'mars pa', 'gibsonia', 'mccandless', 'ross township',
    'monroeville', 'murrysville', 'irwin pa', 'greensburg', 'latrobe', 'connellsville',
    'robinson township', 'moon township', 'coraopolis', 'sewickley', 'bridgeville',
  ],

  // === TENNESSEE ===
  'nashville': [
    'franklin tn', 'murfreesboro', 'brentwood tn', 'hendersonville tn', 'smyrna tn', 'gallatin tn',
    'lebanon tn', 'mt juliet', 'spring hill tn', 'nolensville', 'thompsons station', 'fairview tn',
    'bellevue tn', 'hermitage tn', 'donelson', 'antioch tn', 'goodlettsville', 'white house tn',
    'clarksville tn',
  ],
  'memphis': ['germantown tn', 'collierville', 'bartlett tn', 'cordova tn', 'lakeland tn', 'arlington tn', 'olive branch', 'southaven', 'horn lake'],

  // === TEXAS ===
  'dallas': [
    'arlington tx', 'plano', 'irving', 'garland', 'frisco', 'mckinney', 'denton tx',
    'richardson', 'carrollton', 'lewisville', 'flower mound', 'coppell', 'grapevine', 'southlake',
    'keller', 'colleyville', 'bedford', 'euless', 'hurst', 'north richland hills', 'mansfield tx',
    'grand prairie', 'cedar hill tx', 'desoto', 'duncanville', 'lancaster tx', 'mesquite',
    'rowlett', 'rockwall', 'wylie tx', 'allen tx', 'prosper', 'celina tx', 'little elm',
    'the colony', 'highland village', 'corinth tx', 'lake dallas', 'trophy club', 'roanoke tx',
    'haslet', 'saginaw tx', 'white settlement', 'benbrook', 'burleson', 'crowley tx', 'cleburne',
    'weatherford tx', 'azle', 'watauga', 'richland hills', 'haltom city', 'forest hill tx',
    'kennedale', 'midlothian tx', 'waxahachie', 'forney', 'terrell tx', 'kaufman',
    'sherman', 'gainesville tx', 'decatur tx', 'aubrey tx', 'anna tx', 'princeton tx',
  ],
  'houston': [
    'the woodlands', 'sugar land', 'katy', 'pearland', 'pasadena tx', 'baytown', 'league city',
    'galveston', 'cypress tx', 'spring tx', 'humble', 'kingwood', 'atascocita', 'clear lake',
    'friendswood', 'webster tx', 'seabrook', 'kemah', 'missouri city', 'stafford tx', 'richmond tx',
    'rosenberg', 'fulshear', 'cinco ranch', 'memorial', 'bellaire tx', 'west university',
    'tomball', 'magnolia tx', 'conroe', 'the woodlands tx', 'shenandoah tx', 'willis tx',
    'huntsville tx', 'lake jackson', 'angleton', 'alvin tx', 'santa fe tx', 'texas city',
    'la porte', 'deer park tx', 'channelview', 'crosby tx', 'mont belvieu', 'dayton tx',
  ],
  'austin': [
    'round rock', 'cedar park', 'georgetown tx', 'pflugerville', 'san marcos', 'kyle tx',
    'leander', 'dripping springs', 'bee cave', 'lakeway', 'westlake hills', 'rollingwood',
    'buda', 'hutto', 'taylor tx', 'bastrop', 'elgin tx', 'liberty hill', 'lago vista',
    'marble falls', 'new braunfels', 'san marcos tx', 'wimberley',
  ],
  'san antonio': [
    'new braunfels', 'boerne', 'schertz', 'cibolo', 'helotes', 'alamo heights', 'live oak tx',
    'universal city', 'converse', 'selma tx', 'windcrest', 'san marcos', 'seguin', 'floresville',
    'castroville', 'hondo', 'canyon lake', 'spring branch tx', 'fair oaks ranch', 'bulverde',
  ],

  // === UTAH ===
  'salt lake city': [
    'sandy ut', 'draper', 'south jordan', 'west jordan', 'west valley city', 'taylorsville',
    'murray ut', 'midvale', 'cottonwood heights', 'holladay', 'millcreek', 'magna',
    'bountiful', 'centerville ut', 'farmington ut', 'kaysville', 'layton', 'clearfield ut',
    'ogden', 'provo', 'orem', 'lehi', 'american fork', 'pleasant grove ut', 'lindon',
    'saratoga springs ut', 'eagle mountain', 'herriman', 'riverton ut', 'bluffdale',
    'park city', 'heber city', 'tooele',
  ],

  // === VIRGINIA ===
  'richmond': ['henrico', 'chesterfield', 'midlothian va', 'glen allen', 'mechanicsville', 'short pump', 'ashland va', 'chester va', 'colonial heights'],
  'virginia beach': ['norfolk', 'chesapeake', 'portsmouth va', 'suffolk', 'hampton', 'newport news', 'williamsburg', 'yorktown', 'hampton roads'],

  // === WASHINGTON ===
  'seattle': [
    'bellevue', 'tacoma', 'everett', 'kent wa', 'renton', 'federal way', 'kirkland', 'redmond',
    'bothell', 'lynnwood', 'edmonds', 'shoreline', 'mountlake terrace', 'mill creek wa',
    'snohomish', 'marysville wa', 'lake stevens', 'arlington wa', 'stanwood',
    'auburn wa', 'covington wa', 'maple valley', 'issaquah', 'sammamish', 'woodinville',
    'kenmore', 'lake forest park', 'mercer island', 'burien', 'tukwila', 'seatac',
    'des moines wa', 'normandy park', 'white center', 'bainbridge island',
    'puyallup', 'lakewood wa', 'university place', 'bonney lake', 'sumner',
    'gig harbor', 'port orchard', 'bremerton', 'silverdale', 'poulsbo',
    'olympia', 'lacey wa', 'tumwater', 'yelm', 'centralia wa',
  ],
  'spokane': ['spokane valley', 'liberty lake', 'cheney wa', 'airway heights', 'medical lake', 'post falls', 'coeur d alene'],

  // === WASHINGTON DC ===
  'washington': [
    'washington dc', 'dc', 'arlington va', 'alexandria', 'falls church', 'fairfax', 'mclean',
    'tysons', 'vienna va', 'reston', 'herndon', 'sterling va', 'ashburn', 'leesburg va',
    'manassas', 'woodbridge va', 'dale city', 'lorton', 'springfield va', 'burke va',
    'annandale', 'centreville va', 'chantilly', 'gainesville va',
    'bethesda', 'chevy chase', 'silver spring', 'rockville', 'gaithersburg',
    'germantown md', 'frederick md', 'columbia md', 'laurel md', 'bowie', 'upper marlboro',
    'college park md', 'hyattsville', 'greenbelt', 'landover', 'waldorf', 'la plata md',
  ],

  // === WISCONSIN ===
  'milwaukee': [
    'wauwatosa', 'brookfield wi', 'waukesha', 'new berlin', 'west allis', 'greenfield wi',
    'greendale', 'franklin wi', 'oak creek wi', 'south milwaukee', 'cudahy wi', 'st francis wi',
    'shorewood wi', 'whitefish bay', 'fox point', 'brown deer', 'glendale wi', 'river hills',
    'menomonee falls', 'germantown wi', 'mequon', 'cedarburg', 'grafton wi', 'port washington wi',
    'racine', 'kenosha', 'pleasant prairie',
  ],

  // === ALABAMA ===
  'birmingham': ['hoover', 'vestavia hills', 'mountain brook', 'homewood al', 'trussville', 'irondale', 'bessemer', 'pelham', 'alabaster', 'helena al', 'calera', 'leeds al', 'moody al', 'gardendale'],
  'mobile': ['daphne', 'fairhope', 'spanish fort', 'saraland', 'prichard', 'tillmans corner', 'semmes', 'theodore'],
  'montgomery': ['prattville', 'millbrook al', 'wetumpka', 'pike road', 'tallassee'],

  // === NEBRASKA ===
  'omaha': ['bellevue ne', 'papillion', 'la vista', 'ralston ne', 'elkhorn', 'council bluffs', 'gretna ne', 'bennington ne', 'fremont ne'],

  // === NEW MEXICO ===
  'albuquerque': ['rio rancho', 'corrales', 'los ranchos', 'bernalillo', 'edgewood nm', 'moriarty', 'los lunas', 'belen'],
  'santa fe': ['espanola', 'los alamos', 'las vegas nm', 'taos'],

  // === ALASKA ===
  'anchorage': ['eagle river', 'wasilla', 'palmer ak', 'girdwood'],

  // === RHODE ISLAND ===
  'providence': ['cranston', 'warwick ri', 'east providence', 'pawtucket', 'woonsocket', 'north providence', 'johnston ri', 'newport ri'],

  // === CANADA ===
  'toronto': ['mississauga', 'brampton', 'markham', 'vaughan', 'richmond hill on', 'scarborough', 'north york', 'etobicoke', 'oakville on', 'burlington on', 'milton on', 'pickering', 'ajax on', 'oshawa', 'whitby on', 'newmarket on', 'aurora on'],
  'montreal': ['laval', 'longueuil', 'brossard', 'terrebonne', 'repentigny', 'st jerome', 'blainville', 'mirabel', 'chateauguay', 'st jean sur richelieu'],
  'vancouver': ['burnaby', 'surrey bc', 'richmond bc', 'coquitlam', 'langley', 'north vancouver', 'west vancouver', 'new westminster', 'delta bc', 'maple ridge', 'abbotsford'],
  'calgary': ['airdrie', 'cochrane ab', 'chestermere', 'okotoks', 'high river'],
  'windsor': ['tecumseh on', 'lakeshore on', 'lasalle on', 'amherstburg', 'leamington on', 'kingsville on', 'essex on'],
  'winnipeg': ['st boniface', 'transcona', 'st vital', 'fort garry', 'charleswood', 'st james mb', 'east kildonan', 'west kildonan', 'north kildonan'],
};

const COMMON_TYPOS: Record<string, string> = {
  'pheonix': 'phoenix',
  'phoneix': 'phoenix',
  'phonix': 'phoenix',
  'phx': 'phoenix',
  'los angelas': 'los angeles',
  'los angelos': 'los angeles',
  'la': 'los angeles',
  'las vagas': 'las vegas',
  'las vages': 'las vegas',
  'vagas': 'las vegas',
  'new yourk': 'new york',
  'newyork': 'new york',
  'san deigo': 'san diego',
  'san diago': 'san diego',
  'miama': 'miami',
  'maimi': 'miami',
  'chicaco': 'chicago',
  'chigago': 'chicago',
  'houstan': 'houston',
  'huston': 'houston',
  'atlana': 'atlanta',
  'altanta': 'atlanta',
  'seatle': 'seattle',
  'seattel': 'seattle',
  'philidelphia': 'philadelphia',
  'philadephia': 'philadelphia',
  'philiadelphia': 'philadelphia',
  'bostan': 'boston',
  'nashvile': 'nashville',
  'nashvill': 'nashville',
  'olrando': 'orlando',
  'oralndo': 'orlando',
  'tamapa': 'tampa',
  'dalls': 'dallas',
  'dalas': 'dallas',
  'denvor': 'denver',
  'austun': 'austin',
  'ausin': 'austin',
};

function resolveCity(query: string): { resolved: string; suggestion?: string; isAlias: boolean } {
  const lower = query.toLowerCase().trim();
  
  if (COMMON_TYPOS[lower]) {
    return { 
      resolved: COMMON_TYPOS[lower], 
      suggestion: `Did you mean "${COMMON_TYPOS[lower]}"?`,
      isAlias: false 
    };
  }
  
  for (const [mainCity, aliases] of Object.entries(CITY_ALIASES)) {
    if (aliases.includes(lower)) {
      return { 
        resolved: mainCity, 
        suggestion: `Searching ${mainCity} area (includes ${query})`,
        isAlias: true 
      };
    }
  }
  
  return { resolved: query, isAlias: false };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { cityOrZip, passengers, hours } = body;

    console.log('get-vehicles-for-call:', { cityOrZip, passengers, hours });

    if (!cityOrZip) {
      return NextResponse.json({
        vehicles: [],
        message: "Please enter a city or ZIP code",
      });
    }

    const rawQuery = normalizeCityQuery(cityOrZip);
    const isZip = /^\d{5}$/.test(rawQuery);
    
    const { resolved: query, suggestion, isAlias } = isZip 
      ? { resolved: rawQuery, suggestion: undefined, isAlias: false }
      : resolveCity(rawQuery);

    let vehicles: VehicleRecord[] = [];

    if (isZip) {
      const { data: zipData } = await supabase
        .from('vehicle_zips')
        .select('vehicle_id, vehicles_for_chatbot(*)')
        .eq('zip', query);

      if (zipData && zipData.length > 0) {
        vehicles = zipData
          .map((row: any) => {
            const v = row.vehicles_for_chatbot;
            if (Array.isArray(v)) return v[0];
            return v;
          })
          .filter((v: any) => v && v.active !== false);
      }
    } else {
      // Search original input first (e.g. "akron"), then fall back to alias (e.g. "cleveland")
      console.log('Searching for original city:', rawQuery);
      const { data: rawData, error: rawError } = await supabase
        .from('vehicles_for_chatbot')
        .select('*')
        .ilike('city', `%${rawQuery}%`)
        .eq('active', true);

      if (rawError) {
        console.error('Supabase error:', rawError);
      }

      vehicles = rawData || [];
      console.log('Found vehicles:', vehicles.length, 'for original city:', rawQuery);

      if (vehicles.length === 0 && isAlias) {
        console.log('No vehicles for original, trying alias:', query);
        const { data: aliasData } = await supabase
          .from('vehicles_for_chatbot')
          .select('*')
          .ilike('city', `%${query}%`)
          .eq('active', true);

        vehicles = aliasData || [];
        console.log('Found vehicles:', vehicles.length, 'for alias city:', query);
      }
      
      if (vehicles.length === 0) {
        console.log('No direct city match, trying ZIP lookup for:', rawQuery);
        const { zips, city: parsedCity, state } = await getZipsForLocation(rawQuery);
        
        if (zips.length > 0) {
          console.log(`Found ${zips.length} ZIP codes for ${parsedCity}, ${state}:`, zips.slice(0, 5));
          
          const { data: zipData } = await supabase
            .from('vehicle_zips')
            .select('vehicle_id, vehicles_for_chatbot(*)')
            .in('zip', zips);
          
          if (zipData && zipData.length > 0) {
            const uniqueVehicles = new Map<string, VehicleRecord>();
            
            for (const row of zipData) {
              const v = Array.isArray(row.vehicles_for_chatbot) 
                ? row.vehicles_for_chatbot[0] 
                : row.vehicles_for_chatbot;
              
              if (v && v.active !== false && !uniqueVehicles.has(v.id)) {
                uniqueVehicles.set(v.id, v);
              }
            }
            
            vehicles = Array.from(uniqueVehicles.values());
            console.log(`Found ${vehicles.length} vehicles via ZIP lookup for ${parsedCity}, ${state}`);
          }
        } else {
          console.log('No ZIP codes found via API, trying city index for:', rawQuery);
          
          if (!isCacheBuilt()) {
            const { data: allZips } = await supabase
              .from('vehicle_zips')
              .select('zip');
            
            if (allZips && allZips.length > 0) {
              const uniqueZips = [...new Set(allZips.map(z => z.zip))];
              await buildCityZipIndex(uniqueZips);
            }
          }
          
          const indexZips = searchCityIndex(rawQuery);
          
          if (indexZips.length > 0) {
            console.log(`Found ${indexZips.length} ZIP codes from city index for "${rawQuery}":`, indexZips.slice(0, 5));
            
            const { data: zipData } = await supabase
              .from('vehicle_zips')
              .select('vehicle_id, vehicles_for_chatbot(*)')
              .in('zip', indexZips);
            
            if (zipData && zipData.length > 0) {
              const uniqueVehicles = new Map<string, VehicleRecord>();
              
              for (const row of zipData) {
                const v = Array.isArray(row.vehicles_for_chatbot) 
                  ? row.vehicles_for_chatbot[0] 
                  : row.vehicles_for_chatbot;
                
                if (v && v.active !== false && !uniqueVehicles.has(v.id)) {
                  uniqueVehicles.set(v.id, v);
                }
              }
              
              vehicles = Array.from(uniqueVehicles.values());
              console.log(`Found ${vehicles.length} vehicles via city index for "${rawQuery}"`);
            }
          } else {
            console.log('No matches in city index for:', rawQuery);
          }
        }
      }
    }

    // Sort vehicles: ones matching passenger count first, then by capacity
    vehicles.sort((a, b) => {
      const capA = a.capacity ?? 0;
      const capB = b.capacity ?? 0;
      
      if (passengers) {
        const aMeetsRequirement = capA >= passengers;
        const bMeetsRequirement = capB >= passengers;
        
        // Vehicles meeting requirement come first
        if (aMeetsRequirement && !bMeetsRequirement) return -1;
        if (!aMeetsRequirement && bMeetsRequirement) return 1;
        
        // Within each group, sort by capacity (ascending for matching, descending for non-matching)
        if (aMeetsRequirement && bMeetsRequirement) {
          return capA - capB; // Smallest suitable vehicle first
        }
        // Non-matching vehicles sorted by capacity descending (largest first, closest to requirement)
        return capB - capA;
      }
      
      return capA - capB;
    });

    const formattedVehicles = vehicles.map((v: any) => {
      const priceInfo = getPriceForHours(v, hours);
      const capacityStr = v.capacity ? `${v.capacity} Passenger` : '';
      
      return {
        id: v.id,
        name: v.vehicle_title,
        vehicle_title: v.vehicle_title,
        capacity: capacityStr,
        price: priceInfo?.price || 0,
        hours: priceInfo?.hours || hours || 4,
        priceDisplay: priceInfo 
          ? `$${priceInfo.price.toLocaleString()} for ${priceInfo.hours} hours`
          : 'Price varies',
        image: v.image_main || v.image_2 || v.image_3 || null,
        image_2: v.image_2 || null,
        image_3: v.image_3 || null,
        gallery_all: v.gallery_all || null,
        categories: v.categories || null,
        category_slugs: v.category_slugs || null,
        city: v.city || null,
        short_description: v.short_description || null,
        tags: v.tags || null,
        custom_instructions: v.custom_instructions || null,
        price_3hr: v.price_3hr || null,
        price_4hr: v.price_4hr || null,
        price_5hr: v.price_5hr || null,
        price_6hr: v.price_6hr || null,
        price_7hr: v.price_7hr || null,
        price_8hr: v.price_8hr || null,
        price_9hr: v.price_9hr || null,
        price_10hr: v.price_10hr || null,
        prom_price_6hr: v.prom_price_6hr || null,
        prom_price_7hr: v.prom_price_7hr || null,
        prom_price_8hr: v.prom_price_8hr || null,
        prom_price_9hr: v.prom_price_9hr || null,
        prom_price_10hr: v.prom_price_10hr || null,
        before5pm_3hr: v.before5pm_3hr || null,
        before5pm_4hr: v.before5pm_4hr || null,
        before5pm_5hr: v.before5pm_5hr || null,
        before5pm_6hr: v.before5pm_6hr || null,
        before5pm_7hr: v.before5pm_7hr || null,
        april_may_weekend_5hr: v.april_may_weekend_5hr || null,
        april_may_weekend_6hr: v.april_may_weekend_6hr || null,
        april_may_weekend_7hr: v.april_may_weekend_7hr || null,
        april_may_weekend_8hr: v.april_may_weekend_8hr || null,
        april_may_weekend_9hr: v.april_may_weekend_9hr || null,
        transfer_price: v.transfer_price || null,
        is_transfer: v.is_transfer || false,
      };
    });

    let message = formattedVehicles.length > 0 
      ? `Found ${formattedVehicles.length} vehicle(s)` 
      : "No vehicles found for this area";
    
    if (suggestion && formattedVehicles.length > 0) {
      message = `${suggestion} - ${message}`;
    } else if (suggestion && formattedVehicles.length === 0) {
      message = suggestion;
    }

    // When no vehicles found, suggest nearest metros that DO have vehicles
    let nearbyMetros: Array<{ metro: string; drivingMiles: number; drivingMinutes: number; vehicleCount: number }> = [];
    if (formattedVehicles.length === 0) {
      try {
        // Get coordinates for the searched location
        let searchLat: number | null = null;
        let searchLng: number | null = null;

        if (isZip) {
          const zipCoords = await getZipCoordinates(rawQuery);
          if (zipCoords) {
            searchLat = zipCoords.lat;
            searchLng = zipCoords.lng;
          }
        } else {
          // For city names, try to match to METRO_COORDS or use the resolved city
          const metroMatch = Object.entries(METRO_COORDS).find(
            ([name]) => name.toLowerCase() === query.toLowerCase()
          );
          if (metroMatch) {
            searchLat = metroMatch[1].lat;
            searchLng = metroMatch[1].lng;
          } else {
            // Try to get coords from a ZIP lookup for this city
            const { zips } = await getZipsForLocation(rawQuery);
            if (zips.length > 0) {
              const zipCoords = await getZipCoordinates(zips[0]);
              if (zipCoords) {
                searchLat = zipCoords.lat;
                searchLng = zipCoords.lng;
              }
            }
          }
        }

        if (searchLat !== null && searchLng !== null) {
          const nearest = findNearestMetros(searchLat, searchLng, 5);
          
          // Check which of these metros actually have vehicles in the database
          for (const metro of nearest) {
            if (nearbyMetros.length >= 3) break;
            
            const { data: metroVehicles } = await supabase
              .from('vehicles_for_chatbot')
              .select('id')
              .ilike('city', `%${metro.metro}%`)
              .eq('active', true)
              .limit(1);

            if (metroVehicles && metroVehicles.length > 0) {
              const { count } = await supabase
                .from('vehicles_for_chatbot')
                .select('id', { count: 'exact', head: true })
                .ilike('city', `%${metro.metro}%`)
                .eq('active', true);

              nearbyMetros.push({
                metro: metro.metro,
                drivingMiles: metro.drivingMiles,
                drivingMinutes: metro.drivingMinutes,
                vehicleCount: count || 0,
              });
            }
          }

          if (nearbyMetros.length > 0) {
            message = `No vehicles found for "${rawQuery}". Try one of these nearby areas:`;
          }
        }
      } catch (err) {
        console.error('Error finding nearby metros:', err);
      }
    }

    return NextResponse.json({
      vehicles: formattedVehicles,
      message,
      suggestion,
      resolvedQuery: query !== rawQuery ? query : undefined,
      nearbyMetros: nearbyMetros.length > 0 ? nearbyMetros : undefined,
    });
  } catch (error) {
    console.error('Error in get-vehicles-for-call:', error);
    return NextResponse.json({
      vehicles: [],
      message: "Error fetching vehicles",
    }, { status: 500 });
  }
}
