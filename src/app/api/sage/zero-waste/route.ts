import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: Request) {
  const clientApiKey = req.headers.get("x-gemini-api-key") || undefined;
  const apiKey = clientApiKey || process.env.GEMINI_API_KEY || "";

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Internal Server Error: API key is not configured." }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  let body;
  try {
    body = await req.json();
  } catch (error) {
    return new Response(JSON.stringify({ error: "Bad Request: Invalid JSON body." }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { prompt, image } = body;

  if (!prompt && !image) {
    return new Response(JSON.stringify({ error: "Bad Request: 'prompt' or 'image' is required." }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const systemInstruction = `You are a Zero-Waste Culinary Specialist.
The user will provide a list of random ingredients, or an image of ingredients in their fridge.
Your goal is to synthesize a cohesive, delicious recipe that uses these specific ingredients to prevent food waste.
Always wrap your reasoning in <thought> tags before answering. Output the final recipe in Palate's standard Markdown format with YAML frontmatter.`;

    const model = genAI.getGenerativeModel({
      model: "gemma-4-31b-it",
      systemInstruction
    });

    const promptParts: any[] = [];
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

    const result = await model.generateContentStream(promptParts);

    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            controller.enqueue(new TextEncoder().encode(chunk.text()));
          }
          controller.close();
        } catch (streamError) {
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
