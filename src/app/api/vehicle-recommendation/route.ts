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
    
    const prompt = `Generate 3 quick selling points for this vehicle. NO generic phrases. Be SPECIFIC to THIS vehicle.

VEHICLE: ${vehicleName}
TYPE: ${category}
FITS: ${capacity} passengers
${description ? `DETAILS: ${description}` : ''}
${instructions ? `NOTES: ${instructions}` : ''}

CUSTOMER NEEDS:
- Event: ${tripContext?.eventType || 'event'}
- Group: ${tripContext?.passengers || capacity} people
- Area: ${tripContext?.city || 'local'}

RULES:
1. Each point MAX 10 words
2. Focus on what makes THIS vehicle special
3. Mention capacity fit, vehicle features, or value
4. NO filler words like "perfect", "great", "amazing"
5. NO generic statements that could apply to any vehicle
6. Start each with •

Examples of GOOD points:
• Fits your group of 25 with room to spare
• Built-in bar and dance pole included
• Lowest price for a 30-passenger bus here

Examples of BAD points (too generic):
• Perfect for your special occasion
• Great value for your group
• Comfortable transportation`;

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
