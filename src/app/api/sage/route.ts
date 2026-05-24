import { streamSage } from "@/lib/sage";
import { getAllRecipes } from "@/lib/vault";
import { getVaultRecipes, compileVaultContextString } from "@/lib/vaultParser";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/db";
import { decryptKey } from "@/lib/encryption";
import { analyzeDietaryPatterns, buildProactiveContext } from "@/lib/patternAnalysis";
import { z } from 'zod';

// H-4 Fix: Zod schema for request body validation
const sageRequestSchema = z.object({
  prompt: z.string().min(1),
  image: z.string().optional(),
  measurementSystem: z.enum(['metric', 'imperial']).default('metric'),
  history: z.array(z.any()).optional(),
  dailyTargets: z.object({ calories: z.number(), protein: z.number(), carbs: z.number(), fat: z.number() }).optional(),
  currentTotals: z.object({ calories: z.number(), protein: z.number(), carbs: z.number(), fat: z.number() }).optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parseResult = sageRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request body', details: parseResult.error.flatten() }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const { prompt, image, measurementSystem, history, dailyTargets, currentTotals } = parseResult.data;

    // Retrieve NextAuth session
    const session = await getServerSession(authOptions).catch(() => null);
    const userId = session?.user ? session.user.id : null;

    let vaultContext = "";

    // Gather context from the vault/database to ground the AI
    try {
      vaultContext = await compileVaultContextString();
    } catch (e) {
      console.warn("Failed to compile vault context:", e);
      if (userId) {
        const recipes = await getVaultRecipes();
        vaultContext = recipes
          .map(r => `Recipe: ${r.title}\nTags: ${r.tags?.join(', ')}\nMacros: ${r.macros}`)
          .join('\n\n');
      } else {
        const recipes = getAllRecipes();
        vaultContext = recipes
          .map(r => `Recipe: ${r.frontmatter.title}\nTags: ${r.frontmatter.tags?.join(', ')}\nMacros: ${JSON.stringify(r.frontmatter.macros)}`)
          .join('\n\n');
      }
    }

    if (dailyTargets || currentTotals) {
      vaultContext += `\n\n[USER MACRO TRACKING]`;
      if (dailyTargets) vaultContext += `\nDaily Targets: ${JSON.stringify(dailyTargets)}`;
      if (currentTotals) vaultContext += `\nCurrent Totals: ${JSON.stringify(currentTotals)}`;
    }

    // ── Behavioral Pattern Analysis (non-fatal) ─────────────
    if (userId) {
      try {
        const profile = await prisma.userProfile.findUnique({ where: { userId } });
        if (profile) {
          const patterns = await analyzeDietaryPatterns(
            userId,
            profile.targetCalories,
            profile.targetProtein
          );
          const currentHour = new Date().getHours();
          const behavioralContext = buildProactiveContext(
            patterns,
            currentTotals || null,
            profile.targetCalories,
            profile.targetProtein,
            currentHour
          );
          vaultContext += `\n\n${behavioralContext}`;
        }
      } catch (err) {
        console.warn('[SageAI] Pattern analysis failed (non-fatal):', err);
      }
    }

    let clientApiKey = req.headers.get("x-gemini-api-key") || undefined;

    if (!clientApiKey && userId) {
      const config = await prisma.userConfig.findUnique({
        where: { userId }
      });
      if (config?.encryptedGcpKey && config.iv && config.authTag) {
        clientApiKey = decryptKey(config.encryptedGcpKey, config.iv, config.authTag);
      }
    }

    const stream = streamSage(prompt, vaultContext, image, clientApiKey, measurementSystem, history);

    // Discard key immediately after calling the stream function
    clientApiKey = undefined;

    // Convert the Gemini stream to a standard Web ReadableStream
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunkText of stream) {
            controller.enqueue(new TextEncoder().encode(chunkText));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      }
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: unknown) {
    console.error("[Sage API Error]:", error);
    // M-25 Fix: Include Content-Type header on error response
    return new Response(JSON.stringify({ error: "An unexpected error occurred while communicating with Sage." }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

