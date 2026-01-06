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

export async function POST(request: NextRequest) {
  try {
    const data: TipsRequest = await request.json();
    
    if (!data.city && !data.pickupAddress && !data.eventType && !data.dropoffAddress) {
      return NextResponse.json({ tips: [] });
    }

    const contextParts: string[] = [];
    if (data.city) contextParts.push(`City/Area: ${data.city}`);
    if (data.pickupAddress) contextParts.push(`Pickup: ${data.pickupAddress}`);
    if (data.dropoffAddress) contextParts.push(`Dropoff: ${data.dropoffAddress}`);
    if (data.eventType) contextParts.push(`Event: ${data.eventType}`);
    if (data.date) contextParts.push(`Date: ${data.date}`);
    if (data.time) contextParts.push(`Pickup time: ${data.time}`);
    if (data.passengers) contextParts.push(`Passengers: ${data.passengers}`);
    if (data.hours) contextParts.push(`Hours requested: ${data.hours}`);
    if (data.vehicleType) contextParts.push(`Vehicle preference: ${data.vehicleType}`);
    
    if (data.availableVehicles && data.availableVehicles.length > 0) {
      const vehicleSummary = data.availableVehicles.slice(0, 5).map(v => 
        `${v.name} (${v.capacity} pax, $${v.price})`
      ).join(', ');
      contextParts.push(`Available vehicles: ${vehicleSummary}`);
    }
    
    if (data.quotedVehicles && data.quotedVehicles.length > 0) {
      const quotedSummary = data.quotedVehicles.map(v => v.name).join(', ');
      contextParts.push(`Already quoted: ${quotedSummary}`);
    }

    const prompt = `You are a quick-tip assistant for party bus/limo rental sales agents. Based on the current call info, give 2-3 SHORT, ACTIONABLE tips to help close the sale.

CALL INFO:
${contextParts.join('\n')}

GIVE TIPS ABOUT:
- If pickup and dropoff are far apart, warn about drive time charges and estimate distance/time
- If it's a popular venue or destination, mention something helpful (parking, traffic, best drop spot)
- If the time is before 5pm, remind about "before 5pm" discounts
- If it's prom season (April-June), remind about prom pricing
- If passengers are specified, suggest the best-fit vehicle from available options
- If one vehicle is significantly cheaper but still fits, point it out
- If the route is scenic or popular, mention it as a selling point
- If traffic is typically bad at that time, warn them
- Any quick upsell opportunities (champagne, decorations, red carpet)

FORMAT: Return exactly 2-3 tips as a JSON array of strings. Each tip should be 1 short sentence with an emoji at the start. Be specific and actionable, not generic.

Example good tips:
["🚗 Denver to Vail is 100mi/2hrs - charge $150+ drive time!", "💰 The 22-pax Tiffany Bus ($850) beats the Escalade for this group size", "🎓 April prom pricing applies - use the discounted rate!"]

Example bad tips (too generic, don't do this):
["Consider upselling", "Check pricing", "Be friendly"]

Return ONLY the JSON array, no other text.`;

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.7,
      });

      let content = completion.choices[0]?.message?.content?.trim() || '';
      
      // Remove markdown code blocks if present
      content = content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      
      let tips: string[] = [];
      try {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          tips = parsed.filter(t => typeof t === 'string').slice(0, 3);
        }
      } catch {
        // If JSON parsing fails, try to extract tips line by line
        const lines = content.split('\n').filter(l => l.trim().length > 5);
        tips = lines.slice(0, 3).map(l => {
          // Clean up common prefixes
          return l.replace(/^[\d\.\-\*\[\]\"]+\s*/, '')
                  .replace(/[\"\],]+$/, '')
                  .replace(/^"/, '')
                  .trim();
        }).filter(t => t.length > 5);
      }

      // If still no tips, return empty
      if (tips.length === 0) {
        return NextResponse.json({ tips: [] });
      }

      return NextResponse.json({ tips });
    } catch (aiError) {
      console.error('OpenAI tips error:', aiError);
      return NextResponse.json({ tips: ['⚠️ Tips temporarily unavailable'] });
    }
  } catch (error) {
    console.error('Agent tips error:', error);
    return NextResponse.json({ tips: [] });
  }
}
