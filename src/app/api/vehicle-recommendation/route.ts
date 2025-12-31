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

    const prompt = `You are a helpful sales assistant for a luxury vehicle rental company (party buses, limos, shuttles).

Generate 3 SHORT selling points (1 line each) that an agent can use when recommending this vehicle to a customer. Be specific to the vehicle and event type. Focus on benefits the customer cares about.

Vehicle Information:
- Name: ${vehicle.name}
- Type: ${vehicle.category || 'Luxury Vehicle'}
- Capacity: ${vehicle.capacity || 'Multiple passengers'}
- Price: ${vehicle.price || 'Competitive pricing'}
${vehicle.amenities?.length > 0 ? `- Amenities: ${vehicle.amenities.join(', ')}` : ''}

Customer Context:
- Event: ${tripContext?.eventType || 'Special occasion'}
- Party size: ${tripContext?.passengers || 'Group'}
- Date: ${tripContext?.date || 'Upcoming'}
- Location: ${tripContext?.city || 'Local'}

Respond with exactly 3 bullet points, each starting with a bullet point character. Keep each point under 15 words. Be enthusiastic but professional.`;

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
