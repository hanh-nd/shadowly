import ESpeakNg from 'espeak-ng';

import vocabJson from '../../assets/vocab.json';
import { type ModelLoadProgressCallback, ScoringBackend } from '../../types';
import { type IpaInferenceBackend } from './IpaInferenceBackend';
import { LocalIpaInferenceBackend } from './LocalIpaInferenceBackend';
import { RemoteIpaInferenceBackend } from './RemoteIpaInferenceBackend';

const SCORING_BACKEND =
  (import.meta.env.VITE_SCORING_BACKEND as ScoringBackend) ??
  ScoringBackend.Local;

const vocabSet = new Set<string>(Object.keys(vocabJson));
const idToToken = new Map<number, string>(
  Object.entries(vocabJson).map(([token, id]) => [id, token]),
);

function createIpaInferenceBackend(): IpaInferenceBackend {
  if (SCORING_BACKEND === ScoringBackend.Remote) {
    return new RemoteIpaInferenceBackend();
  }

  return new LocalIpaInferenceBackend(idToToken);
}

class ScoringEngine {
  private backend: IpaInferenceBackend = createIpaInferenceBackend();

  /**
   * Idempotently ensures all models are loaded.
   */
  ensureModels(onProgress?: ModelLoadProgressCallback): Promise<void> {
    return this.backend.ensureModels(onProgress);
  }

  /**
   * Runs acoustic CTC inference. Returns eSpeak NG IPA string.
   */
  async inferIpa(audio: Float32Array): Promise<string> {
    try {
      return await this.backend.inferIpa(audio);
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
        noInitialRun: false,
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
        preRun: [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (module: any) => {
            module.FS.writeFile('input.txt', inputText);
          },
        ],
      });

      let ipaOut = instance.FS.readFile('out', {
        encoding: 'utf8',
      }).trim();

      // Cleanup to prevent memory buildup in the virtual FS
      instance.FS.unlink('input.txt');
      instance.FS.unlink('out');

      // Clean up IPA: strip stress marks, syllable breaks, and ZWJ
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
    return vocabSet;
  }
}

export const scoringEngine = new ScoringEngine();
