export interface Segment {
  id: number;
  text: string;
  start: number;
  end: number;
  recordingUrl: string | null;
}

export type ProcessingState =
  | 'idle'
  | 'loading-model'
  | 'vad-running'
  | 'transcribing'
  | 'ready'
  | 'error';

export interface TranscribingProgress {
  current: number; // segments transcribed so far
  total: number;   // total VAD chunks detected so far (grows during processing)
}

export interface AppState {
  audioBuffer: AudioBuffer | null;
  segments: Segment[];
  activeIndex: number;
  playbackSpeed: number;
  processingState: ProcessingState;
  downloadProgress: number;
  errorMessage: string | null;
}
