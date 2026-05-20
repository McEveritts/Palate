import { describe, it, expect } from 'vitest';
import { parseSageStream, sanitizeRecipeContent, extractMacrosFromString } from './parser';

describe('parseSageStream', () => {
  it('should parse perfectly formed thought and content', () => {
    const input = `<thought>\nThis is a thought.\n</thought>\n---\nrecipe: 'Test'\n---\nHello world`;
    const { thoughts, content } = parseSageStream(input, true);
    expect(thoughts).toBe('This is a thought.');
    expect(content).toBe("---\nrecipe: 'Test'\n---\nHello world");
  });

  it('should hide streaming thought before closing tag', () => {
    const input = `<thought>\nThinking about things...`;
    const { thoughts, content } = parseSageStream(input, false);
    expect(thoughts).toBe('Thinking about things...');
    expect(content).toBe('');
  });

  it('should extract thoughts when missing closing tag but has markdown delimiter', () => {
    const input = `<thought>\nI forgot to close my tag.\n---\nrecipe: 'Test'\n---\nContent here`;
    const { thoughts, content } = parseSageStream(input, true);
    expect(thoughts).toBe('I forgot to close my tag.');
    expect(content).toBe("---\nrecipe: 'Test'\n---\nContent here");
  });

  it('should fallback correctly when model completely ignores thought tags but uses frontmatter', () => {
    const input = `I am ignoring the thought tags.\n---\nrecipe: 'Test'\n---\nContent`;
    const { thoughts, content } = parseSageStream(input, true);
    expect(thoughts).toBe('I am ignoring the thought tags.');
    expect(content).toBe("---\nrecipe: 'Test'\n---\nContent");
  });

  it('should handle completely normal text with no thoughts or delimiters', () => {
    const input = `Just a regular sentence without anything special.`;
    const { thoughts, content } = parseSageStream(input, true);
    expect(thoughts).toBe('');
    expect(content).toBe('Just a regular sentence without anything special.');
  });
  
  it('should handle streaming normal text with no delimiters', () => {
    const input = `Just a regular`;
    const { thoughts, content } = parseSageStream(input, false);
    // While streaming and NO delimiter and NO thought tags, the fallback parser assumes it is reasoning and hides it.
    expect(thoughts).toBe('Just a regular');
    expect(content).toBe('');
  });

  it('should handle multiple thought blocks', () => {
    const input = `<thought>\nFirst thought.\n</thought>\n<thought>\nSecond thought.\n</thought>\n---\nrecipe: 'Test'\n---`;
    const { thoughts, content } = parseSageStream(input, true);
    expect(thoughts).toContain('First thought.');
    expect(thoughts).toContain('Second thought.');
    expect(content).toBe("---\nrecipe: 'Test'\n---");
  });

  it('should fallback to content if stream is done and content is empty but thoughts exist', () => {
    // This happens if the model outputs an unclosed thought tag and no delimiters,
    // causing the parser to think the entire response is a thought.
    const input = `<thought>\nThis is just a response disguised as a thought because I forgot the closing tag.`;
    const { thoughts, content } = parseSageStream(input, true);
    
    // Safety net should kick in
    expect(thoughts).toBe('');
    expect(content).toBe('This is just a response disguised as a thought because I forgot the closing tag.');
  });
});

describe('sanitizeRecipeContent', () => {
  it('should cleanly strip thought tags and output clean frontmatter and markdown body', () => {
    const input = `<thought>\nI should make a good soup.\n</thought>\n---\ntitle: Tomato Soup\ntags: [warm, dinner]\n---\nSteps to make soup...`;
    
    const { data, content, fileContent } = sanitizeRecipeContent(input);
    expect(data.title).toBe('Tomato Soup');
    expect(data.tags).toEqual(['warm', 'dinner']);
    expect(content).toBe('Steps to make soup...');
    expect(fileContent).toContain('title: Tomato Soup');
    expect(fileContent).not.toContain('<thought>');
    expect(fileContent).not.toContain('I should make a good soup.');
  });

  it('should handle unclosed thought blocks and reconstruct the markdown cleanly', () => {
    const input = `<thought>\nThinking...\n---\ntitle: Lemon Salad\ntags: [salad]\n---\nSalad instructions...`;

    const { data, content, fileContent } = sanitizeRecipeContent(input);
    expect(data.title).toBe('Lemon Salad');
    expect(content).toBe('Salad instructions...');
    expect(fileContent).not.toContain('<thought>');
    expect(fileContent).not.toContain('Thinking...');
  });

  it('should strip markdown code block wrapping and parse frontmatter', () => {
    const input = `\`\`\`markdown\n---\ntitle: Baked Cod\n---\nEnjoy the cod.\n\`\`\``;

    const { data, content, fileContent } = sanitizeRecipeContent(input);
    expect(data.title).toBe('Baked Cod');
    expect(content).toBe('Enjoy the cod.');
    expect(fileContent).toContain('title: Baked Cod');
    expect(fileContent).not.toContain('```markdown');
  });

  it('should handle yaml code block frontmatter and convert to standard ---', () => {
    const input = `\`\`\`yaml\ntitle: Grilled Cheese\n\`\`\`\nMelt the cheese.`;

    const { data, content, fileContent } = sanitizeRecipeContent(input);
    expect(data.title).toBe('Grilled Cheese');
    expect(content).toBe('Melt the cheese.');
    expect(fileContent).toContain('title: Grilled Cheese');
    expect(fileContent).not.toContain('```yaml');
  });
});

describe('extractMacrosFromString', () => {
  it('should parse standard pipe-delimited macro headers', () => {
    const input = 'Calories: 350 | Protein: 24g | Carbs: 45g | Fat: 12g';
    const result = extractMacrosFromString(input);
    expect(result.calories).toBe(350);
    expect(result.protein).toBe(24);
    expect(result.carbs).toBe(45);
    expect(result.fat).toBe(12);
    expect(result.isEstimated).toBe(false);
  });

  it('should support case-insensitive and hyphenated structures', () => {
    const input = 'cal - 420 | PROTEIN - 30 | carbs - 50g | fat - 15g';
    const result = extractMacrosFromString(input);
    expect(result.calories).toBe(420);
    expect(result.protein).toBe(30);
    expect(result.carbs).toBe(50);
    expect(result.fat).toBe(15);
  });

  it('should support inverted unit formats', () => {
    const input = '350 Calories, 24g Protein, 45g Carbs, 12g Fat (Estimated)';
    const result = extractMacrosFromString(input);
    expect(result.calories).toBe(350);
    expect(result.protein).toBe(24);
    expect(result.carbs).toBe(45);
    expect(result.fat).toBe(12);
    expect(result.isEstimated).toBe(true);
  });

  it('should support sentence-based macro descriptions', () => {
    const input = 'This recipe has 24 grams of protein, 45 grams of carbohydrates, 12g of fat, and 350 kcal';
    const result = extractMacrosFromString(input);
    expect(result.calories).toBe(350);
    expect(result.protein).toBe(24);
    expect(result.carbs).toBe(45);
    expect(result.fat).toBe(12);
  });

  it('should gracefully handle empty or invalid strings', () => {
    const result = extractMacrosFromString('');
    expect(result.calories).toBe(0);
    expect(result.protein).toBe(0);
    expect(result.carbs).toBe(0);
    expect(result.fat).toBe(0);
    expect(result.isEstimated).toBe(false);
  });
});
