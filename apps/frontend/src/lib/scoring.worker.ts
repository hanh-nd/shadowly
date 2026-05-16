import '../utils/worker-polyfills';

import { type IpaChunk, ScoringWorkerMessageType, WordScore } from '../types';
import { tokenize } from '../utils/ipa-tokenizer';
import { alignPhonemes } from '../utils/needleman-wunsch';
import { normalize } from '../utils/text-normalizer';
import { scoringEngine } from './scoring/ScoringEngine';

interface PrecomputeCache {
  chunks: IpaChunk[];
  nativeTokens: string[];
  nativeTokenToChunkIdx: number[];
}

const precomputeCache = new Map<number, PrecomputeCache>();

const SCORE_THRESHOLD_GOOD = 0.8;
const SCORE_THRESHOLD_NEUTRAL = 0.5;
const PENALTY_SUB = 0.5;
const PENALTY_DEL = 1.0;
const PENALTY_INS = 1.0;

/**
 * Builds chunks by aligning native acoustic tokens with dictionary phonemes.
 */
function buildChunkMap(
  dictTokensPerWord: string[][],
  sourceIndices: number[],
  originalWords: string[],
  nativeTokens: string[],
): { chunks: IpaChunk[]; nativeTokenToChunkIdx: number[] } {
  const flatDictTokens: string[] = [];
  const dictTokenToWordIdx: number[] = [];

  dictTokensPerWord.forEach((tokens, wordIdx) => {
    tokens.forEach((token) => {
      flatDictTokens.push(token);
      dictTokenToWordIdx.push(wordIdx);
    });
  });

  const ops = alignPhonemes(nativeTokens, flatDictTokens);
  const nativeTokenToWordIdx = new Array(nativeTokens.length).fill(-1);

  ops.forEach((op) => {
    if (op.type === 'match' || op.type === 'sub') {
      nativeTokenToWordIdx[op.refIdx] = dictTokenToWordIdx[op.qryIdx];
    }
  });

  // Fill in gaps for deletions (native tokens that didn't match any dict token)
  let lastWordIdx = 0;
  for (let i = 0; i < nativeTokenToWordIdx.length; i++) {
    if (nativeTokenToWordIdx[i] === -1) {
      nativeTokenToWordIdx[i] = lastWordIdx;
    } else {
      lastWordIdx = nativeTokenToWordIdx[i];
    }
  }

  // Group words into chunks. By default, 1 word = 1 chunk.
  // Fusions could be detected here, but for now we'll follow the plan's
  // recommendation of 1-to-1 unless fusions are detected via alignment overlaps.
  // Since NW is a global alignment, overlap is handled by the mapping.

  const wordToChunkIdx = new Array(dictTokensPerWord.length).fill(-1);
  const chunks: IpaChunk[] = [];
  let chunkIdx = 0;
  let currentChunk: IpaChunk | null = null;

  const uniqueSourceIndices = Array.from(new Set(sourceIndices)).sort(
    (a, b) => a - b,
  );

  uniqueSourceIndices.forEach((sourceIdx) => {
    const wordIndicesForThisSource = sourceIndices
      .map((s, i) => (s === sourceIdx ? i : -1))
      .filter((i) => i !== -1);

    const nativeIpa = nativeTokens
      .filter((_, i) =>
        wordIndicesForThisSource.includes(nativeTokenToWordIdx[i]),
      )
      .join('');

    // Cross-boundary fusion detection: if nativeIpa is empty, it means the acoustic
    // tokens were entirely consumed by adjacent words (overlapping native ranges).
    // In this case, we fuse this word into the previous chunk.
    if (currentChunk && nativeIpa === '') {
      currentChunk.sourceIndices.push(sourceIdx);
      currentChunk.words.push(originalWords[sourceIdx]);
      currentChunk.dictionaryIpa += wordIndicesForThisSource
        .map((i) => dictTokensPerWord[i].join(''))
        .join('');

      wordIndicesForThisSource.forEach((wordIdx) => {
        wordToChunkIdx[wordIdx] = chunkIdx - 1;
      });
    } else {
      currentChunk = {
        sourceIndices: [sourceIdx],
        words: [originalWords[sourceIdx]],
        dictionaryIpa: wordIndicesForThisSource
          .map((i) => dictTokensPerWord[i].join(''))
          .join(''),
        nativeAcousticIpa: nativeIpa,
      };
      chunks.push(currentChunk);
      wordIndicesForThisSource.forEach((wordIdx) => {
        wordToChunkIdx[wordIdx] = chunkIdx;
      });
      chunkIdx++;
    }
  });

  const nativeTokenToChunkIdx = nativeTokenToWordIdx.map(
    (wordIdx) => wordToChunkIdx[wordIdx],
  );

  return { chunks, nativeTokenToChunkIdx };
}

/**
 * Scores user tokens against cached native tokens.
 */
