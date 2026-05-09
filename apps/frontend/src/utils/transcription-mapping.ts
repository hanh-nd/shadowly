import type { Segment, WordTimestamp } from '../types';

/**
 * Maps word timestamps from a full audio transcription to individual VAD segments.
 *
 * @param words - Word timestamps relative to the beginning of the full audio.
 * @param segments - VAD segments with absolute start/end times.
 * @returns Updated segments with assigned words and relative timestamps.
 */
export function mapWordsToSegments(
  words: WordTimestamp[],
  segments: Segment[],
): Segment[] {
  return segments.map((segment) => {
    const segmentWords = words
      .filter((word) => {
        const midpoint = (word.start + word.end) / 2;
        return midpoint >= segment.start && midpoint <= segment.end;
      })
      .map((word) => ({
        ...word,
        start: Math.max(0, word.start - segment.start),
        end: word.end - segment.start,
      }));

    return {
      ...segment,
      wordTimestamps: segmentWords,
      text: segmentWords
        .map((w) => w.word)
        .join(' ')
        .trim(),
    };
  });
}
