import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

interface TipsRequest {
  city?: string;
  pickupAddress?: string;
  dropoffAddress?: string;
  eventType?: string;
  date?: string;
  time?: string;
  passengers?: number;
  hours?: number;
  vehicleType?: string;
  quotedVehicles?: Array<{ name: string; price: number; capacity: number }>;
  availableVehicles?: Array<{ name: string; price: number; capacity: number; category: string }>;
}

const CITY_SPECIAL_PRICING: Record<string, string[]> = {
  'grand rapids': ['prom pricing', 'before 5pm pricing'],
  'detroit': ['prom pricing', 'before 5pm pricing'],
  'chicago': ['prom pricing', 'before 5pm pricing', 'apr/may weekend'],
  'phoenix': ['prom pricing'],
  'dallas': ['prom pricing', 'before 5pm pricing'],
  'houston': ['prom pricing'],
  'denver': ['prom pricing', 'before 5pm pricing'],
  'las vegas': ['before 5pm pricing'],
  'los angeles': ['prom pricing'],
  'miami': ['prom pricing'],
  'atlanta': ['prom pricing', 'before 5pm pricing'],
};

const REMOTE_ROUTES: Record<string, { distance: string; driveTime: string; note: string }> = {
  'vail-breckenridge': { distance: '35 miles', driveTime: '45 min', note: 'Mountain pass, can be slow in winter' },
  'denver-vail': { distance: '100 miles', driveTime: '1.5-2 hrs', note: 'I-70 traffic can double this on weekends' },
  'denver-breckenridge': { distance: '80 miles', driveTime: '1.5 hrs', note: 'Recommend charging drive time' },
  'phoenix-sedona': { distance: '115 miles', driveTime: '2 hrs', note: 'Scenic but long - charge drive time' },
  'phoenix-flagstaff': { distance: '145 miles', driveTime: '2.5 hrs', note: 'Definitely charge drive time' },
  'dallas-austin': { distance: '195 miles', driveTime: '3 hrs', note: 'Too far for hourly - quote one-way transfer' },
  'chicago-milwaukee': { distance: '90 miles', driveTime: '1.5 hrs', note: 'Consider one-way transfer pricing' },
  'la-san diego': { distance: '120 miles', driveTime: '2 hrs', note: 'Traffic dependent - quote conservatively' },
  'miami-orlando': { distance: '235 miles', driveTime: '3.5 hrs', note: 'Too far for hourly rental' },
};

export async function POST(request: NextRequest) {
  try {
    const data: TipsRequest = await request.json();
    
    if (!data.city && !data.pickupAddress && !data.eventType) {
      return NextResponse.json({ tips: [] });
    }

    const tips: string[] = [];
    
    const cityLower = (data.city || '').toLowerCase();
    const specialPricing = CITY_SPECIAL_PRICING[cityLower];
    if (specialPricing && specialPricing.length > 0) {
      if (data.eventType?.toLowerCase().includes('prom') && specialPricing.includes('prom pricing')) {
        tips.push(`🎓 PROM PRICING available in ${data.city} - make sure to apply prom rates!`);
      }
      if (data.time) {
        const hourMatch = data.time.match(/(\d{1,2})/);
        if (hourMatch) {
          let hour = parseInt(hourMatch[1]);
          if (data.time.toLowerCase().includes('pm') && hour !== 12) hour += 12;
          if (data.time.toLowerCase().includes('am') && hour === 12) hour = 0;
          if (hour < 17 && specialPricing.includes('before 5pm pricing')) {
            tips.push(`⏰ Before 5PM pricing may apply - pickup is at ${data.time}`);
          }
        }
      }
      const now = new Date();
      const month = now.getMonth() + 1;
      if ((month === 4 || month === 5) && specialPricing.includes('apr/may weekend')) {
        tips.push(`📅 Apr/May Weekend pricing available - busy prom/wedding season!`);
      }
    }

    if (data.pickupAddress && data.dropoffAddress) {
      const pickup = data.pickupAddress.toLowerCase();
      const dropoff = data.dropoffAddress.toLowerCase();
      
      for (const [route, info] of Object.entries(REMOTE_ROUTES)) {
        const [city1, city2] = route.split('-');
        if ((pickup.includes(city1) && dropoff.includes(city2)) ||
            (pickup.includes(city2) && dropoff.includes(city1))) {
          tips.push(`🚗 ${data.pickupAddress} → ${data.dropoffAddress}: ${info.distance}, ~${info.driveTime}. ${info.note}`);
          break;
        }
      }
    }

    if (data.passengers && data.availableVehicles && data.availableVehicles.length > 0) {
      const suitable = data.availableVehicles
        .filter(v => v.capacity >= data.passengers!)
        .sort((a, b) => a.price - b.price);
      
      if (suitable.length > 0) {
        const cheapest = suitable[0];
        const quotedNames = (data.quotedVehicles || []).map(v => v.name.toLowerCase());
        if (!quotedNames.includes(cheapest.name.toLowerCase())) {
          tips.push(`💰 Best value for ${data.passengers} passengers: ${cheapest.name} ($${cheapest.price}) fits ${cheapest.capacity}`);
        }
      }
    }

    if (data.date) {
      const dateLower = data.date.toLowerCase();
      if (dateLower.includes('dec 31') || dateLower.includes('new year')) {
        tips.push(`🎆 New Year's Eve - expect premium pricing and high demand!`);
      }
      if (dateLower.includes('valentine') || dateLower.includes('feb 14')) {
        tips.push(`💕 Valentine's Day - romantic packages sell well, upsell champagne!`);
      }
    }

    if (data.eventType) {
      const event = data.eventType.toLowerCase();
      if (event.includes('wedding')) {
        tips.push(`💒 Wedding tip: Confirm exact ceremony & reception times, offer shuttle for guests`);
      }
      if (event.includes('bachelor') || event.includes('bachelorette')) {
        tips.push(`🎉 Party tip: Party buses with poles/lights are popular, mention onboard amenities`);
      }
      if (event.includes('concert') || event.includes('game') || event.includes('sporting')) {
        tips.push(`🎤 Event tip: Confirm venue parking/drop-off rules, traffic can add 30+ min`);
      }
    }

    if (tips.length < 3 && (data.city || data.eventType || data.pickupAddress)) {
      const prompt = `You are a helpful sales assistant for a party bus/limo rental company. Give 1-2 VERY brief, actionable tips for an agent based on this call:
      
City: ${data.city || 'not specified'}
Event: ${data.eventType || 'not specified'}
Date: ${data.date || 'not specified'}
Time: ${data.time || 'not specified'}
Passengers: ${data.passengers || 'not specified'}
Pickup: ${data.pickupAddress || 'not specified'}
Dropoff: ${data.dropoffAddress || 'not specified'}
Vehicle type requested: ${data.vehicleType || 'not specified'}

Tips should be:
- Quick facts about the area or venue
- Upsell opportunities
- Traffic/timing warnings
- Pricing suggestions
- Route info

Keep each tip under 15 words. Use emoji. Be specific and actionable.`;

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150,
          temperature: 0.7,
        });

        const aiTips = completion.choices[0]?.message?.content?.split('\n')
          .filter(line => line.trim().length > 0)
          .slice(0, 2);
        
        if (aiTips) {
          tips.push(...aiTips);
        }
      } catch (aiError) {
        console.error('AI tips error:', aiError);
      }
    }

    return NextResponse.json({ tips: tips.slice(0, 4) });
  } catch (error) {
    console.error('Agent tips error:', error);
    return NextResponse.json({ tips: [] });
  }
}
