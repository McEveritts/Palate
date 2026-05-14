import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

export async function POST(req: Request) {
  const { prompt } = await req.json();
  const model = genAI.getGenerativeModel({ model: "gemma-4-31b-it" });

  const systemPrompt = `You are a Zero-Waste Culinary Specialist.
The user will provide a list of random ingredients. 
Your goal is to synthesize a cohesive, delicious recipe that uses these specific ingredients to prevent food waste.
Always wrap your reasoning in <thought> tags before answering. Output the final recipe in Palate's standard Markdown format with YAML frontmatter.`;

  const stream = await model.generateContentStream([
    { text: systemPrompt },
    { text: prompt }
  ]);

  const readableStream = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        controller.enqueue(new TextEncoder().encode(chunk.text()));
      }
      controller.close();
    }
  });

  return new Response(readableStream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
