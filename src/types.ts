export interface Segment {
  id: number;
  text: string;
  start: number;
  end: number;
  recordingUrl: string | null;
}

export enum ProcessingState {
  Idle = 'idle',
  LoadingModel = 'loading-model',
  VADRunning = 'vad-running',
  Transcribing = 'transcribing',
  Ready = 'ready',
  Error = 'error'
}

export enum WorkerMessageType {
  Init = 'init',
  Ready = 'ready',
  Progress = 'progress',
  Error = 'error',
  Transcribe = 'transcribe',
  Result = 'result'
}

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
