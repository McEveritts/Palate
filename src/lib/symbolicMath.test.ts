import { describe, it, expect } from 'vitest';
import { Fraction, parseFraction, normalizeUnicodeFractions, scaleQuantity } from './symbolicMath';

describe('🌿 symbolicMath - Fraction Math Class', () => {
  it('should simplify fractions automatically', () => {
    const f = new Fraction(4, 8);
    expect(f.numerator).toBe(1);
    expect(f.denominator).toBe(2);
  });

  it('should handle decimals in constructor precisely', () => {
    const f = new Fraction(2.5, 1);
    expect(f.numerator).toBe(5);
    expect(f.denominator).toBe(2);
  });

  it('should multiply fractions exactly without floating point drift', () => {
    const f1 = new Fraction(1, 3);
    const f2 = new Fraction(3, 4);
    const result = f1.mul(f2);
    expect(result.numerator).toBe(1);
    expect(result.denominator).toBe(4);
  });
});

describe('🌿 symbolicMath - normalizeUnicodeFractions', () => {
  it('should replace unicode fractions with ascii equivalents', () => {
    expect(normalizeUnicodeFractions('1½ cups')).toBe('1 1/2 cups');
    expect(normalizeUnicodeFractions('¾ tsp')).toBe('3/4 tsp');
  });
});

describe('🌿 symbolicMath - parseFraction', () => {
  it('should parse integers, decimals, simple fractions, and mixed numbers', () => {
    const pInt = parseFraction('4');
    expect(pInt?.numerator).toBe(4);
    expect(pInt?.denominator).toBe(1);

    const pDec = parseFraction('2.5');
    expect(pDec?.numerator).toBe(5);
    expect(pDec?.denominator).toBe(2);

    const pFrac = parseFraction('3/4');
    expect(pFrac?.numerator).toBe(3);
    expect(pFrac?.denominator).toBe(4);

    const pMixed = parseFraction('1 1/2');
    expect(pMixed?.numerator).toBe(3);
    expect(pMixed?.denominator).toBe(2);
  });
});

describe('🌿 symbolicMath - scaleQuantity', () => {
  it('should scale Imperial fractions cleanly', () => {
    // 1 1/2 scaled by 0.5 (half portion)
    // 3/2 * 1/2 = 3/4
    expect(scaleQuantity('1 1/2 cups', 0.5)).toBe('3/4 cups');

    // 3/4 scaled by 2 (double portion)
    // 3/4 * 2 = 6/4 = 3/2 = 1 1/2
    expect(scaleQuantity('3/4 tsp', 2)).toBe('1 1/2 tsp');
  });

  it('should scale Metric decimals cleanly', () => {
    // 2.5 g scaled by 1.5
    // 2.5 * 1.5 = 3.75
    expect(scaleQuantity('2.5 g', 1.5)).toBe('3.75 g');

    // 250 ml scaled by 0.5
    // 250 * 0.5 = 125
    expect(scaleQuantity('250 ml', 0.5)).toBe('125 ml');
  });

  it('should format to decimals when denominator is non-standard', () => {
    // 1 cup scaled by 0.7 (planned yield 7/10)
    // 1 * 7/10 = 7/10 = 0.7 (10 is not standard cooking denominator like 2,3,4,8,16)
    expect(scaleQuantity('1 cup', 0.7)).toBe('0.7 cup');
  });

  it('should preserve text quantities without leading numeric prefix', () => {
    expect(scaleQuantity('salt and pepper to taste', 2)).toBe('salt and pepper to taste');
  });

  it('should support fractional yields as input strings', () => {
    expect(scaleQuantity('3/4 tsp', '1/2')).toBe('3/8 tsp');
    expect(scaleQuantity('1 1/2 cups', '2/3')).toBe('1 cups');
  });
});
