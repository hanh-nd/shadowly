import type { Segment } from '../types';

export function getSegmentIndexAtTime(
  segments: Segment[],
  currentTime: number,
): number | null {
  if (segments.length === 0) {
    return null;
  }

  const safeTime = Number.isFinite(currentTime)
    ? currentTime
    : Number.NEGATIVE_INFINITY;

  if (safeTime <= segments[0].start) {
    return 0;
  }

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];

    if (safeTime < segment.start) {
      return Math.max(0, index - 1);
    }

    if (safeTime >= segment.start && safeTime < segment.end) {
      return index;
    }
  }

  return segments.length - 1;
}
