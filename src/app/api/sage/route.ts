import { streamSage } from "@/lib/sage";
import { getAllRecipes } from "@/lib/vault";
import { getVaultRecipes } from "@/lib/vaultParser";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/db";
import { decryptKey } from "@/lib/encryption";

export async function POST(req: Request) {
  try {
    const { prompt, image, measurementSystem } = await req.json();

    // Retrieve NextAuth session
    const session = await getServerSession(authOptions).catch(() => null);
    const userId = session?.user ? (session.user as any).id : null;

    let recipes;
    let vaultContext = "";

    // Gather context from the vault/database to ground the AI
    if (userId) {
      recipes = await getVaultRecipes();
      vaultContext = recipes
        .map(r => `Recipe: ${r.title}\nTags: ${r.tags?.join(', ')}\nMacros: ${r.macros}`)
        .join('\n\n');
    } else {
      recipes = getAllRecipes();
      vaultContext = recipes
        .map(r => `Recipe: ${r.frontmatter.title}\nTags: ${r.frontmatter.tags?.join(', ')}\nMacros: ${JSON.stringify(r.frontmatter.macros)}`)
        .join('\n\n');
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

    const stream = streamSage(prompt, vaultContext, false, image, clientApiKey, measurementSystem);

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

  } catch (error: any) {
    console.error("Sage AI Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Failed to communicate with Sage." }), { status: 500 });
  }
}

