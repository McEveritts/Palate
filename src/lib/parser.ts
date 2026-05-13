export function parseSageStream(fullText: string, isDone: boolean): { thoughts: string, content: string } {
  let thoughts = "";
  let content = fullText;

  // Try to find a properly closed <thought>...</thought> block
  const closedThoughtMatch = fullText.match(/<thought>\s*([\s\S]*?)\s*<\/thought>/i);
  if (closedThoughtMatch) {
    thoughts = closedThoughtMatch[1].trim();
    content = fullText.replace(closedThoughtMatch[0], "").trim();
    return { thoughts, content };
  }

  // Try to find an unclosed <thought> block
  const openThoughtMatch = fullText.match(/<thought>\s*([\s\S]*)$/i);
  if (openThoughtMatch) {
    const thoughtsText = openThoughtMatch[1];
    
    // Look for a delimiter that signifies the end of the thought and start of the real content
    const delimiterMatch = thoughtsText.match(/---|```yaml|^#\s/m);
    
    if (delimiterMatch) {
      thoughts = thoughtsText.substring(0, delimiterMatch.index!).trim();
      
      const beforeThought = fullText.substring(0, openThoughtMatch.index).trim();
      const afterDelimiter = thoughtsText.substring(delimiterMatch.index!).trim();
      
      content = beforeThought ? `${beforeThought}\n${afterDelimiter}` : afterDelimiter;
    } else {
      thoughts = thoughtsText.trim();
      content = fullText.substring(0, openThoughtMatch.index!).trim();
    }
    return { thoughts, content };
  }

  // Total fallback: Model completely ignored <thought> tags
  const delimiterMatch = fullText.match(/---|```yaml|^#\s/m);
  
  if (delimiterMatch) {
    // A delimiter was found. Everything before it is rogue reasoning.
    let preamble = fullText.substring(0, delimiterMatch.index!).trim();
    // Clean up markdown block wrapping if it just wrapped the yaml
    preamble = preamble.replace(/^```(markdown|yaml)?\n?/, '').trim();
    
    if (preamble.length > 0) {
      thoughts = preamble;
    }
    // Content is everything from the delimiter onwards
    content = fullText.substring(delimiterMatch.index!).trim();
  } else {
    // No delimiter found yet.
    if (!isDone) {
      // While streaming, assume it's reasoning and hide it.
      thoughts = fullText.trim();
      content = "";
    } else {
      // Stream finished, no delimiter ever appeared. It's just a normal reply.
      thoughts = "";
      content = fullText.trim();
    }
  }

  return { thoughts, content };
}
