import { describe, it, expect, vi } from 'vitest';
import { POST } from '../../../../src/app/api/sage/zero-waste/route';

vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: class {
      getGenerativeModel() {
        return {
          generateContentStream: vi.fn().mockResolvedValue([{ text: () => 'mock chunk 1' }, { text: () => 'mock chunk 2' }]),
        };
      }
    },
  };
});

describe('Zero Waste API', () => {
  it('returns a stream response', async () => {
    const req = new Request('http://localhost/api/sage/zero-waste', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'I have 3 eggs and old spinach.' })
    });
    const res = await POST(req);
    expect(res).toBeDefined();
    expect(res.body).toBeInstanceOf(ReadableStream);
  });
});
