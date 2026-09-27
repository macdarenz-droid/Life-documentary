// The episode timeline (P15, D41): the one owner of where every part of an episode sits. It places the
// cold open, the title, a slot for each kept bridge, the shots with their own sound, the closing and the
// tease, keeps the narrator off the person's voice, carries the words for captions and the music. The
// renderer only draws the result; missing parts are left out, never replaced (rule 10).
import {
  RenderManifestV2,
  type EpisodePlanV1,
  type KenBurns,
  type RenderManifestV2Input,
  type TimedWord,
} from '@life/contracts';
import { CLOSING_MS, TITLE_CARD_MS, shotMs } from '../plan/shots';
import { episodeWords } from '../words/episode';

export type TimelineMoment = {
  momentId: string;
  kind: 'answer' | 'clip' | 'photo';
  media: { type: 'video' | 'voice' | 'photo'; src: string; durationMs?: number };
  question?: string;
  words?: { words: TimedWord[]; approximate: boolean };
};

export type TimelineNarration = {
  kind: 'bridge' | 'tease';
  sceneIndex?: number;
  src: string;
  durationMs: number;
  words: TimedWord[];
};

export type EpisodeTimelineInput = {
  plan: EpisodePlanV1;
  format: 'portrait' | 'landscape';
  /** Only the moments that have media. */
  moments: TimelineMoment[];
  cast: { id: string; name: string; relation?: string }[];
  storylines: { id: string; title: string }[];
  episodeNumber: number;
  weekStart: string;
  weekEnd: string;
  /** The kept narrator clips. */
  narration: TimelineNarration[];
  music?: { src: string };
};

const MIN_SEGMENT_MS = 500;
const SLOT_LEAD_MS = 400;
const SLOT_TAIL_MS = 600;
const TRIM_BEFORE_MS = 300;
const TRIM_AFTER_MS = 500;
const LABEL_MS = 2000;
const LOWER_THIRD_DELAY_MS = 500;
const LOWER_THIRD_MS = 3000;
const LOWER_THIRD_MIN_MS = 1000;
const MAX_WORDS = 200;
const MUSIC_GAIN = 0.6;
const MUSIC_DUCK_TO = 0.15;
const DEFAULT_KEN_BURNS: KenBurns = { fromScale: 1, toScale: 1.06 };
const FORMATS = {
  portrait: { width: 1080, height: 1920 },
  landscape: { width: 1920, height: 1080 },
} as const;

type Manifest = RenderManifestV2Input;
type Segment = Manifest['segments'][number];
type SegmentMedia = Extract<Segment, { kind: 'shot' }>['media'];
type Background = Extract<Segment, { kind: 'closing' }>['background'];
type Speech = Manifest['speech'][number];

/** A cold open or shot before it is placed: what it shows and its span in the moment's own time. */
type Piece = { moment: TimelineMoment; fromMs: number; toMs: number; kenBurns?: KenBurns };

const fits = (text: string | undefined, max: number): text is string =>
  text !== undefined && text.length >= 1 && text.length <= max;

/** Words inside [from, to] of the moment's own time. */
function wordsIn(moment: TimelineMoment, from: number, to: number): TimedWord[] {
  return (moment.words?.words ?? []).filter((w) => w.fromMs >= from && w.toMs <= to);
}

/** An answer's span cut to 300 ms before its first word and 500 ms after its last (exact words only). */
function trimmed(moment: TimelineMoment, from: number, to: number): [number, number] {
  if (moment.kind !== 'answer' || !moment.words || moment.words.approximate) return [from, to];
  const inside = wordsIn(moment, from, to);
  const first = inside[0];
  const last = inside.at(-1);
  if (!first || !last) return [from, to];
  return [Math.max(from, first.fromMs - TRIM_BEFORE_MS), Math.min(to, last.toMs + TRIM_AFTER_MS)];
}

const lengthOf = (moment: TimelineMoment) =>
  shotMs({ kind: moment.kind, durationMs: moment.media.durationMs });

function mediaOf(piece: Piece): SegmentMedia {
  const { moment } = piece;
  if (moment.media.type === 'photo') {
    return { type: 'photo', src: moment.media.src, kenBurns: piece.kenBurns ?? DEFAULT_KEN_BURNS };
  }
  if (moment.media.type === 'voice') {
    return {
      type: 'voice',
      src: moment.media.src,
      inMs: piece.fromMs,
      ...(fits(moment.question, 200) ? { question: moment.question } : {}),
    };
  }
  return {
    type: 'video',
    src: moment.media.src,
    inMs: piece.fromMs,
    sound: moment.kind === 'answer' ? 'full' : 'natural',
  };
}

