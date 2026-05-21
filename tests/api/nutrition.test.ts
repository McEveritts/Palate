import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '@/app/api/nutrition/route';
import { globalMacroCache } from '@/lib/macroCache';
import fs from 'fs/promises';

vi.mock('@/lib/macroCache', () => ({
  globalMacroCache: {
    get: vi.fn(),
    invalidate: vi.fn()
  }
}));

vi.mock('fs/promises', () => ({
  default: {
    access: vi.fn(),
    writeFile: vi.fn(),
    appendFile: vi.fn(),
    readFile: vi.fn()
  }
}));

vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: class {
      getGenerativeModel() {
        return {
          generateContent: vi.fn().mockResolvedValue({
            response: {
              text: () => '{"calories": 57, "protein": 0.74, "carbs": 14.49, "fat": 0.33}'
            }
          })
        };
      }
    }
  };
});

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('GET /api/nutrition', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should return error if ingredient query is missing', async () => {
    const req = new Request('http://localhost/api/nutrition');
    const res = await GET(req);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Ingredient query parameter is required');
  });

  it('should return macro from local cache if found', async () => {
    const mockCacheData = [
      { ingredient_matched: 'Granulated Sugar', calories: '385', protein: '0.0', carbs: '99.6', fat: '0.3' }
    ];
    vi.mocked(globalMacroCache.get).mockReturnValue(mockCacheData as any);

    const req = new Request('http://localhost/api/nutrition?ingredient=sugar');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.source).toBe('local_cache');
    expect(json.data.ingredient_matched).toBe('Granulated Sugar');
  });

  it('should fallback to USDA API on cache miss and write to local macros', async () => {
    vi.mocked(globalMacroCache.get).mockReturnValue([]);
    
    // Mock USDA Response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        foods: [
          {
            description: 'RAW BLUEBERRIES',
            foodNutrients: [
              { nutrientId: 1008, nutrientName: 'Energy', value: 57 },
              { nutrientId: 1003, nutrientName: 'Protein', value: 0.74 },
              { nutrientId: 1005, nutrientName: 'Carbohydrate, by difference', value: 14.49 },
              { nutrientId: 1004, nutrientName: 'Total lipid (fat)', value: 0.33 }
            ]
          }
        ]
      })
    });

    // Mock fs write
    vi.mocked(fs.access).mockRejectedValueOnce(new Error('not exists'));
    vi.mocked(fs.writeFile).mockResolvedValueOnce();

    const req = new Request('http://localhost/api/nutrition?ingredient=blueberries');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.source).toBe('usda_api');
    expect(json.data.ingredient_matched).toBe('Raw Blueberries');
    expect(json.data.calories).toBe('57');
    expect(json.data.protein).toBe('0.74');
    expect(json.data.carbs).toBe('14.49');
    expect(json.data.fat).toBe('0.33');

    expect(fs.writeFile).toHaveBeenCalled();
    expect(globalMacroCache.invalidate).toHaveBeenCalled();
  });

  it('should fallback to Gemma AI when USDA API fails or rate-limits', async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.mocked(globalMacroCache.get).mockReturnValue([]);
    
    // Simulate USDA failing with 429
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429
    });

    // Mock fs write
    vi.mocked(fs.access).mockRejectedValueOnce(new Error('not exists'));
    vi.mocked(fs.writeFile).mockResolvedValueOnce();

    const req = new Request('http://localhost/api/nutrition?ingredient=blueberries');
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.source).toBe('ai_fallback');
    expect(json.data.ingredient_matched).toBe('blueberries (AI Estimated)');
    expect(json.data.calories).toBe('57');
    expect(json.data.protein).toBe('0.74');
    expect(json.data.carbs).toBe('14.49');
    expect(json.data.fat).toBe('0.33');

    expect(fs.writeFile).toHaveBeenCalled();
    expect(globalMacroCache.invalidate).toHaveBeenCalled();
  });
});
