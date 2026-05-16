import { split } from 'sentence-splitter';

import {
  SEGMENT_PADDING_END,
  SEGMENT_PADDING_START,
  SILENCE_THRESHOLD,
} from '../constants';
import type { Segment, WordTimestamp } from '../types';

/**
 * Groups word timestamps into logical segments using sentence-splitter AST
 * and fallback silence gap detection.
 */
export function groupWordsIntoSegments(words: WordTimestamp[]): Segment[] {
  if (words.length === 0) return [];

  // 1. Normalize words and build the joined string with offset tracking
  const normalizedWords = words.map((w) => ({
    ...w,
    word: w.word.trim(),
  }));

  // Clamp any word whose start overlaps the previous word's end (Whisper misalignment).
  for (let i = 1; i < normalizedWords.length; i++) {
    if (normalizedWords[i].start < normalizedWords[i - 1].end) {
      normalizedWords[i] = {
        ...normalizedWords[i],
        start: normalizedWords[i - 1].end,
      };
    }
  }

  let currentPos = 0;
  const wordsWithOffsets = normalizedWords.map((w) => {
    const start = currentPos;
    const end = start + w.word.length;
    currentPos = end + 1; // +1 for the space
    return { ...w, stringRange: [start, end] as [number, number] };
  });

  const joinedText = wordsWithOffsets.map((w) => w.word).join(' ');

  // 2. Split by sentence-splitter
  const nodes = split(joinedText);
  const sentenceNodes = nodes.filter((n) => n.type === 'Sentence');

  // 3. Map words back to sentences via offsets
  const segments: Segment[] = [];
  let globalSegmentId = 0;

  for (const node of sentenceNodes) {
    const [nodeStart, nodeEnd] = node.range;
    const wordsInSentence = wordsWithOffsets.filter(
      (w) => w.stringRange[0] >= nodeStart && w.stringRange[1] <= nodeEnd,
    );

    if (wordsInSentence.length === 0) continue;

    // 4. Sub-split on silence gaps within the sentence
    let currentSubGroup: typeof wordsInSentence = [];
    for (let i = 0; i < wordsInSentence.length; i++) {
      const word = wordsInSentence[i];
      currentSubGroup.push(word);

      const isLastInSentence = i === wordsInSentence.length - 1;
      if (isLastInSentence) {
        segments.push(finalizeSegment(globalSegmentId++, currentSubGroup));
        break;
      }

      const nextWord = wordsInSentence[i + 1];
      const gap = nextWord.start - word.end;

      if (gap > SILENCE_THRESHOLD) {
        segments.push(finalizeSegment(globalSegmentId++, currentSubGroup));
        currentSubGroup = [];
      }
    }
  }

  // Fallback: If no sentence nodes found (rare), use pure silence split
  if (segments.length === 0 && words.length > 0) {
    let currentGroup: typeof wordsWithOffsets = [];
    for (let i = 0; i < wordsWithOffsets.length; i++) {
      const word = wordsWithOffsets[i];
      currentGroup.push(word);

      const isLast = i === wordsWithOffsets.length - 1;
      const gap = isLast ? 0 : wordsWithOffsets[i + 1].start - word.end;

      if (isLast || gap > SILENCE_THRESHOLD) {
        segments.push(finalizeSegment(globalSegmentId++, currentGroup));
        currentGroup = [];
      }
    }
  }

  return segments;
}

function finalizeSegment(id: number, words: WordTimestamp[]): Segment {
  const start = Math.max(0, words[0].start - SEGMENT_PADDING_START);
  const end = words[words.length - 1].end + SEGMENT_PADDING_END;
  const text = words
    .map((w) => w.word)
    .join(' ')
    .trim();

  return {
    id,
    text,
    start,
    end,
    recordingUrl: null,
    wordTimestamps: words.map((w) => ({
      ...w,
      start: w.start - start,
      end: w.end - start,
    })),
  };
}
