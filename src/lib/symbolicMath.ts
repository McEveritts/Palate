/**
 * 🌿 Palate - Symbolic Math Engine
 * Precise scale module using fractional mathematics to scale recipe quantities
 * without floating-point drift. Standardizes to culinary conventions (Imperial fractions vs Metric decimals).
 */

export class Fraction {
  numerator: number;
  denominator: number;

  constructor(num: number, den: number) {
    if (den === 0) {
      throw new Error("Denominator cannot be zero.");
    }

    // Convert decimal numbers to precise integers
    if (!Number.isInteger(num) || !Number.isInteger(den)) {
      const numDec = Fraction.getDecimalPlaces(num);
      const denDec = Fraction.getDecimalPlaces(den);
      const maxDec = Math.max(numDec, denDec);
      const factor = Math.pow(10, maxDec);
      
      num = Math.round(num * factor);
      den = Math.round(den * factor);
    }

    const gcd = Fraction.gcd(Math.abs(num), Math.abs(den));
    const sign = (num < 0 ? -1 : 1) * (den < 0 ? -1 : 1);

    this.numerator = (sign * Math.abs(num)) / gcd;
    this.denominator = Math.abs(den) / gcd;
  }

  static getDecimalPlaces(val: number): number {
    const s = String(val);
    const dot = s.indexOf('.');
    return dot === -1 ? 0 : s.length - dot - 1;
  }

  static gcd(a: number, b: number): number {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) {
      const t = b;
      b = a % b;
      a = t;
    }
    return a;
  }

  add(other: Fraction): Fraction {
    return new Fraction(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator
    );
  }

  mul(other: Fraction): Fraction {
    return new Fraction(
      this.numerator * other.numerator,
      this.denominator * other.denominator
    );
  }

  div(other: Fraction): Fraction {
    return new Fraction(
      this.numerator * other.denominator,
      this.denominator * other.numerator
    );
  }

  toNumber(): number {
    return this.numerator / this.denominator;
  }

  toString(): string {
    return this.denominator === 1 ? String(this.numerator) : `${this.numerator}/${this.denominator}`;
  }
}

/**
 * Maps unicode culinary fractions to clean ascii spaced equivalents.
 * e.g., "1½" -> "1 1/2"
 */
export function normalizeUnicodeFractions(str: string): string {
  const map: Record<string, string> = {
    '½': ' 1/2',
    '¼': ' 1/4',
    '¾': ' 3/4',
    '⅓': ' 1/3',
    '⅔': ' 2/3',
    '⅛': ' 1/8',
    '⅜': ' 3/8',
    '⅝': ' 5/8',
    '⅞': ' 7/8'
  };

  let result = str;
  for (const [uni, ascii] of Object.entries(map)) {
    result = result.replace(new RegExp(uni, 'g'), ascii);
  }
  
  // Collapse duplicate spaces and trim
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Parses a fractional, decimal, or integer numeric string into a Fraction.
 */
export function parseFraction(str: string): Fraction | null {
  const cleanStr = normalizeUnicodeFractions(str.trim());

  // 1. Mixed number: e.g. "1 1/2" or "2-3/4"
  const mixedMatch = cleanStr.match(/^(\d+)[-\s]+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num = parseInt(mixedMatch[2], 10);
    const den = parseInt(mixedMatch[3], 10);
    return new Fraction(whole * den + num, den);
  }

  // 2. Simple fraction: e.g. "3/4"
  const fracMatch = cleanStr.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
    return new Fraction(num, den);
  }

  // 3. Decimal number: e.g. "2.5" or "0.75"
  const decimalMatch = cleanStr.match(/^(-?\d*\.\d+)$/);
  if (decimalMatch) {
    const val = parseFloat(decimalMatch[1]);
    const decPlaces = Fraction.getDecimalPlaces(val);
    const factor = Math.pow(10, decPlaces);
    return new Fraction(Math.round(val * factor), factor);
  }

  // 4. Whole number: e.g. "5"
  const wholeMatch = cleanStr.match(/^(-?\d+)$/);
  if (wholeMatch) {
    return new Fraction(parseInt(wholeMatch[1], 10), 1);
  }

  return null;
}

/**
 * Formats a fraction to standard culinary notation.
 * Decides between Metric decimal representation and Imperial reduced fractions.
 */
