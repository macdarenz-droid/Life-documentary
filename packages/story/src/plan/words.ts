// The voice rules on a plan's words (DESIGN §8) and the rule that the narrator never speaks the
// person's words (VISION). Errors name the field and the banned item only, never the plan's text.
import type { EpisodePlanV1, WeekBriefV1 } from '@life/contracts';
import { voiceBannedCharacters, voiceBannedPhrases } from '../words/voice';

const COPY_RUN = 5;

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const phrasePatterns = voiceBannedPhrases.map(
  (phrase) => [phrase, new RegExp(`\\b${escape(phrase)}\\b`, 'i')] as const,
);

function planTexts(plan: EpisodePlanV1): { field: string; text: string }[] {
  return [
    { field: 'title', text: plan.title },
    ...(plan.subtitle !== undefined ? [{ field: 'subtitle', text: plan.subtitle }] : []),
    ...plan.scenes.flatMap((scene, s) => [
      { field: `scene ${s} heading`, text: scene.heading },
      ...(scene.narratorBridge
        ? [{ field: `scene ${s} bridge`, text: scene.narratorBridge.text }]
        : []),
    ]),
    ...(plan.tease ? [{ field: 'tease', text: plan.tease.text }] : []),
    { field: 'summary', text: plan.summary },
  ];
}

/** One error per banned phrase (whole words, any case) or banned character in the plan's words. */
export function planVoiceErrors(plan: EpisodePlanV1): string[] {
  return planTexts(plan).flatMap(({ field, text }) => [
    ...phrasePatterns
      .filter(([, pattern]) => pattern.test(text))
      .map(([phrase]) => `${field} uses "${phrase}"`),
    ...voiceBannedCharacters
      .filter((char) => text.includes(char))
      .map((char) => `${field} uses "${char}"`),
  ]);
}

/** Lower case words with punctuation dropped. */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(' ')
    .filter((w) => w.length > 0);
}

function runs(words: readonly string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + COPY_RUN <= words.length; i++)
    out.push(words.slice(i, i + COPY_RUN).join(' '));
  return out;
}

/** One error per bridge or tease that repeats five or more words in a row from a transcript. */
export function planCopyErrors(plan: EpisodePlanV1, brief: WeekBriefV1): string[] {
  const spoken = new Set(
    brief.moments.flatMap((m) => (m.transcript !== undefined ? runs(wordsOf(m.transcript)) : [])),
  );
  const copies = (text: string) => runs(wordsOf(text)).some((run) => spoken.has(run));
  return [
    ...plan.scenes.flatMap((scene, s) =>
      scene.narratorBridge && copies(scene.narratorBridge.text)
        ? [`scene ${s} bridge repeats the person's words`]
        : [],
    ),
    ...(plan.tease && copies(plan.tease.text) ? ["tease repeats the person's words"] : []),
  ];
}
