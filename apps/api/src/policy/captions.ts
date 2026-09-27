// Which captions are kept (P12, D38, CLAUDE.md rule 7). A caption is kept only when the model ended
// normally, said something other than `unclear`, stayed short, and used none of the words below: they
// would name who someone is, guess their age or gender, or read their feelings.
const MAX_LENGTH = 300;

export const CAPTION_BANNED_WORDS = [
  'man',
  'men',
  'woman',
  'women',
  'boy',
  'boys',
  'girl',
  'girls',
  'guy',
  'guys',
  'lady',
  'ladies',
  'gentleman',
  'gentlemen',
  'he',
  'she',
  'him',
  'her',
  'his',
  'hers',
  'himself',
  'herself',
  'male',
  'female',
  'mother',
  'father',
  'mum',
  'mom',
  'dad',
  'son',
  'daughter',
  'wife',
  'husband',
  'grandmother',
  'grandfather',
  'old',
  'older',
  'elderly',
  'young',
  'younger',
  'teen',
  'teenage',
  'teenager',
  'toddler',
  'baby',
  'babies',
  'child',
  'children',
  'kid',
  'kids',
  'happy',
  'sad',
  'angry',
  'upset',
  'smiling',
  'smiles',
  'smile',
  'laughing',
  'crying',
  'tears',
  'excited',
  'worried',
  'bored',
  'tired',
  'lonely',
  'proud',
] as const;

const BANNED = new Set<string>(CAPTION_BANNED_WORDS);

/** The trimmed caption, or null when it may not be kept. */
export function keptCaption(
  text: string | undefined,
  stopReason: string | undefined,
): string | null {
  if (stopReason !== 'end_turn' || text === undefined) return null;
  const caption = text.trim();
  if (caption === '' || caption.length > MAX_LENGTH) return null;
  if (
    caption
      .replace(/[.!]+$/, '')
      .trim()
      .toLowerCase() === 'unclear'
  )
    return null;
  // Letters only, so a possessive or a contraction ("man's", "He's") still yields the listed word.
  const words = caption.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (words.some((word) => BANNED.has(word))) return null;
  return caption;
}
