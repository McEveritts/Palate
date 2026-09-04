import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/sage/wellness/route';

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
  },
}));

vi.mock('@/lib/vaultParser', () => ({
  getVaultRecipes: vi.fn().mockResolvedValue([]),
  compileVaultContextString: vi.fn().mockReturnValue('Mock Vault Context'),
}));

const mockGenerateContentStream = vi.fn();

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  return {
    ...actual,
    GoogleGenAI: class {
      models = {
        generateContentStream: (...args: any[]) => mockGenerateContentStream(...args),
      };
    },
  };
});

const sampleTelemetry = {
  sessionFrequency: 5,
  sessionFrequencyStr: '5 sessions / 14 days',
  totalDuration: 240,
  totalCalories: 1800,
  cardioDuration: 120,
  strengthDuration: 120,
  cardioPct: 50,
  strengthPct: 50,
  trainingLoadScore: 78,
};

describe('Sage Wellness Route Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-wellness-key';
    mockGetServerSession.mockResolvedValue({ user: { id: 'test-user' } });
    mockGenerateContentStream.mockResolvedValue([
      {
        candidates: [
          {
            content: {
              parts: [{ thought: true, text: 'Analyzing training load and recovery.' }],
            },
          },
        ],
      },
      {
        candidates: [
          {
            content: {
              parts: [{ text: '### 🌿 Sage Recovery Analysis\nBalanced training load observed.' }],
            },
          },
        ],
      },
    ]);
  });

  it('returns 200 and streams response with contiguous thought demarcation', async () => {
    const req = new Request('http://localhost/api/sage/wellness', {
      method: 'POST',
      body: JSON.stringify({
        telemetry: sampleTelemetry,
        todayWorkout: 'High-Intensity Strength',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.body).toBeInstanceOf(ReadableStream);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }

    expect(text).toContain('<thought>\nAnalyzing training load and recovery.\n</thought>\n');
    expect(text).toContain('### 🌿 Sage Recovery Analysis');
    expect(mockGenerateContentStream).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-3.8-flash' })
    );
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/sage/wellness', {
      method: 'POST',
      body: 'invalid-json-content',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid JSON body');
  });

  it('returns 400 for missing telemetry fields', async () => {
    const req = new Request('http://localhost/api/sage/wellness', {
      method: 'POST',
      body: JSON.stringify({ telemetry: { sessionFrequency: 2 } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid request body');
  });

  it('returns 401 when user is unauthenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const req = new Request('http://localhost/api/sage/wellness', {
      method: 'POST',
      body: JSON.stringify({
        telemetry: sampleTelemetry,
        todayWorkout: 'High-Intensity Strength',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain('Unauthorized');
  });

  it('returns 500 when API key is missing', async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const req = new Request('http://localhost/api/sage/wellness', {
        method: 'POST',
        body: JSON.stringify({
          telemetry: sampleTelemetry,
          todayWorkout: 'High-Intensity Strength',
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain('Gemini API key is not configured');
    } finally {
      process.env.GEMINI_API_KEY = originalKey;
    }
  });
});
