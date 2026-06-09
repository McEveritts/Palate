import { SAGE_MODEL, SAGE_JSON_THINKING_CONFIG, createGenAIClient } from '@/lib/ai/model-config';

import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptKey } from "@/lib/encryption";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions).catch(() => null);
  const userId = session?.user ? session.user.id : null;

  let clientApiKey = req.headers.get("x-gemini-api-key") || undefined;

  if (!clientApiKey && userId) {
    const config = await prisma.userConfig.findUnique({
      where: { userId }
    });
    if (config?.encryptedGcpKey && config.iv && config.authTag) {
      clientApiKey = decryptKey(config.encryptedGcpKey, config.iv, config.authTag);
    }
  }

  // Unauthenticated guests must provide their own API key
  if (!userId && !clientApiKey) {
    return new Response(JSON.stringify({ error: "Unauthorized. Guest users must provide their own Gemini API key." }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiKey = clientApiKey || process.env.GEMINI_API_KEY || "";

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Internal Server Error: API key is not configured." }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const ai = createGenAIClient(apiKey);

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Bad Request: Invalid JSON body." }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { image } = body;

  if (!image) {
    return new Response(JSON.stringify({ error: "Bad Request: 'image' base64 payload is required." }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const systemInstruction = `You are a professional culinary analyst and food science specialist for 'Palate'.
The user will provide an image of a meal or plate of food.
Your task is to analyze the visual components of the meal, estimate the dish name, and perform a highly accurate nutritional breakdown (calories, protein, carbs, fat, and serving size).
You MUST output your response strictly as a single, valid JSON object matching the following TypeScript interface:
{
  "name": string,      // Descriptive name of the meal (e.g. "Pan-seared Salmon with Broccoli and Brown Rice")
  "brand": string,     // Left blank or "Homemade"
  "calories": number,  // Total estimated calories in kcal
  "protein": number,   // Total estimated protein in grams
  "carbs": number,     // Total estimated carbohydrates in grams
  "fat": number,       // Total estimated fat in grams
  "fiber": number,     // Estimated fiber in grams (optional)
  "servingSize": string // e.g. "1 plate (approx 350g)", "1 bowl", etc.
}

[CRITICAL RULES]
- Do NOT output any markdown tags (like \`\`\`json ... \`\`\`), HTML, system explanations, or reasoning blocks.
- Your output MUST start with { and end with } and be valid JSON that can be parsed directly with JSON.parse().
- Deliver mathematically cohesive macros (4 kcal per gram of protein/carbs, 9 kcal per gram of fat).`;

    const mimeTypeMatch = image.match(/^data:(image\/\w+);base64,/);
    if (!mimeTypeMatch) {
      return new Response(JSON.stringify({ error: "Bad Request: Invalid image format. Expected a base64 data URL." }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const promptParts = [
      {
        inlineData: {
          data: image.replace(/^data:image\/\w+;base64,/, ''),
          mimeType: mimeTypeMatch[1]
        }
      },
      { text: systemInstruction }
    ];

    const result = await ai.models.generateContent({
      model: SAGE_MODEL,
      contents: [{ role: 'user', parts: promptParts }],
      config: {
        responseMimeType: 'application/json',
        ...SAGE_JSON_THINKING_CONFIG,
      },
    });
    const text = (result.text || '').trim();

    try {
      const parsedData = JSON.parse(text);
      return new Response(JSON.stringify({ success: true, product: parsedData }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch {
      console.error("[MealScan API] Failed to parse JSON response:", text);
      return new Response(JSON.stringify({ error: "Internal Server Error: AI response was not valid JSON." }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error("Meal Scan API Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error: Failed to analyze meal image." }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
