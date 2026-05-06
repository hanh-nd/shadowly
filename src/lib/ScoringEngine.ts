import {
  AutoModelForCTC,
  AutoProcessor,
  env,
  PreTrainedModel,
  Processor,
} from '@huggingface/transformers';
import ESpeakNg from 'espeak-ng';

// --- INJECT EXPORTS/REQUIRE POLYFILL ---
// Polyfill for String.prototype.replaceAll (required by some environments)
if (typeof String.prototype.replaceAll !== 'function') {
  String.prototype.replaceAll = function (
    search: string | RegExp,
    replacement: ((substring: string, ...args: unknown[]) => string) | string,
  ) {
    if (typeof replacement === 'string') {
      if (search instanceof RegExp) return this.replace(search, replacement);
      return this.replace(
        new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        replacement,
      );
    } else {
      if (search instanceof RegExp) return this.replace(search, replacement);
      return this.replace(
        new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
        replacement,
      );
    }
  };
}
// Fixes Vite/Webpack bundling errors for vad-web and onnxruntime-web
if (typeof self.exports === 'undefined') {
  self.exports = {};
}
if (typeof self.require === 'undefined') {
  self.require = function () {
    return {};
  } as unknown as NodeJS.Require;
}
// -------------------------------

env.useBrowserCache = true;
env.allowLocalModels = false;

const WAV2VEC2_MODEL = 'onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX';
const BASE_MODEL = 'facebook/wav2vec2-lv-60-espeak-cv-ft';

class ScoringEngine {
  private acousticModel: PreTrainedModel | null = null;
  private processor: Processor | null = null;
  private espeakModule = null;
  private vocab: Map<number, string> = new Map();
  private vocabSet: Set<string> = new Set();

  /**
   * Idempotently ensures all models are loaded.
   */
  async ensureModels(onProgress?: (p: number) => void): Promise<void> {
    if (
      this.acousticModel &&
      this.processor &&
      this.espeakModule &&
      this.vocabSet.size > 0
    ) {
      return;
    }

    try {
      // 1. Load wav2vec2-alignment components
      if (!this.acousticModel || !this.processor || this.vocabSet.size === 0) {
        const progress_callback = (info: {
          status: string;
          progress?: number;
        }) => {
          if (info.status === 'progress' && info.progress && onProgress) {
            onProgress(Math.round(info.progress));
          }
        };

        const [model, processor, vocabJson] = await Promise.all([
          AutoModelForCTC.from_pretrained(WAV2VEC2_MODEL, {
            dtype: 'q4',
            device: 'wasm',
            progress_callback,
          }),
          AutoProcessor.from_pretrained(BASE_MODEL, {
            progress_callback,
          }),
          fetch(
            `https://huggingface.co/${BASE_MODEL}/resolve/main/vocab.json`,
          ).then((r) => r.json()),
        ]);

        this.acousticModel = model;
        this.processor = processor;

        // 2. Extract vocab
        this.vocab.clear();
        this.vocabSet.clear();
        for (const [token, id] of Object.entries(vocabJson)) {
          this.vocab.set(id as number, token as string);
          this.vocabSet.add(token as string);
        }
      }

      // 3. Load espeak-ng WASM
      if (!this.espeakModule) {
        this.espeakModule = await ESpeakNg();
      }
    } catch (err: unknown) {
      console.error('ScoringEngine model loading failed:', err);
      throw err;
    }
  }

  /**
   * Runs acoustic CTC inference. Returns eSpeak NG IPA string.
   */
  async inferIpa(audio: Float32Array): Promise<string> {
    if (!this.acousticModel || !this.processor) {
      return '';
    }

    try {
      // 1. Preprocess audio
      const inputs = await this.processor(audio);

      // 2. Inference
      const outputs = await this.acousticModel(inputs);
      const logits = outputs.logits;

      // 3. Manual Greedy CTC Decode
      // Logits shape: [batch, sequence, vocab]
      const [, seqLen, vocabSize] = logits.dims;
      const data = logits.data as Float32Array;

      // @ts-expect-error - config exists on model
      const blankTokenId = this.acousticModel.config.blank_token_id ?? 0;

      const decoded: string[] = [];
      let prevId = -1;

      for (let s = 0; s < seqLen; s++) {
        let maxVal = -Infinity;
        let maxId = -1;

        for (let v = 0; v < vocabSize; v++) {
          const idx = s * vocabSize + v;
          if (data[idx] > maxVal) {
            maxVal = data[idx];
            maxId = v;
          }
        }

        if (maxId !== blankTokenId && maxId !== prevId) {
          const token = this.vocab.get(maxId);
          if (token) {
            decoded.push(token);
          }
        }
        prevId = maxId;
      }

      return decoded.join('');
    } catch (err) {
      console.error('Inference failed:', err);
      return '';
    }
  }

  /**
   * G2P for one normalized word. Returns eSpeak NG IPA string.
   */
  async g2pWord(word: string): Promise<string> {
    if (!this.espeakModule || !word) {
      return '';
    }

    try {
      const instance = await ESpeakNg({
        arguments: ['-q', '-v', 'en-us', '--ipa=3', '--phonout', 'out', word],
      });
      let ipa = instance.FS.readFile('out', { encoding: 'utf8' }).trim();

      // Clean up IPA: strip stress marks, syllable breaks, and ZWJ
      // These are not typically present in acoustic model vocabs
      ipa = ipa.replace(/[ˈˌ.]/g, '').replace(/\u200d/g, '');

      return ipa;
    } catch (err) {
      console.error(`G2P failed for word "${word}":`, err);
      return '';
    }
  }

  /**
   * Returns Set of all IPA token strings from vocab.json.
   */
  getVocab(): Set<string> {
    return this.vocabSet;
  }
}

export const scoringEngine = new ScoringEngine();
