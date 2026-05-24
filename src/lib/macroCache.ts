import fs from 'fs';
import path from 'path';

export interface MacroData {
  ingredient_matched: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber?: string;
  sugar?: string;
  sodium?: string;
  common_portions?: string;
}

export class MacroCache {
  private data: MacroData[] | null = null;
  private lastFetched: number = 0;
  private ttlMs: number;

  constructor(ttlMs: number = 1000 * 60 * 60) { // Default 1 hour
    this.ttlMs = ttlMs;
  }

  public get(macrosDir: string): MacroData[] {
    const now = Date.now();
    if (this.data && (now - this.lastFetched < this.ttlMs)) {
      return this.data;
    }

    this.data = this.loadFromDisk(macrosDir);
    this.lastFetched = now;
    return this.data;
  }

  public invalidate(): void {
    this.data = null;
    this.lastFetched = 0;
  }

  private loadFromDisk(macrosDir: string): MacroData[] {
    const parsedData: MacroData[] = [];
    if (!fs.existsSync(macrosDir)) return parsedData;

    const files = fs.readdirSync(macrosDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const content = fs.readFileSync(path.join(macrosDir, file), 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        if (line.includes('|') && !line.includes('---') && !line.includes('Calories')) {
          const cells = line.split('|').map(c => c.trim()).filter(c => c);
          if (cells.length >= 5) {
            parsedData.push({
              ingredient_matched: cells[0],
              calories: cells[1].replace(/kcal$/i, '').trim(),
              protein: cells[2].replace(/g$/i, '').trim(),
              carbs: cells[3].replace(/g$/i, '').trim(),
              fat: cells[4].replace(/g$/i, '').trim(),
              fiber: cells[5] ? cells[5].replace(/g$/i, '').trim() : undefined,
              sugar: cells[6] ? cells[6].replace(/g$/i, '').trim() : undefined,
              sodium: cells[7] ? cells[7].replace(/mg$/i, '').trim() : undefined,
              common_portions: cells[8]?.trim()
            });
          }
        }
      }
    }
    return parsedData;
  }
}

export const globalMacroCache = new MacroCache();
