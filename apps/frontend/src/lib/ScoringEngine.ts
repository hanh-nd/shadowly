import ESpeakNg from 'espeak-ng';

import vocabJson from '../assets/vocab.json';
import { InferenceClient } from './InferenceClient';

class ScoringEngine {
  private vocabSet: Set<string> = new Set(Object.keys(vocabJson));
  private loadingPromise: Promise<void> | null = null;
  private isReady = false;

  /**
   * Idempotently ensures all models are loaded.
   */
  async ensureModels(
    onProgress?: (p: number, label?: string) => void,
  ): Promise<void> {
    if (this.isReady) {
      return;
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = (async () => {
      try {
        if (onProgress) onProgress(100, 'Scoring engine ready');
        this.isReady = true;
      } catch (err: unknown) {
        this.loadingPromise = null;
        console.error('ScoringEngine initialization failed:', err);
        throw err;
      }
    })();

    return this.loadingPromise;
  }

  /**
   * Runs acoustic CTC inference. Returns eSpeak NG IPA string.
   */
  async inferIpa(audio: Float32Array): Promise<string> {
    if (!this.isReady) {
      await this.ensureModels();
    }

    try {
      const output = await InferenceClient.score(audio);
      return output.text || '';
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
    return this.vocabSet;
  }
}

export const scoringEngine = new ScoringEngine();
