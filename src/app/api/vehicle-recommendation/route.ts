import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function POST(request: Request) {
  try {
    const { vehicle, tripContext } = await request.json();

    if (!vehicle) {
      return NextResponse.json(
        { error: "Vehicle information required" },
        { status: 400 }
      );
    }

    const vehicleName = vehicle.name || '';
    const capacity = vehicle.capacity || 0;
    const category = vehicle.category || '';
    const description = vehicle.description || vehicle.short_description || '';
    const instructions = vehicle.custom_instructions || '';
    const amenities = vehicle.amenities || '';
    const features = vehicle.features || '';
    
    const vehicleType = category.toLowerCase();
    const isLimo = vehicleType.includes('limo') || vehicleType.includes('stretch');
    const isPartyBus = vehicleType.includes('party') || vehicleType.includes('bus');
    const isShuttle = vehicleType.includes('shuttle') || vehicleType.includes('sprinter');
    const isSedan = vehicleType.includes('sedan') || vehicleType.includes('suv') || vehicleType.includes('car');
    
    const typeContext = isLimo 
      ? 'This is a limousine - intimate, luxurious seating, good for small groups. NOT a dance floor vehicle.'
      : isPartyBus 
      ? 'This is a party bus - larger capacity, may have dance floor/pole, bar area, louder music capability.'
      : isShuttle
      ? 'This is a shuttle/sprinter - efficient point-to-point transport, professional, practical.'
      : isSedan
      ? 'This is a sedan/SUV - elegant, executive-style, intimate for small groups.'
      : 'Transportation vehicle.';
    
    const prompt = `Generate 3 factual selling points for this vehicle. Be ACCURATE - do NOT invent features.

VEHICLE: ${vehicleName}
TYPE: ${category}
CAPACITY: ${capacity} passengers
${typeContext}
${description ? `DESCRIPTION: ${description}` : ''}
${amenities ? `AMENITIES: ${amenities}` : ''}
${features ? `FEATURES: ${features}` : ''}
${instructions ? `SPECIAL NOTES: ${instructions}` : ''}

CUSTOMER INFO:
- Event: ${tripContext?.eventType || 'transportation'}
- Group size: ${tripContext?.passengers || 'unknown'} people
- Location: ${tripContext?.city || 'local area'}

STRICT RULES:
1. ONLY mention features EXPLICITLY listed above - NEVER invent features
2. If capacity is 10 or less, do NOT mention dancing - limos are NOT dance vehicles
3. Party buses (20+ passengers) may have dance areas - only mention if described above
4. Each point MAX 10 words
5. Focus on: capacity fit, vehicle style, value proposition
6. NO words: perfect, great, amazing, fantastic, ideal
7. Start each with •
8. If unsure about a feature, DO NOT mention it

GOOD examples for a 10-passenger limo:
• Seats exactly 10 in luxury leather interior
• Intimate setting for your ${tripContext?.eventType || 'event'}
• Premium stretch limo at competitive rate

BAD examples (fabricated features):
• Dance the night away (FALSE for small limos)
• Built-in dance pole (FALSE unless listed)
• Standing room for dancing (FALSE for limos)`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 200,
      temperature: 0.7,
    });

    const recommendation = response.choices[0]?.message?.content?.trim() || 
      "• Perfect vehicle for your special event\n• Comfortable and stylish transportation\n• Great value for your group size";

    return NextResponse.json({ recommendation });
  } catch (error) {
    console.error("Error getting vehicle recommendation:", error);
    return NextResponse.json(
      { 
        recommendation: "• Great choice for your event!\n• Comfortable and stylish transportation\n• Perfect for your group size" 
      },
      { status: 200 }
    );
  }
}
