import matter from 'gray-matter';

export function parseSageStream(fullText: string, isDone: boolean): { thoughts: string, content: string } {
  let thoughts = "";
  let content = fullText;

  // Extract all properly closed <thought>...</thought> blocks
  const closedThoughtRegex = /<thought>\s*([\s\S]*?)\s*<\/thought>/ig;
  let match;
  while ((match = closedThoughtRegex.exec(fullText)) !== null) {
    if (thoughts) thoughts += "\n\n";
    thoughts += match[1].trim();
  }
  
  // Remove all closed thought blocks from content
  content = content.replace(/<thought>\s*([\s\S]*?)\s*<\/thought>/ig, "").trim();

  // Try to find an unclosed <thought> block in the remaining content
  const openThoughtMatch = content.match(/<thought>\s*([\s\S]*)$/i);
  if (openThoughtMatch) {
    const thoughtsText = openThoughtMatch[1];
    
    // Only aggressively split by delimiter if the stream is done.
    // While streaming, we assume everything after <thought> is part of the thought
    // until we explicitly see </thought>.
    if (isDone) {
      // Look for a delimiter that signifies the end of the thought and start of the real content
      const delimiterMatch = thoughtsText.match(/---|```yaml|^#\s/m);
      
      if (delimiterMatch) {
        if (thoughts) thoughts += "\n\n";
        thoughts += thoughtsText.substring(0, delimiterMatch.index!).trim();
        
        const beforeThought = content.substring(0, openThoughtMatch.index).trim();
        const afterDelimiter = thoughtsText.substring(delimiterMatch.index!).trim();
        
        content = beforeThought ? `${beforeThought}\n${afterDelimiter}` : afterDelimiter;
      } else {
        if (thoughts) thoughts += "\n\n";
        thoughts += thoughtsText.trim();
        content = content.substring(0, openThoughtMatch.index!).trim();
      }
    } else {
      // While streaming, everything inside an unclosed <thought> is a thought.
      if (thoughts) thoughts += "\n\n";
      thoughts += thoughtsText.trim();
      content = content.substring(0, openThoughtMatch.index!).trim();
    }
  } else if (!thoughts) {
    // Total fallback: Model completely ignored <thought> tags
    // We only do this if no thoughts were found at all to prevent
    // grabbing normal text when the model correctly used tags.
    const delimiterMatch = content.match(/---|```yaml|^#\s/m);
    
    if (delimiterMatch) {
      // A delimiter was found. Everything before it is rogue reasoning.
      let preamble = content.substring(0, delimiterMatch.index!).trim();
      // Clean up markdown block wrapping if it just wrapped the yaml
      preamble = preamble.replace(/^```(markdown|yaml)?\n?/, '').trim();
      
      if (preamble.length > 0) {
        thoughts = preamble;
      }
      // Content is everything from the delimiter onwards
      content = content.substring(delimiterMatch.index!).trim();
    } else {
      // No delimiter found yet.
      if (!isDone) {
        // While streaming, assume it's reasoning and hide it.
        thoughts = content.trim();
        content = "";
      } else {
        // Stream finished, no delimiter ever appeared. It's just a normal reply.
        thoughts = "";
        // content remains as is
      }
    }
  }

  const finalThoughts = thoughts.trim();
  const finalContent = content.trim();

  // Safety net: If the stream is completely done, and there is absolutely NO content,
  // but there ARE thoughts, it means the parser accidentally swallowed the entire
  // response because the model forgot the closing tag and formatting delimiters.
  // We must return the thoughts as content so the user sees the message.
  if (isDone && finalContent === "" && finalThoughts.length > 0) {
    return { thoughts: "", content: finalThoughts };
  }

  return { thoughts: finalThoughts, content: finalContent };
}

export function parseMessageContent(content: string) {
  let cleanContent = content.trim();
  if (cleanContent.startsWith('```markdown')) {
    cleanContent = cleanContent.replace(/^```markdown\n?/, '').replace(/\n?```$/, '').trim();
  }

  const match = cleanContent.match(/---\n([\s\S]*?)\n---/);
  if (!match) return { frontmatter: null, markdown: content };
  
  const yaml = match[1];
  const markdown = cleanContent.slice(match.index! + match[0].length).trim();
  
  const recipeMatch = yaml.match(/(?:recipe|title):\s*(.*)/i);
  const tagsMatch = yaml.match(/tags?:\s*\[?(.*?)\]?(?:\n|$)/i);
  const macrosMatch = yaml.match(/macros?:\s*(.*)/i);
  
  return {
    markdown,
    frontmatter: {
      recipe: recipeMatch ? recipeMatch[1].trim().replace(/^['"]|['"]$/g, '') : '',
      tags: tagsMatch ? tagsMatch[1].split(',').map((t: string) => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : [],
      macros: macrosMatch ? macrosMatch[1].trim() : ''
    }
  };
}

export interface ParsedMacros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  isEstimated: boolean;
}

export function extractMacrosFromString(macroStr: string): ParsedMacros {
  if (!macroStr) {
    return { calories: 0, protein: 0, carbs: 0, fat: 0, isEstimated: false };
  }

  // Support flexible, case-insensitive, fuzzy patterns:
  // e.g., "Protein: 24g", "24g Protein", "Protein - 24g", "24 grams of protein", etc.
  
  // 1. Calories Matcher
  const calMatch = 
    macroStr.match(/(?:calories?|cal|kcal):\s*([\d.]+)/i) || 
    macroStr.match(/([\d.]+)\s*(?:calories?|cal|kcal)/i) ||
    macroStr.match(/(?:calories?|cal|kcal)\s*-\s*([\d.]+)/i);

  // 2. Protein Matcher
  const proMatch = 
    macroStr.match(/protein:\s*([\d.]+)g?/i) || 
    macroStr.match(/([\d.]+)g?\s*protein/i) ||
    macroStr.match(/protein\s*-\s*([\d.]+)g?/i) ||
    macroStr.match(/([\d.]+)g?\s*of\s*protein/i) ||
    macroStr.match(/([\d.]+)\s*grams?\s*of\s*protein/i);

  // 3. Carbohydrates Matcher
  const carbMatch = 
    macroStr.match(/(?:carbs?|carbohydrates?):\s*([\d.]+)g?/i) || 
    macroStr.match(/([\d.]+)g?\s*(?:carbs?|carbohydrates?)/i) ||
    macroStr.match(/(?:carbs?|carbohydrates?)\s*-\s*([\d.]+)g?/i) ||
    macroStr.match(/([\d.]+)g?\s*of\s*(?:carbs?|carbohydrates?)/i) ||
    macroStr.match(/([\d.]+)\s*grams?\s*of\s*(?:carbs?|carbohydrates?)/i);

  // 4. Fat Matcher
  const fatMatch = 
    macroStr.match(/fat:\s*([\d.]+)g?/i) || 
    macroStr.match(/([\d.]+)g?\s*fat/i) ||
    macroStr.match(/fat\s*-\s*([\d.]+)g?/i) ||
    macroStr.match(/([\d.]+)g?\s*of\s*fat/i) ||
    macroStr.match(/([\d.]+)\s*grams?\s*of\s*fat/i);

  const calories = calMatch ? Math.round(parseFloat(calMatch[1])) : 0;
  const protein = proMatch ? Math.round(parseFloat(proMatch[1])) : 0;
  const carbs = carbMatch ? Math.round(parseFloat(carbMatch[1])) : 0;
  const fat = fatMatch ? Math.round(parseFloat(fatMatch[1])) : 0;
  const isEstimated = macroStr.toLowerCase().includes('estimated');

  return { calories, protein, carbs, fat, isEstimated };
}

export interface CleanedFrontmatter {
  title?: string;
  recipe?: string;
  tags?: string[] | string;
  macros?: unknown;
  time?: unknown;
  [key: string]: unknown;
}

export function sanitizeRecipeContent(rawContent: string): { data: CleanedFrontmatter; content: string; fileContent: string } {
  let cleaned = rawContent.trim();
  
  // 1. Strip outer code block wrappers from the raw content if they wrap the entire content
  if (cleaned.startsWith('```markdown')) {
    cleaned = cleaned.replace(/^```markdown\n?/, '').replace(/\n?```$/, '').trim();
  } else if (cleaned.startsWith('```yaml')) {
    // Note: don't strip if it's just the yaml frontmatter itself (handled in step 3),
    // but if it has a closing ``` at the end of the entire string, it's a wrapper.
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.replace(/^```yaml\n?/, '').replace(/\n?```$/, '').trim();
    }
  }

  // 2. Strip thoughts using parseSageStream
  let { content: contentWithoutThoughts } = parseSageStream(cleaned, true);
  contentWithoutThoughts = contentWithoutThoughts.trim();

  // 3. Strip code block wrappers again in case they were inside/after the thought block
  if (contentWithoutThoughts.startsWith('```markdown')) {
    contentWithoutThoughts = contentWithoutThoughts.replace(/^```markdown\n?/, '').replace(/\n?```$/, '').trim();
  }

  // 4. Handle frontmatter wrapped in ```yaml instead of ---
  if (contentWithoutThoughts.startsWith('```yaml')) {
    const firstLines = contentWithoutThoughts.split('\n');
    let closingIndex = -1;
    for (let i = 1; i < firstLines.length; i++) {
      if (firstLines[i].trim() === '```') {
        closingIndex = i;
        break;
      }
    }
    if (closingIndex !== -1) {
      firstLines[0] = '---';
      firstLines[closingIndex] = '---';
      contentWithoutThoughts = firstLines.join('\n');
    }
  }

  // Also handle cases where the file starts with `---` but has ```` at the end of frontmatter
  if (contentWithoutThoughts.startsWith('---')) {
    const lines = contentWithoutThoughts.split('\n');
    let closingIndex = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '```' || lines[i].trim() === '---') {
        closingIndex = i;
        break;
      }
    }
    if (closingIndex !== -1) {
      lines[closingIndex] = '---';
      contentWithoutThoughts = lines.join('\n');
    }
  }

  // Parse with gray-matter
  const { data, content: bodyContent } = matter(contentWithoutThoughts);

  // Reconstruct cleanly
  const reconstructed = matter.stringify(bodyContent.trim(), data).trim();

  return {
    data,
    content: bodyContent.trim(),
    fileContent: reconstructed
  };
}
