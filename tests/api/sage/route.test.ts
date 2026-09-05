import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/sage/route';

const mockGetServerSession = vi.fn();
const mockPersistSageToolLog = vi.hoisted(() => vi.fn());
vi.mock('next-auth/next', () => ({
  getServerSession: () => mockGetServerSession(),
}));

vi.mock('@/lib/sageLogPersistence', () => ({
  persistSageToolLog: mockPersistSageToolLog,
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
    mockGetServerSession.mockReset();
    mockPersistSageToolLog.mockReset();
    mockSendMessageStream.mockReset();
    process.env.GEMINI_API_KEY = 'test-global-key';
    mockGetServerSession.mockResolvedValue({ user: { id: 'test-user-id' } });
    mockPersistSageToolLog.mockResolvedValue({ entryId: 'persisted-entry-1' });

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
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid JSON body');
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

  it('accepts valid intent in request body and passes to streamSage', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'auth-user-123' } });
    const req = new Request('http://localhost/api/sage', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'log lunch: 200g chicken',
        intent: 'logging',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it('returns 400 when invalid intent is provided in request body', async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: { id: 'auth-user-123' } });
    const req = new Request('http://localhost/api/sage', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'log lunch',
        intent: 'invalid_intent_type',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid request body');
  });

  it('validates the local browser hour used for meal classification', async () => {
    const req = new Request('http://localhost/api/sage', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'Log lunch', localHour: 24 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('persists logging tools on the server before emitting a success marker', async () => {
    async function* toolTurn() {
      yield {
        candidates: [{
          content: {
            parts: [{ functionCall: { id: 'h1', name: 'log_hydration', args: { amount_ml: 500 } } }],
          },
        }],
      };
    }
    async function* responseTurn() {
      yield { candidates: [{ content: { parts: [{ text: 'Hydration saved.' }] } }] };
    }
    mockSendMessageStream
      .mockResolvedValueOnce(toolTurn())
      .mockResolvedValueOnce(responseTurn());

    const req = new Request('http://localhost/api/sage', {
      method: 'POST',
      headers: { 'x-sage-persistence': 'server-v1' },
      body: JSON.stringify({ prompt: 'I drank 500ml water', localHour: 9 }),
    });
    const res = await POST(req);
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(mockPersistSageToolLog).toHaveBeenCalledWith(
      'test-user-id',
      'log_hydration',
      expect.objectContaining({ amount_ml: 500 }),
      { localHour: 9 },
    );
    expect(text).toContain('___TOOL_CALL_LOG_HYDRATION___');
    expect(text).toContain('"persisted":true');
  });
});
