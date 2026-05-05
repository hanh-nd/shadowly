export interface PracticeSettings {
  maskMode: boolean;
  playbackSpeed: number;
  autoStopEnabled: boolean;
  autoCruiseEnabled: boolean;
  scoringEnabled: boolean;
  bufferTime: number;
  loopCount: number;
}

export interface SettingsStorage {
  load(): Partial<PracticeSettings>;
  save(settings: PracticeSettings): void;
}

const STORAGE_KEY = 'shadowly:practice-settings';

export const localStorageSettingsStorage: SettingsStorage = {
  load(): Partial<PracticeSettings> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Partial<PracticeSettings>) : {};
    } catch {
      return {};
    }
  },
  save(settings: PracticeSettings): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // quota exceeded or access restriction — silently ignore
    }
  },
};
