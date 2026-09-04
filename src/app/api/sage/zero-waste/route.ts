import { SAGE_MODEL, SAGE_THINKING_CONFIG, createGenAIClient } from '@/lib/ai/model-config';
import { ThoughtDemarcator } from '@/lib/sage';

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

  const { prompt, image, measurementSystem } = body;

  if (!prompt && !image) {
    return new Response(JSON.stringify({ error: "Bad Request: 'prompt' or 'image' is required." }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const unitInstruction = (measurementSystem === 'imperial')
      ? `\n\n[CRITICAL OVERRIDE]: The user has selected IMPERIAL measurements. You MUST formulate and output all culinary measurements in US/Imperial units (cups, ounces, pounds, tablespoons, teaspoons, Fahrenheit) instead of metric (grams/ml/Celsius).`
      : `\n\n[CRITICAL]: The user has selected METRIC measurements. You MUST formulate and output all culinary measurements in metric units (grams, milliliters, kilograms, Celsius) by default.`;

    const systemInstruction = `You are a Zero-Waste Culinary Specialist.
The user will provide a list of random ingredients, or an image of ingredients in their fridge.
Your goal is to synthesize a cohesive, delicious recipe that uses these specific ingredients to prevent food waste.
Output the final recipe in Palate's standard Markdown format with YAML frontmatter.${unitInstruction}`;

    const promptParts: { inlineData?: { data: string; mimeType: string }; text?: string }[] = [];
    if (image) {
      const mimeTypeMatch = image.match(/^data:(image\/\w+);base64,/);
      if (mimeTypeMatch) {
        promptParts.push({
          inlineData: {
            data: image.replace(/^data:image\/\w+;base64,/, ''),
            mimeType: mimeTypeMatch[1]
          }
        });
      }
    }

    if (prompt) {
      promptParts.push({ text: prompt });
    } else {
       promptParts.push({ text: "What recipe can I make to use up these ingredients before they go bad?" });
    }

    const stream = await ai.models.generateContentStream({
      model: SAGE_MODEL,
      contents: [{ role: 'user', parts: promptParts }],
      config: {
        systemInstruction,
        ...SAGE_THINKING_CONFIG,
      },
    });

    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const demarcator = new ThoughtDemarcator((chunk) => controller.enqueue(encoder.encode(chunk)));

        try {
          for await (const chunk of stream) {
            const candidate = chunk.candidates?.[0];
            if (candidate?.content?.parts) {
              for (const part of candidate.content.parts) {
                if (part.thought && part.text) {
                  demarcator.pushThought(part.text);
                } else if (part.text) {
                  demarcator.pushContent(part.text);
                }
              }
            } else if (chunk.text) {
              demarcator.pushContent(chunk.text);
            }
          }
          demarcator.flush();
          controller.close();
        } catch (streamError) {
          demarcator.flush();
          controller.error(streamError);
        }
      }
    });

    return new Response(readableStream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  } catch (error) {
    console.error("Generative AI API Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error: Failed to generate content." }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
