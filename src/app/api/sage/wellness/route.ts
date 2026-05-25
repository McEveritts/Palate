import { streamSage } from "@/lib/sage";
import { getVaultRecipes, compileVaultContextString } from "@/lib/vaultParser";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptKey } from "@/lib/encryption";
import { z } from 'zod';

const wellnessRequestSchema = z.object({
  telemetry: z.object({
    sessionFrequency: z.number(),
    sessionFrequencyStr: z.string(),
    totalDuration: z.number(),
    totalCalories: z.number(),
    cardioDuration: z.number(),
    strengthDuration: z.number(),
    cardioPct: z.number(),
    strengthPct: z.number(),
    trainingLoadScore: z.number(),
  }),
  todayWorkout: z.enum(['Rest Day / Active Recovery', 'High-Intensity Cardio', 'High-Intensity Strength', 'High-Intensity Hybrid (HIIT)']),
  measurementSystem: z.enum(['metric', 'imperial']).default('metric'),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parseResult = wellnessRequestSchema.safeParse(body);
    if (!parseResult.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request body', details: parseResult.error.flatten() }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const { telemetry, todayWorkout, measurementSystem } = parseResult.data;

    // Retrieve NextAuth session
    const session = await getServerSession(authOptions).catch(() => null);
    const userId = session?.user ? session.user.id : null;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized. Sign in to analyze exercise behavior.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Gather context from the vault/database to ground the AI
    let vaultContext = "";
    try {
      vaultContext = await compileVaultContextString();
    } catch (e) {
      console.warn("Failed to compile vault context:", e);
      const recipes = await getVaultRecipes();
      vaultContext = recipes
        .map(r => `Recipe: ${r.title}\nTags: ${r.tags?.join(', ')}\nMacros: ${r.macros}`)
        .join('\n\n');
    }

    // Append user physiological profile if available
    try {
      const profile = await prisma.userProfile.findUnique({ where: { userId } });
      if (profile) {
        vaultContext += `\n\n[USER PHYSIOLOGICAL PROFILE]`;
        vaultContext += `\nGender: ${profile.gender}`;
        vaultContext += `\nWeight: ${profile.weightKg} kg`;
        vaultContext += `\nHeight: ${profile.heightCm} cm`;
        vaultContext += `\nDaily Target Calories: ${profile.targetCalories} kcal`;
        vaultContext += `\nDaily Target Protein: ${profile.targetProtein}g`;
        vaultContext += `\nDaily Target Carbs: ${profile.targetCarbs}g`;
        vaultContext += `\nDaily Target Fat: ${profile.targetFat}g`;
      }
    } catch (err) {
      console.warn('[SageAI] Profile context fetch failed (non-fatal):', err);
    }

    // Construct custom Wellness & Recovery prompt for Sage
    const customPrompt = `[🌱 SAGE WELLNESS ASSISTANT DIRECTIVE]:
    Perform a comprehensive, masterchef-level Physiological Recovery & Wellness Analysis. 
    
    Review my 14-day exercise behavior telemetry:
    - Session Frequency: ${telemetry.sessionFrequencyStr}
    - Training Load Score: ${telemetry.trainingLoadScore}/100
    - Cardio vs. Strength Split: ${telemetry.cardioPct}% Cardio / ${telemetry.strengthPct}% Strength
    - Total Duration: ${telemetry.totalDuration} minutes of active training
    - Energy Expenditure: ${telemetry.totalCalories} kcal burned
    
    My planned/completed training category for today is:
    - Focus: ${todayWorkout}
    
    You must structure your response exactly as follows:
    1. 🌿 **Exercise Behavior Assessment**: A professional, supportive, and elegant evaluation of my 14-day training frequency, training load progression (are they overtraining, maintaining, or detraining?), and cardio-to-strength ratio.
    2. 🎯 **Physiological Recovery Score**: Give a recovery status score out of 10 based on my training history and today's workout focus, explaining what metabolic demands my body currently has.
    3. 🍳 **MasterChef Recovery Meal Plan**: Review my Vault context above. Recommend exactly **1 or 2 specific recipes** from my Vault that are biochemically optimized for today's recovery. Detail the exact scientific reasoning:
       - If Strength: Focus on muscle protein synthesis, rebuilding damaged microfibres, and protein requirements.
       - If Cardio: Focus on rapid glycogen replenishment, replenishing carbohydrate stores, and hydration.
       - If Rest: Focus on healthy lipids, micronutrient density, anti-inflammatory herbs/spices, and metabolic efficiency.
    4. 💡 **Chef's Additions & Troubleshooting**: Provide 2-3 culinary/wellness notes (e.g. active hydration techniques, nutrient timing, or cooking adjustments to maximize amino acid absorption).
    
    Respect the unit preference: ${measurementSystem.toUpperCase()}. Speak concisely, with elite culinary elegance. Begin every single response with your <thought> tag containing your reasoning, calculations, and exact plan.`;

    let clientApiKey = undefined;
    const config = await prisma.userConfig.findUnique({
      where: { userId }
    });
    if (config?.encryptedGcpKey && config.iv && config.authTag) {
      clientApiKey = decryptKey(config.encryptedGcpKey, config.iv, config.authTag);
    }

    const stream = streamSage(customPrompt, vaultContext, undefined, clientApiKey, measurementSystem, undefined, userId);

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
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred while generating your wellness analysis." }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
