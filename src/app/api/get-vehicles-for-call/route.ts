import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
  'phoenix': ['mesa', 'tempe', 'scottsdale', 'glendale', 'chandler', 'gilbert', 'peoria', 'surprise', 'goodyear', 'avondale', 'buckeye', 'cave creek', 'carefree', 'paradise valley', 'fountain hills', 'queen creek', 'apache junction', 'sun city', 'sun lakes', 'anthem'],
  'los angeles': ['la', 'hollywood', 'beverly hills', 'santa monica', 'pasadena', 'glendale', 'burbank', 'long beach', 'torrance', 'inglewood', 'culver city', 'west hollywood', 'malibu', 'venice', 'marina del rey', 'downtown la', 'dtla'],
  'new york': ['nyc', 'manhattan', 'brooklyn', 'queens', 'bronx', 'staten island', 'harlem', 'soho', 'tribeca', 'chelsea', 'midtown'],
  'las vegas': ['vegas', 'henderson', 'north las vegas', 'summerlin', 'the strip', 'downtown vegas', 'boulder city', 'paradise'],
  'san diego': ['la jolla', 'del mar', 'coronado', 'chula vista', 'oceanside', 'carlsbad', 'encinitas', 'escondido', 'national city'],
  'san francisco': ['sf', 'oakland', 'berkeley', 'san jose', 'palo alto', 'mountain view', 'sunnyvale', 'fremont', 'hayward', 'daly city', 'south sf'],
  'miami': ['miami beach', 'south beach', 'fort lauderdale', 'boca raton', 'west palm beach', 'coral gables', 'hialeah', 'hollywood fl', 'pompano beach'],
  'chicago': ['evanston', 'oak park', 'naperville', 'schaumburg', 'aurora', 'joliet', 'elgin', 'waukegan', 'cicero'],
  'dallas': ['fort worth', 'arlington', 'plano', 'irving', 'garland', 'frisco', 'mckinney', 'denton', 'richardson', 'carrollton', 'lewisville'],
  'houston': ['the woodlands', 'sugar land', 'katy', 'pearland', 'pasadena', 'baytown', 'league city', 'galveston', 'cypress', 'spring'],
  'atlanta': ['marietta', 'sandy springs', 'roswell', 'alpharetta', 'johns creek', 'smyrna', 'dunwoody', 'kennesaw', 'decatur', 'buckhead'],
  'denver': ['aurora', 'lakewood', 'thornton', 'arvada', 'westminster', 'boulder', 'centennial', 'littleton', 'highlands ranch', 'cherry hills'],
  'seattle': ['bellevue', 'tacoma', 'everett', 'kent', 'renton', 'federal way', 'kirkland', 'redmond', 'olympia', 'bothell'],
  'philadelphia': ['philly', 'camden', 'cherry hill', 'king of prussia', 'media', 'norristown', 'upper darby', 'wilmington'],
  'boston': ['cambridge', 'brookline', 'newton', 'somerville', 'quincy', 'waltham', 'medford', 'worcester'],
  'austin': ['round rock', 'cedar park', 'georgetown', 'pflugerville', 'san marcos', 'kyle', 'leander', 'dripping springs'],
  'nashville': ['franklin', 'murfreesboro', 'brentwood', 'hendersonville', 'smyrna', 'gallatin', 'lebanon', 'mt juliet'],
  'orlando': ['kissimmee', 'lake buena vista', 'winter park', 'sanford', 'altamonte springs', 'celebration', 'daytona beach'],
  'tampa': ['st petersburg', 'clearwater', 'brandon', 'lakeland', 'sarasota', 'bradenton', 'st pete beach'],
  'new orleans': ['nola', 'metairie', 'kenner', 'slidell', 'gretna', 'harvey', 'marrero', 'french quarter'],
  'san antonio': ['new braunfels', 'boerne', 'schertz', 'cibolo', 'helotes', 'alamo heights', 'live oak'],
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
      console.log('Searching for city:', query);
      const { data: cityData, error: cityError } = await supabase
        .from('vehicles_for_chatbot')
        .select('*')
        .ilike('city', `%${query}%`)
        .eq('active', true);

      if (cityError) {
        console.error('Supabase error:', cityError);
      }
      console.log('Found vehicles:', cityData?.length || 0, 'for city:', query);
      if (cityData && cityData.length > 0) {
        console.log('Sample cities in results:', cityData.slice(0, 3).map((v: any) => v.city));
      }

      vehicles = cityData || [];
      
      if (vehicles.length === 0 && isAlias) {
        const { data: aliasData } = await supabase
          .from('vehicles_for_chatbot')
          .select('*')
          .ilike('city', `%${rawQuery}%`)
          .eq('active', true);
        
        vehicles = aliasData || [];
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

    return NextResponse.json({
      vehicles: formattedVehicles,
      message,
      suggestion,
      resolvedQuery: query !== rawQuery ? query : undefined,
    });
  } catch (error) {
    console.error('Error in get-vehicles-for-call:', error);
    return NextResponse.json({
      vehicles: [],
      message: "Error fetching vehicles",
    }, { status: 500 });
  }
}