function backgroundOf(moment: TimelineMoment | undefined, kenBurns?: KenBurns): Background {
  if (!moment) return undefined;
  if (moment.media.type === 'photo') {
    return { type: 'photo', src: moment.media.src, kenBurns: kenBurns ?? DEFAULT_KEN_BURNS };
  }
  if (moment.media.type === 'video') return { type: 'video', src: moment.media.src, inMs: 0 };
  return undefined;
}

/** Words moved to episode time: shifted by `shift`, clamped to [from, to], the first 200 kept. */
function placedWords(words: readonly TimedWord[], shift: number, from: number, to: number) {
  return words
    .map((w) => ({
      text: w.text,
      fromMs: Math.max(from, w.fromMs + shift),
      toMs: Math.min(to, w.toMs + shift),
    }))
    .filter((w) => w.toMs > w.fromMs)
    .slice(0, MAX_WORDS);
}

type Built = { manifest: Manifest; shots: number; placed: Placed[] };
/** A narrator clip on the timeline, in the order it is dropped when the share is too high. */
type Placed = { clip: TimelineNarration; sceneIndex: number };

/** Builds the timeline with only the narrator clips in `keep`. */
function build(input: EpisodeTimelineInput, keep: ReadonlySet<TimelineNarration>): Built {
  const { plan } = input;
  const moments = new Map(input.moments.map((m) => [m.momentId, m]));
  const segments: Segment[] = [];
  const narration: Manifest['narration'] = [];
  const speech: Speech[] = [];
  const sceneLabels: Manifest['sceneLabels'] = [];
  const firstShotOf = new Map<string, { fromMs: number; toMs: number }>();
  const placed: Placed[] = [];
  let at = 0;
  let shots = 0;

  const place = (piece: Piece, kind: 'coldOpen' | 'shot', captions: boolean) => {
    const fromMs = at;
    const toMs = at + (piece.toMs - piece.fromMs);
    segments.push({ kind, fromMs, toMs, media: mediaOf(piece) });
    if (piece.moment.kind === 'answer') {
      speech.push({
        kind: 'person',
        fromMs,
        toMs,
        captions,
        approximate: piece.moment.words?.approximate ?? false,
        words: placedWords(
          wordsIn(piece.moment, piece.fromMs, piece.toMs),
          fromMs - piece.fromMs,
          fromMs,
          toMs,
        ),
      });
    }
    at = toMs;
    return { fromMs, toMs };
  };

  const slot = (clip: TimelineNarration, segment: (fromMs: number, toMs: number) => Segment) => {
    const fromMs = at;
    const toMs = at + SLOT_LEAD_MS + clip.durationMs + SLOT_TAIL_MS;
    const speakAt = fromMs + SLOT_LEAD_MS;
    segments.push(segment(fromMs, toMs));
    narration.push({ src: clip.src, atMs: speakAt, durationMs: clip.durationMs });
    speech.push({
      kind: 'narrator',
      fromMs: speakAt,
      toMs: speakAt + clip.durationMs,
      captions: true,
      approximate: false,
      words: placedWords(clip.words, speakAt, speakAt, speakAt + clip.durationMs),
    });
    at = toMs;
  };

  /** A piece for a moment with media and at least 500 ms to show, else null. */
  const pieceOf = (
    momentId: string,
    span: { inMs?: number | undefined; outMs?: number | undefined },
    kenBurns?: KenBurns,
  ): Piece | null => {
    const moment = moments.get(momentId);
    if (!moment) return null;
    let from = 0;
    let to = lengthOf(moment);
    if (moment.kind === 'answer') {
      from = span.inMs ?? 0;
      to = span.outMs ?? moment.media.durationMs ?? to;
      [from, to] = trimmed(moment, from, to);
    } else if (moment.kind === 'clip') {
      from = span.inMs ?? 0;
      to = span.outMs ?? from + to;
    }
    if (to - from < MIN_SEGMENT_MS) return null;
    return { moment, fromMs: from, toMs: to, ...(kenBurns ? { kenBurns } : {}) };
  };

  const coldOpen = pieceOf(plan.coldOpen.momentId, plan.coldOpen);
  if (coldOpen) place(coldOpen, 'coldOpen', true);

  segments.push({
    kind: 'title',
    fromMs: at,
    toMs: at + TITLE_CARD_MS,
    label: episodeWords.label(input.episodeNumber),
    text: plan.title,
    subtitle: plan.subtitle ?? episodeWords.dates(input.weekStart, input.weekEnd),
  });
  at += TITLE_CARD_MS;

  plan.scenes.forEach((scene, sceneIndex) => {
    const pieces = scene.shots.flatMap((shot) => {
      const piece = pieceOf(shot.momentId, shot, shot.kenBurns);
      return piece ? [piece] : [];
    });
    if (pieces.length === 0) return;
    const bridge = input.narration.find(
      (c) => c.kind === 'bridge' && c.sceneIndex === sceneIndex && keep.has(c),
    );
    if (bridge) {
      const photo = pieces.find((p) => p.moment.kind === 'photo');
      const clip = pieces.find((p) => p.moment.kind === 'clip');
      const background =
        photo !== undefined
          ? backgroundOf(photo.moment, photo.kenBurns)
          : clip !== undefined
            ? { type: 'video' as const, src: clip.moment.media.src, inMs: clip.fromMs }
            : undefined;
      slot(bridge, (fromMs, toMs) => ({
        kind: 'sceneOpen',
        fromMs,
        toMs,
        heading: scene.heading,
        ...(background ? { background } : {}),
      }));
      placed.push({ clip: bridge, sceneIndex });
    }
    pieces.forEach((piece, i) => {
      const span = place(piece, 'shot', scene.captionsFromTranscript);
      shots += 1;
      if (!firstShotOf.has(piece.moment.momentId)) firstShotOf.set(piece.moment.momentId, span);
      if (i === 0 && !bridge) {
        sceneLabels.push({
          atMs: span.fromMs,
          durationMs: Math.min(LABEL_MS, span.toMs - span.fromMs),
          text: scene.heading,
        });
      }
    });
  });

  const closingBackground = backgroundOf(moments.get(plan.closing.momentId));
  segments.push({
    kind: 'closing',
    fromMs: at,
    toMs: at + CLOSING_MS,
    text: episodeWords.closing,
    credit: 'AI-narrated',
    ...(closingBackground ? { background: closingBackground } : {}),
  });
  at += CLOSING_MS;

  const tease = input.narration.find((c) => c.kind === 'tease' && keep.has(c));
  if (tease && plan.tease) {
    const title = input.storylines.find((s) => s.id === plan.tease?.storylineId)?.title;
    slot(tease, (fromMs, toMs) => ({
      kind: 'tease',
      fromMs,
      toMs,
      label: episodeWords.next,
      ...(fits(title, 60) ? { storyline: title } : {}),
    }));
    placed.push({ clip: tease, sceneIndex: Number.POSITIVE_INFINITY });
  }

  const lowerThirds: Manifest['lowerThirds'] = [];
  for (const third of plan.lowerThirds) {
    const shot = firstShotOf.get(third.momentId);
    const person = input.cast.find((c) => c.id === third.castId);
    if (!shot || !person || !fits(person.name, 40)) continue;
    const atMs = shot.fromMs + LOWER_THIRD_DELAY_MS;
    const durationMs = Math.min(LOWER_THIRD_MS, shot.toMs - shot.fromMs - LOWER_THIRD_DELAY_MS);
    if (durationMs < LOWER_THIRD_MIN_MS) continue;
    const overlaps = lowerThirds.some(
      (l) => atMs < l.atMs + l.durationMs && l.atMs < atMs + durationMs,
    );
    if (overlaps) continue;
    lowerThirds.push({
      atMs,
      durationMs,
      name: person.name,
      ...(fits(person.relation, 40) ? { relation: person.relation } : {}),
    });
  }

  return {
    shots,
    placed,
    manifest: {
      version: 2,
      format: FORMATS[input.format],
      fps: 30,
      durationMs: at,
      segments,
      narration,
      speech,
      sceneLabels,
      lowerThirds,
      ...(input.music
        ? { music: { src: input.music.src, gain: MUSIC_GAIN, duckTo: MUSIC_DUCK_TO } }
        : {}),
    },
  };
}

