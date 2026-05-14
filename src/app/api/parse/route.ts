import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, Part } from '@google/generative-ai';

const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

export async function POST(req: Request) {
  try {
    const { input, image } = await req.json();

    if ((!input || typeof input !== 'string') && !image) {
      return NextResponse.json({ success: false, error: 'Input text or an image is required' }, { status: 400 });
    }

    let textToParse = input || "Extract recipe from the provided image.";

    // Check if input is a URL
    if (input && (input.trim().startsWith('http://') || input.trim().startsWith('https://'))) {
      try {
        const response = await fetch(input.trim());
        if (!response.ok) {
          throw new Error(`Failed to fetch URL: ${response.statusText}`);
        }
        textToParse = await response.text();
      } catch (err: any) {
        console.error("Failed to fetch URL", err);
        return NextResponse.json({ success: false, error: 'Failed to fetch the URL. Ensure it is accessible or paste the raw text instead.' }, { status: 400 });
      }
    }

    const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

    const extractionPrompt = `
You are an expert culinary AI for 'Palate', a local-first recipe application.
Your task is to extract a recipe from the provided text, raw HTML, or image, and format it strictly according to Palate's Markdown standards.

[EXTRACTION RULES]
1. Ignore all blog narratives, advertisements, comments, and life stories.
2. Extract only the ingredients, measurements, and instructions.

[FORMATTING RULES]
1. The output MUST be standard Markdown.
2. You MUST include YAML frontmatter at the very top with the following keys:
   - recipe: "Title of the Recipe"
   - tags: ["tag1", "tag2"]
   - macros: "Calories: X | Protein: Xg | Carbs: Xg | Fat: Xg" (If unknown, estimate and add "(Estimated)")
3. Use emojis in headers and key ingredients (e.g., # 🥗 Salad).
4. Use Roman numerals (I, II, III) for instruction steps to match MasterChef detail.
5. Include explicit inline callouts like "Crucial Step:" or "Technique Note:" within the steps.
6. The final section MUST be titled "💡 Chef's Additions & Troubleshooting" with 2-3 bullet points of advanced technical advice.

[CATEGORIZATION RULE]
At the very end of your response, after all the markdown, you MUST include exactly one of the following category strings:
[CATEGORY: main]
or
[CATEGORY: side]
Choose the most appropriate category based on the dish.

[INPUT TO PARSE]
${textToParse}
`;

    const promptParts: Part[] = [];
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
    promptParts.push({ text: extractionPrompt });

    const result = await model.generateContent(promptParts);
    const generatedText = result.response.text();

    // Extract the category block
    const categoryMatch = generatedText.match(/\[CATEGORY:\s*(main|side)\]/i);
    const category = categoryMatch ? categoryMatch[1].toLowerCase() : 'mains';

    // Remove the category block from the markdown output
    const cleanMarkdown = generatedText.replace(/\[CATEGORY:\s*(main|side)\]/gi, '').trim();
    
    // Extract title from YAML
    const titleMatch = cleanMarkdown.match(/(?:recipe|title):\s*['"]?(.*?)['"]?(?:\n|$)/);
    const title = titleMatch ? titleMatch[1].trim() : "Extracted Recipe";

    return NextResponse.json({ 
      success: true, 
      markdown: cleanMarkdown, 
      category: category === 'side' ? 'sides' : 'mains',
      title: title
    });

  } catch (error: any) {
    console.error("Parse API Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Unknown error" }, { status: 500 });
  }
}