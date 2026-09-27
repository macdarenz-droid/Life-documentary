// The model ports of the episode pipeline (P12, D38). The pipeline passes every model id, prompt and
// limit in; adapters in providers/ make the call, report what came back and decide nothing.

export type TranscribeInput = {
  model: string;
  body: ReadableStream<Uint8Array>;
  contentType: string;
};

/** What the model heard; `language` and `seconds` only when it said so. */
/** A timed word or stretch of speech, in whole ms. */
export type TimedWord = { text: string; startMs: number; endMs: number };
export type TimedSegment = TimedWord & { words?: TimedWord[] };
export type Transcription = {
  text: string;
  language?: string;
  seconds?: number;
  segments?: TimedSegment[];
};

export interface Transcriber {
  transcribe(input: TranscribeInput): Promise<Transcription>;
}

/** One image to caption; `id` comes back with its result. */
export type CaptionItem = { id: string; jpegBase64: string };

export type CaptionRequest = { model: string; system: string; userText: string; maxTokens: number };

export type BatchStatus = 'in_progress' | 'canceling' | 'ended';

export type CaptionOutcome = 'succeeded' | 'errored' | 'canceled' | 'expired';

export type CaptionResult = {
  id: string;
  outcome: CaptionOutcome;
  /** The model's text, when it answered. */
  text?: string;
  /** Why the model stopped (e.g. `end_turn`, `max_tokens`, `refusal`), when it answered. */
  stopReason?: string;
  inputTokens: number;
  outputTokens: number;
};

/** Captions in batches: sent once, polled, read in any order, cancelled, then removed at the vendor. */
export interface Captioner {
  submit(items: CaptionItem[], request: CaptionRequest): Promise<string>;
  status(batchId: string): Promise<BatchStatus>;
  results(batchId: string): AsyncIterable<CaptionResult>;
  cancel(batchId: string): Promise<void>;
  remove(batchId: string): Promise<void>;
}

/** One turn of the planning conversation: the brief, an earlier answer, or its errors. */
export type PlanMessage = { role: 'user' | 'assistant'; text: string };

export type PlanRequest = {
  model: string;
  system: string;
  messages: PlanMessage[];
  effort: 'low' | 'medium' | 'high';
  maxTokens: number;
};

export type PlanUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
};

/** The model's raw answer: its text when it wrote any, why it stopped, and what it used. */
export type PlanAnswer = { text?: string; stopReason: string; usage: PlanUsage };

/** Plans an episode (P13, D39). The answer is reported as it came back; the pipeline checks it. */
export interface Planner {
  plan(request: PlanRequest): Promise<PlanAnswer>;
}

export type SpeakRequest = {
  /** The vendor's voice id (from `vendorVoice`), never our own id. */
  voiceId: string;
  text: string;
  modelId: string;
  outputFormat: string;
  languageCode: string;
};

/** When each character of the spoken text starts and ends, in seconds. */
export type SpeechAlignment = {
  characters: string[];
  startSeconds: number[];
  endSeconds: number[];
};

/** The audio, its character alignment when the vendor gave one, and the characters it billed. */
export type Speech = { audio: Uint8Array; alignment: SpeechAlignment | null; characters: number };

/** Speaks one narrator line (P14, D40). The answer is reported as it came back. */
export interface Narrator {
  speak(request: SpeakRequest): Promise<Speech>;
}

export type PipelineProviders = {
  transcriber: Transcriber;
  captioner: Captioner;
  planner: Planner;
  narrator: Narrator;
};