function scoreChunks(
  cache: PrecomputeCache,
  userTokens: string[],
  originalWordCount: number,
): (WordScore | null)[] {
  const ops = alignPhonemes(cache.nativeTokens, userTokens);

  const chunkErrors = cache.chunks.map(() => ({
    sub: 0,
    del: 0,
    ins: 0,
    total: 0,
  }));

  // N_target for each chunk
  cache.nativeTokenToChunkIdx.forEach((chunkIdx) => {
    if (chunkIdx !== -1) chunkErrors[chunkIdx].total++;
  });

  let lastChunkIdx = 0;
  ops.forEach((op) => {
    if (op.type === 'match' || op.type === 'sub' || op.type === 'del') {
      const chunkIdx = cache.nativeTokenToChunkIdx[op.refIdx];
      if (chunkIdx !== -1) {
        if (op.type === 'sub') chunkErrors[chunkIdx].sub++;
        if (op.type === 'del') chunkErrors[chunkIdx].del++;
        lastChunkIdx = chunkIdx;
      }
    } else if (op.type === 'ins') {
      chunkErrors[lastChunkIdx].ins++;
    }
  });

  const chunkScores = chunkErrors.map((err) => {
    if (err.total === 0) return WordScore.Neutral;
    const penalty =
      PENALTY_SUB * err.sub + PENALTY_DEL * err.del + PENALTY_INS * err.ins;
    const score = Math.max(0, 1 - penalty / err.total);

    if (score >= SCORE_THRESHOLD_GOOD) return WordScore.Good;
    if (score >= SCORE_THRESHOLD_NEUTRAL) return WordScore.Neutral;
    return WordScore.Bad;
  });

  const wordScores = new Array(originalWordCount).fill(WordScore.Neutral);
  cache.chunks.forEach((chunk, chunkIdx) => {
    chunk.sourceIndices.forEach((sourceIdx) => {
      wordScores[sourceIdx] = chunkScores[chunkIdx];
    });
  });

  return wordScores;
}

self.onmessage = async (e: MessageEvent) => {
  const { type, segmentId, id } = e.data;

  try {
    if (type === ScoringWorkerMessageType.LoadModels) {
      await scoringEngine.ensureModels((p, label) =>
        self.postMessage({
          type: ScoringWorkerMessageType.ModelProgress,
          progress: p,
          label,
        }),
      );
      self.postMessage({ type: ScoringWorkerMessageType.ModelsReady });
    } else if (type === ScoringWorkerMessageType.Precompute) {
      const { refText, refAudio } = e.data;

      await scoringEngine.ensureModels();

      const vocab = scoringEngine.getVocab();
      const { normalizedWords, sourceIndices } = normalize(refText);

      const dictTokensPerWord: string[][] = [];
      const ipas = await scoringEngine.g2pWords(normalizedWords);
      for (let i = 0; i < normalizedWords.length; i++) {
        dictTokensPerWord.push(tokenize(ipas[i], vocab));
      }

      const originalWords = refText.split(/\s+/);
      const nativeIpaStr = await scoringEngine.inferIpa(refAudio);
      const nativeTokens = tokenize(nativeIpaStr, vocab);

      const { chunks, nativeTokenToChunkIdx } = buildChunkMap(
        dictTokensPerWord,
        sourceIndices,
        originalWords,
        nativeTokens,
      );

      console.debug(
        `Worker | Native IPA (Segment ${segmentId}):`,
        nativeIpaStr,
      );

      precomputeCache.set(segmentId, {
        chunks,
        nativeTokens,
        nativeTokenToChunkIdx,
      });

      self.postMessage({
        type: ScoringWorkerMessageType.PrecomputeResult,
        segmentId,
        id,
        chunks,
      });
    } else if (type === ScoringWorkerMessageType.Score) {
      const { userAudio } = e.data;
      const cache = precomputeCache.get(segmentId);

      if (!cache) {
        self.postMessage({
          type: ScoringWorkerMessageType.Result,
          segmentId,
          id,
          wordScores: new Array(0).fill(WordScore.Neutral),
        });
        return;
      }

      await scoringEngine.ensureModels();

      const userIpaStr = await scoringEngine.inferIpa(userAudio);
      console.debug(`Worker | User IPA (Segment ${segmentId}):`, userIpaStr);
      const userTokens = tokenize(userIpaStr, scoringEngine.getVocab());

      const originalWordCount =
        Math.max(...cache.chunks.flatMap((c) => c.sourceIndices)) + 1;
      const wordScores = scoreChunks(cache, userTokens, originalWordCount);

      self.postMessage({
        type: ScoringWorkerMessageType.Result,
        segmentId,
        wordScores,
        id,
      });
    }
  } catch (err: unknown) {
    if (type === ScoringWorkerMessageType.LoadModels) {
      self.postMessage({
        type: ScoringWorkerMessageType.ModelsLoadError,
        error: (err as Error).toString(),
      });
    } else {
      self.postMessage({
        type: ScoringWorkerMessageType.Error,
        segmentId,
        id,
        error: (err as Error).toString(),
      });
    }
  }
};
