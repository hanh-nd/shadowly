import './worker-polyfills';

import { WorkerMessageType } from '../types';
import { TranscriptionEngine } from './TranscriptionEngine';

const transcriptionEngine = new TranscriptionEngine();
const segmentsMap = new Map<string, Float32Array>();

self.onmessage = async (e) => {
  const { type, audio, id, segmentId } = e.data;

  try {
    switch (type) {
      case WorkerMessageType.Init: {
        await transcriptionEngine.init((progress) => {
          self.postMessage({
            type: WorkerMessageType.Progress,
            payload: progress,
            id,
          });
        });
        self.postMessage({ type: WorkerMessageType.Ready, id });
        break;
      }

      case WorkerMessageType.RunVAD: {
        segmentsMap.clear();

        for await (const segment of transcriptionEngine.runVAD(audio)) {
          segmentsMap.set(segment.id, segment.audio);

          self.postMessage({
            type: WorkerMessageType.SegmentFound,
            segmentId: segment.id,
            start: segment.start,
            end: segment.end,
            audioLength: segment.audio.length,
            id,
          });
        }

        self.postMessage({ type: WorkerMessageType.VadDone, id });
        break;
      }

      case WorkerMessageType.Transcribe: {
        const segmentAudio = segmentsMap.get(segmentId);
        if (!segmentAudio) {
          throw new Error('Segment audio not found');
        }

        const result = await transcriptionEngine.transcribe(segmentAudio);

        self.postMessage({
          type: WorkerMessageType.Result,
          payload: result,
          id,
        });
        break;
      }
    }
  } catch (err) {
    self.postMessage({
      type: WorkerMessageType.Error,
      payload: err instanceof Error ? err.message : String(err),
      id,
    });
  }
};
