/**
 * Greedy left-to-right longest-match tokenizer for IPA strings.
 * Uses the provides vocab set to identify multi-character tokens.
 */
export function tokenize(ipa: string, vocab: Set<string>): string[] {
  if (!ipa) {
    return [];
  }

  const tokens: string[] = [];
  let i = 0;

  while (i < ipa.length) {
    let match = '';

    // Find longest prefix in vocab starting at current position
    // Typical IPA tokens are 1-4 chars long, so we scan up to a reasonable length
    for (let len = Math.min(ipa.length - i, 10); len > 0; len--) {
      const sub = ipa.substring(i, i + len);
      if (vocab.has(sub)) {
        match = sub;
        break;
      }
    }

    if (match) {
      tokens.push(match);
      i += match.length;
    } else {
      // If no vocab match, emit the raw character as a fallback
      tokens.push(ipa[i]);
      i++;
    }
  }

  return tokens;
}