export function formatFraction(fraction: Fraction, suffix: string, originalWasDecimal: boolean): string {
  const num = fraction.numerator;
  const den = fraction.denominator;

  if (num === 0) return '0';

  // Check for Metric units
  const METRIC_UNITS = /\b(g|gram|grams|ml|milliliter|milliliters|l|liter|liters|kg|kilogram|kilograms)\b/i;
  const isMetric = METRIC_UNITS.test(suffix);

  // We choose decimal if:
  // - Original was input as decimal
  // - Suffix is a Metric unit
  // - Denominator is not a typical cooking denominator (2, 3, 4, 6, 8, 16)
  const standardDenominators = [1, 2, 3, 4, 6, 8, 16];
  const useDecimal = originalWasDecimal || isMetric || !standardDenominators.includes(den);

  if (useDecimal) {
    const val = fraction.toNumber();
    // Round to 3 decimal places to avoid standard JS float inaccuracies
    const rounded = Math.round(val * 1000) / 1000;
    return String(rounded);
  }

  // Fractional output
  if (den === 1) {
    return String(num);
  }

  const whole = Math.floor(num / den);
  const rem = num % den;

  if (whole > 0) {
    return `${whole} ${rem}/${den}`;
  } else {
    return `${rem}/${den}`;
  }
}

/**
 * Scales an ingredient quantity string (e.g. "1 1/2 cups", "3 cloves") by a planned yield
 * while avoiding precision drift and returning human-friendly culinary formats.
 */
export function scaleQuantity(quantityStr: string, plannedYield: number | string): string {
  if (!quantityStr) return '';

  const normalizedStr = normalizeUnicodeFractions(quantityStr.trim());

  // Parse yield multiplier into precise fraction
  let yieldFrac: Fraction | null = null;
  if (typeof plannedYield === 'number') {
    const decPlaces = Fraction.getDecimalPlaces(plannedYield);
    const factor = Math.pow(10, decPlaces);
    yieldFrac = new Fraction(Math.round(plannedYield * factor), factor);
  } else {
    yieldFrac = parseFraction(plannedYield);
  }

  if (!yieldFrac) {
    throw new Error(`Invalid planned yield: ${plannedYield}`);
  }

  // Regex patterns to identify leading quantity formats
  const mixedRegex = /^(\d+)[-\s]+(\d+)\/(\d+)/;
  const fracRegex = /^(\d+)\/(\d+)/;
  const decRegex = /^(\d*\.\d+)/;
  const wholeRegex = /^(\d+)/;

  let quantityFrac: Fraction | null = null;
  let prefixLength = 0;
  let originalWasDecimal = false;

  const mixedMatch = normalizedStr.match(mixedRegex);
  const fracMatch = normalizedStr.match(fracRegex);
  const decMatch = normalizedStr.match(decRegex);
  const wholeMatch = normalizedStr.match(wholeRegex);

  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num = parseInt(mixedMatch[2], 10);
    const den = parseInt(mixedMatch[3], 10);
    quantityFrac = new Fraction(whole * den + num, den);
    prefixLength = mixedMatch[0].length;
  } else if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
    quantityFrac = new Fraction(num, den);
    prefixLength = fracMatch[0].length;
  } else if (decMatch) {
    const val = parseFloat(decMatch[1]);
    const decPlaces = Fraction.getDecimalPlaces(val);
    const factor = Math.pow(10, decPlaces);
    quantityFrac = new Fraction(Math.round(val * factor), factor);
    prefixLength = decMatch[0].length;
    originalWasDecimal = true;
  } else if (wholeMatch) {
    quantityFrac = new Fraction(parseInt(wholeMatch[1], 10), 1);
    prefixLength = wholeMatch[0].length;
  }

  // If no numerical prefix matches (e.g. "salt and pepper to taste"), return original intact
  if (!quantityFrac) {
    return quantityStr;
  }

  // Segment suffix (units and descriptive details)
  const suffix = normalizedStr.substring(prefixLength);

  // Execute precise scale operation
  const scaledFrac = quantityFrac.mul(yieldFrac);

  // Format back based on unit conventions
  const formattedNum = formatFraction(scaledFrac, suffix, originalWasDecimal);

  return `${formattedNum}${suffix}`;
}
