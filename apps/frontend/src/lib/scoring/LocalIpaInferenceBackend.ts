import {
  AutoModelForCTC,
  AutoProcessor,
  env,
  type PreTrainedModel,
  type Processor,
  type ProgressInfo,
} from '@huggingface/transformers';

import type { ModelLoadProgressCallback } from '../../types';
import { ctcGreedyDecode } from '../../utils/ctc-decoder';
import { type IpaInferenceBackend } from './IpaInferenceBackend';

const WAV2VEC2_MODEL = 'onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX';
const PROCESSOR_MODEL = 'facebook/wav2vec2-lv-60-espeak-cv-ft';

env.useBrowserCache = true;
env.allowLocalModels = false;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.simd = true;
  env.backends.onnx.wasm.proxy = false;
}

interface ModelOutput {
  logits: {
    data: Float32Array;
    dims: number[];
  };
}

function calculateProgress(
  progressInfo: ProgressInfo,
): { progress: number; loaded?: number; total?: number } | null {
  if (progressInfo.status === 'progress') {
    return {
      progress: Math.max(0, Math.min(90, progressInfo.progress * 0.9)),
      loaded: (progressInfo as { loaded?: number }).loaded,
      total: (progressInfo as { total?: number }).total,
    };
  }

  if (progressInfo.status === 'progress_total') {
    return {
      progress: Math.max(0, Math.min(90, progressInfo.progress * 0.9)),
      loaded: (progressInfo as { loaded?: number }).loaded,
      total: (progressInfo as { total?: number }).total,
    };
  }

  return null;
}

export class LocalIpaInferenceBackend implements IpaInferenceBackend {
  private acousticModel: PreTrainedModel | null = null;
  private processor: Processor | null = null;
  private loadingPromise: Promise<void> | null = null;
  private isReady = false;

  constructor(private readonly idToToken: Map<number, string>) {}

  ensureModels(onProgress?: ModelLoadProgressCallback): Promise<void> {
    if (this.isReady) {
      return Promise.resolve();
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = (async () => {
      try {
        onProgress?.(0, 'Preparing scoring engine');

        const progressCallback = (progressInfo: ProgressInfo) => {
          const result = calculateProgress(progressInfo);
          if (result !== null) {
            onProgress?.(
              result.progress,
              'Downloading scoring model...',
              result.loaded,
              result.total,
            );
          }
        };

        const [processor, acousticModel] = await Promise.all([
          AutoProcessor.from_pretrained(PROCESSOR_MODEL, {
            progress_callback: progressCallback,
          }),
          AutoModelForCTC.from_pretrained(WAV2VEC2_MODEL, {
            dtype: { webgpu: 'q4f16', wasm: 'q4' },
            device: 'auto',
            progress_callback: progressCallback,
          }),
        ]);

        this.processor = processor;
        this.acousticModel = acousticModel;

        this.isReady = true;
        onProgress?.(100, 'Scoring engine ready');
      } catch (err: unknown) {
        this.loadingPromise = null;
        this.isReady = false;
        console.error('ScoringEngine initialization failed:', err);
        throw err;
      }
    })();

    return this.loadingPromise;
  }

  async inferIpa(audio: Float32Array): Promise<string> {
    if (!this.processor || !this.acousticModel) {
      await this.ensureModels();
    }

    if (!this.processor || !this.acousticModel) {
      return '';
    }

    const inputs = await this.processor(audio);
    const output = (await this.acousticModel(inputs)) as ModelOutput;

    const [, seqLen, vocabSize] = output.logits.dims;
    if (!seqLen || !vocabSize) {
      return '';
    }

    const modelConfig = this.acousticModel.config as {
      blank_token_id?: number;
    };
    const blankTokenId = modelConfig.blank_token_id ?? 0;
    return ctcGreedyDecode(
      output.logits.data,
      seqLen,
      vocabSize,
      this.idToToken,
      blankTokenId,
    );
  }
}
