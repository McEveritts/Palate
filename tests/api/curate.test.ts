import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, GET } from '@/app/api/curate/route';
import fs from 'fs/promises';

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    rename: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined)
  }
}));

vi.mock('@/lib/household', () => ({
  getHouseholdId: vi.fn().mockResolvedValue(null)
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    recipe: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({})
    },
    $transaction: vi.fn().mockResolvedValue([])
  }
}));

const mockGenerateContent = vi.fn();
const mockGetServerSession = vi.fn();

vi.mock('next-auth/next', () => ({
  getServerSession: () => mockGetServerSession()
}));

vi.mock('@google/genai', async () => {
  return {
    ThinkingLevel: { HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW', MINIMAL: 'MINIMAL' },
    GoogleGenAI: class {
      models = {
        generateContent: (...args: any[]) => mockGenerateContent(...args)
      };
    }
  };
});

describe('POST /api/curate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-key";
    process.env.CRON_SECRET = "test-cron-secret";
    mockGetServerSession.mockResolvedValue({ user: { id: "test-user-id" } });
  });

  it('should successfully split recipes using standard delimiter', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: `
---
title: "Hero Main"
tags: ["main", "Curated By Sage"]
macros: "Calories: 500 | Protein: 30g | Carbs: 50g | Fat: 15g"
---
# 🥩 Hero Main 🥩
Hero description
|||RECIPE_SPLIT|||
---
title: "Side One"
tags: ["side", "Curated By Sage"]
macros: "Calories: 200 | Protein: 5g | Carbs: 20g | Fat: 5g"
---
# 🥗 Side One 🥗
Side description
|||RECIPE_SPLIT|||
---
title: "Side Two"
tags: ["side", "Curated By Sage"]
macros: "Calories: 150 | Protein: 3g | Carbs: 15g | Fat: 3g"
---
# 🍤 Side Two 🍤
Side description
`
    });

    const req = new Request('http://localhost/api/curate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-cron-secret' }
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toContain('generated 3 new curated recipes');
    expect(fs.writeFile).toHaveBeenCalledTimes(3);
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gemini-3.8-flash" })
    );
  });

  it('should fallback to frontmatter regex split if delimiter is missing', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: `
---
title: "Hero Main No Delimiter"
tags: ["main", "Curated By Sage"]
macros: "Calories: 500 | Protein: 30g | Carbs: 50g | Fat: 15g"
---
# 🥩 Hero Main No Delimiter 🥩
Hero description

---
title: "Side One No Delimiter"
tags: ["side", "Curated By Sage"]
macros: "Calories: 200 | Protein: 5g | Carbs: 20g | Fat: 5g"
---
# 🥗 Side One No Delimiter 🥗
Side description

---
title: "Side Two No Delimiter"
tags: ["side", "Curated By Sage"]
macros: "Calories: 150 | Protein: 3g | Carbs: 15g | Fat: 3g"
---
# 🍤 Side Two No Delimiter 🍤
Side description
`
    });

    const req = new Request('http://localhost/api/curate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-cron-secret' }
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toContain('generated 3 new curated recipes');
    expect(fs.writeFile).toHaveBeenCalledTimes(3);
  });

  it('should throw an error if fewer than 3 recipes are found', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: `
---
title: "Only One Recipe"
tags: ["main", "Curated By Sage"]
macros: "Calories: 500 | Protein: 30g | Carbs: 50g | Fat: 15g"
---
# 🥩 Only One Recipe 🥩
Hero description
`
    });

    const req = new Request('http://localhost/api/curate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-cron-secret' }
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe('An unexpected error occurred during curation.');
  });

  it('should fail curation with a GET request (405 Method Not Allowed)', async () => {
    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(405);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Method Not Allowed');
  });

  it('should strip preamble and thoughts from recipes', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: `
Some thoughts with separator --- inside it and preamble that should be stripped Yes.---
title: "Hero Main with Preamble"
tags: ["main", "Curated By Sage"]
macros: "Calories: 500 | Protein: 30g | Carbs: 50g | Fat: 15g"
---
# 🥩 Hero Main 🥩
Hero description
|||RECIPE_SPLIT|||
---
title: "Side One Clean"
tags: ["side", "Curated By Sage"]
macros: "Calories: 200 | Protein: 5g | Carbs: 20g | Fat: 5g"
---
# 🥗 Side One 🥗
Side description
|||RECIPE_SPLIT|||
Some side thoughts before the side
---
title: "Side Two Clean"
tags: ["side", "Curated By Sage"]
macros: "Calories: 150 | Protein: 3g | Carbs: 15g | Fat: 3g"
---
# 🍤 Side Two 🍤
Side description
`
    });

    const req = new Request('http://localhost/api/curate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-cron-secret' }
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toContain('generated 3 new curated recipes');
    expect(fs.writeFile).toHaveBeenCalledTimes(3);
    
    // The first file saved should not contain the preamble
    const firstCallArgs = vi.mocked(fs.writeFile).mock.calls[0];
    expect(firstCallArgs[1]).not.toContain('Some thoughts and preamble here');
    expect((firstCallArgs[1] as string).startsWith('---')).toBe(true);

    // The third file saved should not contain the side thoughts
    const thirdCallArgs = vi.mocked(fs.writeFile).mock.calls[2];
    expect(thirdCallArgs[1]).not.toContain('Some side thoughts before the side');
    expect((thirdCallArgs[1] as string).startsWith('---')).toBe(true);
  });

  it('should reject unauthenticated request if CRON_SECRET is missing or empty', async () => {
    process.env.CRON_SECRET = "";

    const req = new Request('http://localhost/api/curate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer test-cron-secret' }
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Unauthorized');
  });

  it('should reject unauthenticated request without Authorization header', async () => {
    process.env.CRON_SECRET = "secret-cron";

    const req = new Request('http://localhost/api/curate', { method: 'POST' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Unauthorized');
  });

  it('should authorize request with correct Cron Bearer token without Origin header', async () => {
    process.env.CRON_SECRET = "secret-cron";
    mockGenerateContent.mockResolvedValueOnce({
      text: `
---
title: "Hero"
tags: ["main"]
macros: "Calories: 500"
---
# 🥩 Hero
|||RECIPE_SPLIT|||
---
title: "Side One"
tags: ["side"]
macros: "Calories: 200"
---
# 🥗 Side One
|||RECIPE_SPLIT|||
---
title: "Side Two"
tags: ["side"]
macros: "Calories: 150"
---
# 🍤 Side Two
`
    });

    const req = new Request('http://localhost/api/curate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer secret-cron' }
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
  });

  it('should reject request with incorrect Cron Bearer token', async () => {
    process.env.CRON_SECRET = "secret-cron";

    const req = new Request('http://localhost/api/curate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer wrong-cron' }
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Unauthorized');
  });

  it('should reject request with malformed Authorization header (missing Bearer prefix)', async () => {
    process.env.CRON_SECRET = "secret-cron";

    const req = new Request('http://localhost/api/curate', {
      method: 'POST',
      headers: { 'Authorization': 'secret-cron' }
    });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Unauthorized');
  });
});
