import {
  AutomaticSpeechRecognitionPipeline,
  env,
  pipeline,
} from "@huggingface/transformers";
import { WorkerMessageType, type WordTimestamp } from "../types";

// Skip local model check for faster loading in worker
env.allowLocalModels = false;

let pipe: Awaited<AutomaticSpeechRecognitionPipeline> | null = null;

self.onmessage = async (e) => {
  const { type, audio, model, id } = e.data;

  try {
    switch (type) {
      case WorkerMessageType.Init: {
        pipe = await pipeline("automatic-speech-recognition", model, {
          device: "wasm",
          dtype: "q8",
          session_options: {
            graphOptimizationLevel: "basic",
          },
          progress_callback: (p) => {
            const info = p as { progress: number }; // @huggingface/transformers types are not working properly
            if (!info.progress) return;
            self.postMessage({
              type: WorkerMessageType.Progress,
              payload: info.progress,
              id,
            });
          },
        });
        self.postMessage({ type: WorkerMessageType.Ready, id });
        break;
      }

      case WorkerMessageType.Transcribe: {
        if (!pipe) {
          throw new Error("Pipeline not initialized");
        }
        const output = await pipe(audio, {
          return_timestamps: "word",
          chunk_length_s: 30,
          stride_length_s: 5,
        });

        const outputArray = Array.isArray(output) ? output : [output];
        const text = outputArray
          .map((item) => item.text)
          .join(" ")
          .trim();
        const chunks = outputArray.flatMap((item) => item.chunks);
        const wordTimestamps: WordTimestamp[] = (chunks || [])
          .filter(
            (chunk) =>
              chunk.timestamp[0] !== null && chunk.timestamp[1] !== null,
          )
          .map((chunk) => ({
            word: chunk.text.trim(),
            start: chunk.timestamp[0]!,
            end: chunk.timestamp[1]!,
          }));

        self.postMessage({
          type: WorkerMessageType.Result,
          payload: { text, wordTimestamps },
          id,
        });
        break;
      }
    }
  } catch (err) {
    self.postMessage({
      type: WorkerMessageType.Error,
      payload: err instanceof Error ? err.message : "Unknown error",
      id,
    });
  }
};
