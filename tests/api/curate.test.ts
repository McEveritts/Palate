import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/curate/route';
import fs from 'fs/promises';

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    rename: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined)
  }
}));

const mockGenerateContent = vi.fn();

vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: class {
      getGenerativeModel() {
        return {
          generateContent: mockGenerateContent
        };
      }
    }
  };
});

describe('POST /api/curate', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.GEMINI_API_KEY = "test-key";
  });

  it('should successfully split recipes using standard delimiter', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => `
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
      }
    });

    const req = new Request('http://localhost/api/curate', { method: 'POST' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toContain('generated 3 new curated recipes');
    expect(fs.writeFile).toHaveBeenCalledTimes(3);
  });

  it('should fallback to frontmatter regex split if delimiter is missing', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => `
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
      }
    });

    const req = new Request('http://localhost/api/curate', { method: 'POST' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.message).toContain('generated 3 new curated recipes');
    expect(fs.writeFile).toHaveBeenCalledTimes(3);
  });

  it('should throw an error if fewer than 3 recipes are found', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => `
---
title: "Only One Recipe"
tags: ["main", "Curated By Sage"]
macros: "Calories: 500 | Protein: 30g | Carbs: 50g | Fat: 15g"
---
# 🥩 Only One Recipe 🥩
Hero description
`
      }
    });

    const req = new Request('http://localhost/api/curate', { method: 'POST' });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe('An unexpected error occurred during curation.');
  });
});
