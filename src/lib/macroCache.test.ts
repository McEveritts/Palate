import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MacroCache } from './macroCache';
import fs from 'fs';

// Mock fs to simulate reading from disk without actual files
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
  }
}));

describe('MacroCache', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should load data from disk on first call (Cache Miss)', () => {
    const cache = new MacroCache(1000); // 1 second TTL
    
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readdirSync as any).mockReturnValue(['test.md']);
    (fs.readFileSync as any).mockReturnValue('| Apple | 52 | 0.3 | 14 | 0.2 |');
    
    const result = cache.get('/fake/dir');
    
    expect(fs.existsSync).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0].ingredient_matched).toBe('Apple');
  });

  it('should return cached data on subsequent calls within TTL (Cache Hit)', () => {
    const cache = new MacroCache(1000); 
    
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readdirSync as any).mockReturnValue(['test.md']);
    (fs.readFileSync as any).mockReturnValue('| Apple | 52 | 0.3 | 14 | 0.2 |');
    
    cache.get('/fake/dir'); // first call
    const result = cache.get('/fake/dir'); // second call
    
    // readFileSync should still only have been called once
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
  });

  it('should load from disk again after TTL expires', () => {
    const cache = new MacroCache(1000); 
    
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readdirSync as any).mockReturnValue(['test.md']);
    (fs.readFileSync as any).mockReturnValue('| Apple | 52 | 0.3 | 14 | 0.2 |');
    
    cache.get('/fake/dir'); 
    
    vi.advanceTimersByTime(1001); // Advance time past TTL
    
    cache.get('/fake/dir'); 
    
    // readFileSync should have been called twice now
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
  });

  it('should explicitly invalidate cache', () => {
    const cache = new MacroCache(1000); 
    
    (fs.existsSync as any).mockReturnValue(true);
    (fs.readdirSync as any).mockReturnValue(['test.md']);
    (fs.readFileSync as any).mockReturnValue('| Apple | 52 | 0.3 | 14 | 0.2 |');
    
    cache.get('/fake/dir'); 
    cache.invalidate();
    cache.get('/fake/dir'); 
    
    // readFileSync should have been called twice because of invalidation
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
  });
});
