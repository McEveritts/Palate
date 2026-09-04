import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/sage/route';

const mockGetServerSession = vi.fn();
vi.mock('next-auth/next', () => ({
  getServerSession: () => mockGetServerSession(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    userConfig: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    userProfile: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
    dailyLog: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    weightLog: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('@/lib/vaultParser', () => ({
  compileVaultContextString: vi.fn().mockResolvedValue('Mock Vault Context'),
  getVaultRecipes: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/vault', () => ({
  getAllRecipes: vi.fn().mockReturnValue([]),
}));

vi.mock('@/lib/patternAnalysis', () => ({
  analyzeDietaryPatterns: vi.fn().mockResolvedValue({}),
  buildProactiveContext: vi.fn().mockReturnValue(''),
}));

const mockSendMessageStream = vi.fn();

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: class {
      chats = {
        create: vi.fn().mockReturnValue({
          sendMessageStream: (...args: any[]) => mockSendMessageStream(...args),
        }),
      };
      models = {
        generateContent: vi.fn().mockResolvedValue({ text: 'mock text' }),
      };
    },
  };
});

describe('/api/sage Route Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-global-key';
    mockGetServerSession.mockResolvedValue({ user: { id: 'test-user-id' } });

    async function* defaultMockStream() {
      yield {
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello culinary enthusiast!' }],
            },
          },
        ],
      };
    }
    mockSendMessageStream.mockResolvedValue(defaultMockStream());
  });

  it('returns 400 for invalid request body (missing prompt)', async () => {
    const req = new Request('http://localhost/api/sage', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid request body');
  });

  it('returns 400 for unparseable JSON body', async () => {
    const req = new Request('http://localhost/api/sage', {
      method: 'POST',
      body: 'invalid json string',
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it('returns 401 when user is unauthenticated guest and no custom key is provided', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const req = new Request('http://localhost/api/sage', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'Create a salad' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('Guest users must provide their own Gemini API key');
  });

  it('returns 200 when user is unauthenticated guest but provides x-gemini-api-key header', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const req = new Request('http://localhost/api/sage', {
      method: 'POST',
      headers: {
        'x-gemini-api-key': 'user-custom-api-key',
      },
      body: JSON.stringify({ prompt: 'Create a salad' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.body).toBeInstanceOf(ReadableStream);
  });

  it('returns 200 and streams response for authenticated session', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'auth-user-123' } });
    const req = new Request('http://localhost/api/sage', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'Recommend a high-protein dinner',
        measurementSystem: 'imperial',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    expect(res.body).toBeInstanceOf(ReadableStream);

    // Consume the stream
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    expect(text).toContain('Hello culinary enthusiast!');
  });
});
