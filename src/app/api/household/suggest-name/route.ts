import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptKey } from "@/lib/encryption";
import { SAGE_MODEL, SAGE_JSON_THINKING_CONFIG, createGenAIClient } from '@/lib/ai/model-config';

/**
 * Sage-powered household naming.
 * Uses the centralized SAGE_MODEL to generate a creative, on-brand kitchen name.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const { memberNames } = await req.json();

    // Resolve API key: user's encrypted key → fallback to env
    let apiKey: string | undefined;

    const config = await prisma.userConfig.findUnique({
      where: { userId },
    });

    if (config?.encryptedGcpKey && config.iv && config.authTag) {
      apiKey = decryptKey(config.encryptedGcpKey, config.iv, config.authTag);
    }

    if (!apiKey) {
      apiKey = process.env.GEMINI_API_KEY;
    }

    if (!apiKey) {
      // Graceful fallback: return a sensible default instead of failing
      const fallbackName = memberNames?.length
        ? `${memberNames[0]}'s Kitchen`
        : `${session.user.name ?? "My"}'s Kitchen`;
      return NextResponse.json({ success: true, suggestedName: fallbackName });
    }

    const ai = createGenAIClient(apiKey);

    const names = memberNames?.length
      ? memberNames.join(" and ")
      : session.user.name ?? "Chef";

    const result = await ai.models.generateContent({
      model: SAGE_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Generate a creative kitchen name for a household with: ${names}`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: `You are Sage 🌿, an elegant and precise digital sous-chef persona. You are naming a shared household kitchen space within the Palate culinary application.

RULES:
- Generate exactly ONE short, creative kitchen name (2-5 words max).
- The name should feel warm, personal, and culinary — like naming a beloved family kitchen.
- Incorporate the household member names naturally when possible.
- Use culinary metaphors, wordplay, or warmth — NOT generic labels like "Kitchen" or "Home".
- Examples of the caliber expected: "The Everitt Hearth", "Sage & Stone Kitchen", "The Velvet Spatula", "Casa de Umami"
- Output ONLY the name. No quotes, no explanation, no punctuation, no preamble.`,
        temperature: 0.8,
        maxOutputTokens: 60,
        ...SAGE_JSON_THINKING_CONFIG,
      },
    });

    const suggestedName = (result.text || '')
      .trim()
      .replace(/^["']|["']$/g, "") // Strip any wrapping quotes
      .replace(/\n.*/g, "")         // Take only the first line
      .slice(0, 100);               // Hard cap

    // Discard key reference
    apiKey = undefined;

    return NextResponse.json({ success: true, suggestedName });
  } catch (error: unknown) {
    console.error("[POST /api/household/suggest-name error]:", error);
    // Graceful fallback on AI failure
    const session = await getServerSession(authOptions).catch(() => null);
    const fallbackName = `${session?.user?.name ?? "My"}'s Kitchen`;
    return NextResponse.json({ success: true, suggestedName: fallbackName });
  }
}
