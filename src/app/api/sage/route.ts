import { streamSage } from "@/lib/sage";
import { getAllRecipes } from "@/lib/vault";

export async function POST(req: Request) {
  try {
    const { prompt, image } = await req.json();
    const clientApiKey = req.headers.get("x-gemini-api-key") || undefined;

    // Gather context from the vault to ground the AI
    const recipes = getAllRecipes();
    const vaultContext = recipes
      .map(r => `Recipe: ${r.frontmatter.title}\nTags: ${r.frontmatter.tags?.join(', ')}\nMacros: ${JSON.stringify(r.frontmatter.macros)}`)
      .join('\n\n');

    const stream = streamSage(prompt, vaultContext, false, image, clientApiKey);

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
