import {
  AutoModelForCTC,
  AutoProcessor,
  env,
  PreTrainedModel,
  Processor,
} from '@huggingface/transformers';
import ESpeakNg from 'espeak-ng';

env.useBrowserCache = true;
env.allowLocalModels = false;

// Force SIMD and disable proxy for ONNX Runtime Web
if (env.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.simd = true;
  env.backends.onnx.wasm.proxy = false;
}

const WAV2VEC2_MODEL = 'onnx-community/wav2vec2-lv-60-espeak-cv-ft-ONNX';
const BASE_MODEL = 'facebook/wav2vec2-lv-60-espeak-cv-ft';

class ScoringEngine {
  private acousticModel: PreTrainedModel | null = null;
  private processor: Processor | null = null;
  private vocab: Map<number, string> = new Map();
  private vocabSet: Set<string> = new Set();
  private loadingPromise: Promise<void> | null = null;

  /**
   * Idempotently ensures all models are loaded.
   */
  async ensureModels(
    onProgress?: (p: number, label?: string) => void,
  ): Promise<void> {
    if (this.acousticModel && this.processor && this.vocabSet.size > 0) {
      return;
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = (async () => {
      try {
        // 1. Load wav2vec2-alignment components
        if (
          !this.acousticModel ||
          !this.processor ||
          this.vocabSet.size === 0
        ) {
          const progress_callback = (info: {
            status: string;
            progress?: number;
          }) => {
            if (info.status === 'progress' && info.progress && onProgress) {
              onProgress(
                Math.round(info.progress * 0.9),
                'Downloading scoring models…',
              );
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

        if (onProgress) onProgress(95, 'Warming up inference engine…');

        // 3. Warm-up inference
        try {
          // Warm up with two different shapes to trigger kernel variants
          for (const size of [32000, 80000]) {
            const buffer = new Float32Array(size).map(
              (_, i) => Math.sin(i / 100) * 0.1,
            );
            await this.inferIpa(buffer);
          }
        } catch (err) {
          console.warn(
            'ScoringEngine warm-up inference failed (non-fatal):',
            err,
          );
        }

        if (onProgress) onProgress(100, 'Scoring models ready');
      } catch (err: unknown) {
        this.loadingPromise = null;
        console.error('ScoringEngine model loading failed:', err);
        throw err;
      }
    })();

    return this.loadingPromise;
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
   * G2P for multiple normalized words. Returns eSpeak NG IPA strings.
   */
  async g2pWords(words: string[]): Promise<string[]> {
    if (!words || words.length === 0) {
      return [];
    }

    try {
      const inputText = words.join('\n\n');
      const instance = await ESpeakNg({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        preRun: (Module: any) => {
          Module.FS.writeFile('input.txt', inputText);
        },
        arguments: [
          '-q',
          '-v',
          'en-us',
          '--ipa=3',
          '--phonout',
          'out',
          '-f',
          'input.txt',
        ],
      });
      let ipaOut = instance.FS.readFile('out', { encoding: 'utf8' }).trim();

      // Clean up IPA: strip stress marks, syllable breaks, and ZWJ
      // These are not typically present in acoustic model vocabs
      ipaOut = ipaOut.replace(/[ˈˌ.]/g, '').replace(/\u200d/g, '');

      const ipas = ipaOut.split('\n').map((s: string) => s.trim());

      if (ipas.length !== words.length) {
        console.warn(
          `g2pWords mismatch: expected ${words.length} but got ${ipas.length}`,
        );
      }

      return ipas;
    } catch (err) {
      console.error(`G2P failed for words batch:`, err);
      return words.map(() => '');
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
