import { describe, it, expect } from 'vitest';
import { parseSageStream } from './parser';

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
});