function speechMs(m: Pick<Manifest, 'speech'>): { narrator: number; all: number } {
  let narrator = 0;
  let all = 0;
  for (const unit of m.speech) {
    const ms = unit.toMs - unit.fromMs;
    all += ms;
    if (unit.kind === 'narrator') narrator += ms;
  }
  return { narrator, all };
}

/**
 * Places every part of the episode and returns the checked manifest, or `null` when no shot is left.
 * While the narrator speaks more than a quarter of the time, the tease goes first, then bridges from
 * the last scene backwards, each with its slot.
 */
export function episodeTimeline(input: EpisodeTimelineInput): RenderManifestV2 | null {
  const keep = new Set(input.narration);
  let built = build(input, keep);
  for (;;) {
    const { narrator, all } = speechMs(built.manifest);
    if (narrator * 4 <= all) break;
    const last = [...built.placed].sort((a, b) => b.sceneIndex - a.sceneIndex)[0];
    if (!last) break;
    keep.delete(last.clip);
    built = build(input, keep);
  }
  if (built.shots === 0) return null;
  const manifest = RenderManifestV2.parse(built.manifest);
  const errors = manifestErrors(manifest);
  if (errors.length > 0) throw new Error(`The episode timeline is not valid: ${errors.join('; ')}`);
  return manifest;
}

