import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../../../../src/app/api/sage/zero-waste/route';

vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: class {
      getGenerativeModel() {
        return {
          generateContentStream: vi.fn().mockResolvedValue({
            stream: [{ text: () => 'mock chunk 1' }, { text: () => 'mock chunk 2' }]
          }),
        };
      }
    },
  };
});

describe('Zero Waste API', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
  });

  it('returns a stream response', async () => {
    const req = new Request('http://localhost/api/sage/zero-waste', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'I have 3 eggs and old spinach.' })
    });
    const res = await POST(req);
    expect(res).toBeDefined();
    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(ReadableStream);
  });

  it('returns 400 for missing prompt', async () => {
    const req = new Request('http://localhost/api/sage/zero-waste', {
      method: 'POST',
      body: JSON.stringify({})
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON', async () => {
    const req = new Request('http://localhost/api/sage/zero-waste', {
      method: 'POST',
      body: 'invalid-json'
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 500 when API key is missing', async () => {
    process.env.GEMINI_API_KEY = "";
    const req = new Request('http://localhost/api/sage/zero-waste', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'test' })
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
