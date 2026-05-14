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
  
  const recipeMatch = yaml.match(/(?:recipe|title):\s*(.*)/);
  const tagsMatch = yaml.match(/tags:\s*\[?(.*?)\]?(?:\n|$)/);
  const macrosMatch = yaml.match(/macros:\s*(.*)/);
  
  return {
    markdown,
    frontmatter: {
      recipe: recipeMatch ? recipeMatch[1].trim().replace(/^['"]|['"]$/g, '') : '',
      tags: tagsMatch ? tagsMatch[1].split(',').map((t: string) => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : [],
      macros: macrosMatch ? macrosMatch[1].trim() : ''
    }
  };
}