type Interval = { fromMs: number; toMs: number };
const overlap = (a: Interval, b: Interval) => a.fromMs < b.toMs && b.fromMs < a.toMs;

/** Every way a v2 manifest breaks the timeline rules; empty when it is sound. */
export function manifestErrors(m: RenderManifestV2): string[] {
  const errors: string[] = [];
  const { segments } = m;

  let at = 0;
  segments.forEach((s, i) => {
    if (s.fromMs !== at) errors.push(`segment ${i} starts at ${s.fromMs} ms, not ${at} ms`);
    if (s.toMs - s.fromMs < MIN_SEGMENT_MS) errors.push(`segment ${i} is shorter than 500 ms`);
    at = s.toMs;
  });
  if (at !== m.durationMs) errors.push(`the segments end at ${at} ms, not ${m.durationMs} ms`);

  const indices = (kind: Segment['kind']) =>
    segments.flatMap((s, i) => (s.kind === kind ? [i] : []));
  const titles = indices('title');
  const closings = indices('closing');
  const lastShot = indices('shot').at(-1) ?? -1;
  if (titles.length !== 1) errors.push(`there are ${titles.length} titles, not one`);
  if (closings.length !== 1) errors.push(`there are ${closings.length} closings, not one`);
  if (closings.some((i) => i < lastShot)) errors.push('the closing comes before a shot');
  if (indices('coldOpen').some((i) => i !== 0)) errors.push('the cold open is not first');
  if (indices('tease').some((i) => i !== segments.length - 1)) errors.push('the tease is not last');

  const slots = segments.filter((s) => s.kind === 'sceneOpen' || s.kind === 'tease');
  m.narration.forEach((n, i) => {
    const clip = { fromMs: n.atMs, toMs: n.atMs + n.durationMs };
    if (!slots.some((s) => clip.fromMs >= s.fromMs && clip.toMs <= s.toMs)) {
      errors.push(`narration ${i} is outside a scene opening or the tease`);
    }
  });

  m.speech.forEach((a, i) => {
    m.speech.forEach((b, j) => {
      if (j > i && overlap(a, b)) errors.push(`speech ${i} overlaps speech ${j}`);
    });
    a.words.forEach((w, k) => {
      if (w.fromMs < a.fromMs || w.toMs > a.toMs)
        errors.push(`word ${k} of speech ${i} is outside it`);
    });
  });
  const { narrator, all } = speechMs(m);
  if (narrator * 4 > all) errors.push('the narrator speaks more than a quarter of the time');

  m.lowerThirds.forEach((l, i) => {
    if (l.atMs + l.durationMs > m.durationMs)
      errors.push(`lower third ${i} ends after the episode`);
    m.lowerThirds.forEach((o, j) => {
      const a = { fromMs: l.atMs, toMs: l.atMs + l.durationMs };
      const b = { fromMs: o.atMs, toMs: o.atMs + o.durationMs };
      if (j > i && overlap(a, b)) errors.push(`lower third ${i} overlaps lower third ${j}`);
    });
  });
  m.sceneLabels.forEach((l, i) => {
    if (l.atMs + l.durationMs > m.durationMs)
      errors.push(`scene label ${i} ends after the episode`);
  });
  return errors;
}
