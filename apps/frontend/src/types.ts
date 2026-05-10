export enum ModelId {
  Transcription = 'transcription',
  Scoring = 'scoring',
}

export enum InferenceEndpoint {
  Transcribe = 'transcribe',
  Score = 'score',
}

export enum StorageKey {
  Settings = 'shadowly:practice-settings',
}

export enum ScoringWorkerMessageType {
  LoadModels = 'loadModels',
  ModelProgress = 'modelProgress',
  ModelsReady = 'modelsReady',
  ModelsLoadError = 'modelsLoadError',
  Precompute = 'precompute',
  PrecomputeResult = 'precomputeResult',
  Score = 'score',
  Result = 'result',
  Error = 'error',
}

export interface WordTimestamp {
  word: string;
  start: number; // seconds, 0-relative to segment audio
  end: number; // seconds, 0-relative to segment audio
}

export interface LibraryItem {
  id: string;
  name: string;
  fileUrl: string;
  manifestUrl: string;
  tags: string[];
  duration: string; // formatted string like "04:15"
  text?: string;
  wordTimestamps?: WordTimestamp[];
}

export enum AppView {
  Idle = 'idle',
  Library = 'library',
  Practice = 'practice',
}

export enum WordScore {
  Good = 'good',
  Neutral = 'neutral',
  Bad = 'bad',
}

export interface Segment {
  id: number;
  text: string;
  start: number;
  end: number;
  recordingUrl: string | null;
  wordTimestamps?: WordTimestamp[];
  wordScores?: (WordScore | null)[] | null;
  isScoring?: boolean;
  chunks?: IpaChunk[];
}

export interface NormalizationResult {
  normalizedWords: string[];
  sourceIndices: number[];
}

export interface IpaChunk {
  sourceIndices: number[]; // indices into original text.split(' ')
  words: string[]; // original text words at those indices
  dictionaryIpa: string; // G2P output, eSpeak NG notation
  nativeAcousticIpa: string; // acoustic model output, may span word boundaries
}

export enum ProcessingState {
  Idle = 'idle',
  Fetching = 'fetching',
  Transcribing = 'transcribing',
  Ready = 'ready',
  Error = 'error',
}

export enum PlaybackStatus {
  Idle = 'idle',
  Playing = 'playing',
}

export enum NavigationDirection {
  Prev = 'prev',
  Next = 'next',
}

export enum SentenceCardMode {
  InactivePrev = 'inactive-prev',
  Active = 'active',
  InactiveNext = 'inactive-next',
}

export enum AudioContextStateEnum {
  Suspended = 'suspended',
  Running = 'running',
  Closed = 'closed',
}

export enum MediaRecorderState {
  Inactive = 'inactive',
  Recording = 'recording',
  Paused = 'paused',
}

export enum ShadowingPhase {
  Idle = 'idle',
  PlayingOriginal = 'playing_original',
  Recording = 'recording',
  Scoring = 'scoring',
  PlayingMine = 'playing_mine',
}

export interface ModelLoadTask {
  id: string;
  label: string;
  progress: number;
}

export enum WorkerMessageType {
  Init = 'init',
  Ready = 'ready',
  Progress = 'progress',
  Error = 'error',
  Transcribe = 'transcribe',
  TranscribeBatch = 'transcribeBatch',
  Abort = 'abort',
  Result = 'result',
}

export interface TranscribingProgress {
  current: number; // segments transcribed so far
  total: number; // total VAD chunks detected so far (grows during processing)
}

export interface AppState {
  audioBuffer: AudioBuffer | null;
  segments: Segment[];
  activeIndex: number;
  playbackSpeed: number;
  processingState: ProcessingState;
  errorMessage: string | null;
}
