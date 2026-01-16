import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function POST(request: NextRequest) {
  try {
    const { zipCode, metroCity } = await request.json();

    if (!zipCode || !metroCity) {
      return NextResponse.json({ error: "Missing zipCode or metroCity" }, { status: 400 });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a distance calculator. Given a ZIP code and a metro city, estimate the driving distance and time from that ZIP code area to the downtown/center of the metro city.

Return ONLY a JSON object with these fields:
- miles: number (approximate driving distance in miles)
- minutes: number (approximate driving time in minutes under normal traffic)
- description: string (brief description like "Northwest suburbs" or "Far south side")

Be accurate based on your knowledge of US geography. If you don't know the ZIP code, make a reasonable estimate or return null values.`
        },
        {
          role: "user",
          content: `ZIP code: ${zipCode}\nMetro city: ${metroCity}\n\nCalculate driving distance and time from this ZIP to downtown ${metroCity}.`
        }
      ],
      temperature: 0.1,
      max_tokens: 150,
    });

    const content = response.choices[0]?.message?.content || "";
    
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        return NextResponse.json({
          success: true,
          zipCode,
          metroCity,
          miles: data.miles || null,
          minutes: data.minutes || null,
          description: data.description || null,
        });
      }
    } catch (parseError) {
      console.error("Failed to parse distance response:", content);
    }

    return NextResponse.json({
      success: false,
      zipCode,
      metroCity,
      miles: null,
      minutes: null,
      description: null,
    });

  } catch (error) {
    console.error("Distance calculation error:", error);
    return NextResponse.json({ error: "Failed to calculate distance" }, { status: 500 });
  }
}
