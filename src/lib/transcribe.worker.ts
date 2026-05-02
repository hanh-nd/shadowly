import {
  AutomaticSpeechRecognitionPipeline,
  env,
  pipeline,
  type AutomaticSpeechRecognitionOutput,
} from "@huggingface/transformers";
import { WorkerMessageType } from "../types";

// Skip local model check for faster loading in worker
env.allowLocalModels = false;

type WhisperPipeline = Awaited<AutomaticSpeechRecognitionPipeline>;

let pipe: WhisperPipeline | null = null;

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
        const output = await pipe(audio);
        const text = Array.isArray(output)
          ? output
              .map((item) => item.text)
              .join(" ")
              .trim()
          : (output as AutomaticSpeechRecognitionOutput).text.trim();

        self.postMessage({
          type: WorkerMessageType.Result,
          payload: text,
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
