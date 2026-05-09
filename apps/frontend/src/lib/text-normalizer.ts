import type { NormalizationResult } from '../types';

const ONES = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
];
const TEENS = [
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = [
  '',
  '',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
];

/**
 * Normalizes text for IPA transcription.
 * Splits on whitespace, strips punctuation, lowercases, and expands numerals.
 */
export function normalize(text: string): NormalizationResult {
  if (!text) {
    return { normalizedWords: [], sourceIndices: [] };
  }

  const originalWords = text.split(/\s+/);
  const normalizedWords: string[] = [];
  const sourceIndices: number[] = [];

  originalWords.forEach((word, index) => {
    if (!word) return;

    // Strip leading/trailing punctuation and lowercase
    const cleaned = word.toLowerCase().replace(/^[^\w\d]+|[^\w\d]+$/g, '');
    if (!cleaned) return;

    // Check if it's a numeral
    if (/^\d+$/.test(cleaned)) {
      const expanded = expandNumber(cleaned);
      expanded.forEach((w) => {
        normalizedWords.push(w);
        sourceIndices.push(index);
      });
    } else {
      normalizedWords.push(cleaned);
      sourceIndices.push(index);
    }
  });

  return { normalizedWords, sourceIndices };
}

/**
 * Basic number to English words expansion.
 */
function expandNumber(numStr: string): string[] {
  const num = parseInt(numStr, 10);
  if (isNaN(num)) return [numStr];
  if (num === 0) return ['zero'];

  const parts: string[] = [];

  function convert(n: number) {
    if (n < 10) {
      if (ONES[n]) parts.push(ONES[n]);
    } else if (n < 20) {
      parts.push(TEENS[n - 10]);
    } else if (n < 100) {
      parts.push(TENS[Math.floor(n / 10)]);
      if (n % 10 > 0) parts.push(ONES[n % 10]);
    } else if (n < 1000) {
      parts.push(ONES[Math.floor(n / 100)]);
      parts.push('hundred');
      if (n % 100 > 0) convert(n % 100);
    } else {
      // For very large numbers or non-handled ones, just return the string
      parts.push(numStr);
    }
  }

  convert(num);
  return parts.filter(Boolean);
}
