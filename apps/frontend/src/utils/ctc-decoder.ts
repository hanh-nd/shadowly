export function ctcGreedyDecode(
  logits: Float32Array,
  seqLen: number,
  vocabSize: number,
  idToToken: Map<number, string>,
  blankTokenId: number,
): string {
  if (seqLen === 0 || vocabSize === 0) {
    return '';
  }

  const tokens: string[] = [];
  let previousTokenId: number | null = null;

  for (let rowIndex = 0; rowIndex < seqLen; rowIndex++) {
    const rowOffset = rowIndex * vocabSize;
    let bestTokenId = 0;
    let bestScore = logits[rowOffset] ?? Number.NEGATIVE_INFINITY;

    for (let tokenId = 1; tokenId < vocabSize; tokenId++) {
      const score = logits[rowOffset + tokenId] ?? Number.NEGATIVE_INFINITY;
      if (score > bestScore) {
        bestScore = score;
        bestTokenId = tokenId;
      }
    }

    if (bestTokenId !== previousTokenId && bestTokenId !== blankTokenId) {
      const token = idToToken.get(bestTokenId);
      if (token) {
        tokens.push(token);
      }
    }

    previousTokenId = bestTokenId;
  }

  return tokens.join('');
}
