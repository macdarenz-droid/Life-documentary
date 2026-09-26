/** Font family names as exported by @expo-google-fonts/instrument-serif and @expo-google-fonts/inter. */
export const fontFamily = {
  display: 'InstrumentSerif_400Regular',
  displayItalic: 'InstrumentSerif_400Regular_Italic',
  text: 'Inter_400Regular',
  textStrong: 'Inter_600SemiBold',
} as const;

export type TypeVariant = {
  readonly size: number;
  readonly lineHeight: number;
  readonly family: string;
  readonly letterSpacing: number;
  readonly textTransform?: 'uppercase';
  readonly fontVariant?: readonly 'tabular-nums'[];
};

const LABEL_SIZE = 12;
/** Label tracking: +6 % of the size. */
const LABEL_TRACKING = 0.06;

/** Type variants (DESIGN §2). No size between 17 and 33 pt (DESIGN §1 rule 2). */
export const type = {
  display64: { size: 64, lineHeight: 70, family: fontFamily.display, letterSpacing: 0 },
  display48: { size: 48, lineHeight: 54, family: fontFamily.display, letterSpacing: 0 },
  display34: { size: 34, lineHeight: 40, family: fontFamily.display, letterSpacing: 0 },
  question: { size: 34, lineHeight: 40, family: fontFamily.displayItalic, letterSpacing: 0 },
  body: { size: 16, lineHeight: 24, family: fontFamily.text, letterSpacing: 0 },
  bodyStrong: { size: 16, lineHeight: 24, family: fontFamily.textStrong, letterSpacing: 0 },
  label: {
    size: LABEL_SIZE,
    lineHeight: 16,
    family: fontFamily.textStrong,
    letterSpacing: Math.round(LABEL_SIZE * LABEL_TRACKING * 100) / 100,
    textTransform: 'uppercase',
  },
  caption: { size: 13, lineHeight: 18, family: fontFamily.text, letterSpacing: 0 },
  timecode: {
    size: 13,
    lineHeight: 18,
    family: fontFamily.textStrong,
    letterSpacing: 0,
    fontVariant: ['tabular-nums'],
  },
} as const satisfies Record<string, TypeVariant>;
