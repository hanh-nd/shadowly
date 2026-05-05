export type EditOp =
  | { type: 'match'; refIdx: number; qryIdx: number }
  | { type: 'sub'; refIdx: number; qryIdx: number }
  | { type: 'del'; refIdx: number } // present in ref (native), absent in query (user)
  | { type: 'ins'; qryIdx: number }; // in query (user), not in ref (native)

/**
 * Global Needleman-Wunsch alignment for phoneme tokens.
 * Costs: match=0, mismatch=1, gap=1.
 */
export function alignPhonemes(ref: string[], query: string[]): EditOp[] {
  const n = ref.length;
  const m = query.length;

  if (n === 0 && m === 0) return [];
  if (n === 0) return query.map((_, i) => ({ type: 'ins', qryIdx: i }));
  if (m === 0) return ref.map((_, i) => ({ type: 'del', refIdx: i }));

  // Initialize DP table
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );

  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = ref[i - 1] === query[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + cost, // substitution/match
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
      );
    }
  }

  // Traceback
  const ops: EditOp[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const cost = ref[i - 1] === query[j - 1] ? 0 : 1;
      if (dp[i][j] === dp[i - 1][j - 1] + cost) {
        if (cost === 0) {
          ops.unshift({ type: 'match', refIdx: i - 1, qryIdx: j - 1 });
        } else {
          ops.unshift({ type: 'sub', refIdx: i - 1, qryIdx: j - 1 });
        }
        i--;
        j--;
        continue;
      }
    }

    if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.unshift({ type: 'del', refIdx: i - 1 });
      i--;
    } else {
      ops.unshift({ type: 'ins', qryIdx: j - 1 });
      j--;
    }
  }

  return ops;
}
