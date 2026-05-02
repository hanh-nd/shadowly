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

export enum PlaybackStatus {
  Idle = 'idle',
  Playing = 'playing'
}

export enum NavigationDirection {
  Prev = 'prev',
  Next = 'next'
}

export enum SentenceCardMode {
  InactivePrev = 'inactive-prev',
  Active = 'active',
  InactiveNext = 'inactive-next'
}

export enum AudioContextStateEnum {
  Suspended = 'suspended',
  Running = 'running',
  Closed = 'closed'
}

export enum MediaRecorderState {
  Inactive = 'inactive',
  Recording = 'recording',
  Paused = 'paused'
}

export enum CruisePhase {
  Idle = 'idle',
  PlayingOriginal = 'playing_original',
  Recording = 'recording',
  PlayingMine = 'playing_mine',
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
