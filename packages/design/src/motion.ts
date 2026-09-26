/** Critical damping scaled by ratio: c = ζ · 2 · √(k · m), rounded to the nearest integer. */
export function dampingFromRatio(ratio: number, stiffness: number, mass: number): number {
  return Math.round(ratio * 2 * Math.sqrt(stiffness * mass));
}

function spatial(ratio: number, stiffness: number, mass = 1) {
  return { mass, stiffness, damping: dampingFromRatio(ratio, stiffness, mass) };
}

/** Springs (DESIGN §2). Damping ratios: press, move, scene 0.9; effect 1.0. */
export const spring = {
  press: spatial(0.9, 1400),
  move: spatial(0.9, 700),
  scene: spatial(0.9, 300),
  effect: spatial(1.0, 1600),
  release: { duration: 400, dampingRatio: 0.85 },
} as const;

export const ease = {
  out: [0.23, 1, 0.32, 1],
  inOut: [0.77, 0, 0.175, 1],
  sheet: [0.32, 0.72, 0, 1],
  dissolve: [0.33, 0, 0.67, 1],
} as const;

export const duration = {
  press: 120,
  micro: 180,
  ui: 260,
  dissolve: 320,
  scene: 520,
  title: 900,
  titleHold: 2200,
} as const;

export const stagger = { list: 40, listCap: 6, word: 60, char: 22 } as const;
export const scale = { press: 0.97, enterFrom: 0.96, cardLift: 1.02 } as const;
export const texture = {
  grainOpacity: 0.035,
  grainFps: 24,
  crossfadeBlurPx: 3,
  kenBurns: { from: 1.0, to: 1.06, ms: 12000 },
} as const;
/** Text Morph: letters travel this fraction of the line height as they leave or arrive. */
export const textMorph = { shift: 0.3 } as const;
export const letterboxAspect = 2.39;

/** Every spatial motion falls back to a fade of this length when reduced motion is on. */
export const reducedMotion = { fadeMs: duration.micro } as const;

export const haptics = {
  detent: 'selection',
  recordStart: 'impactLight',
  recordStop: 'impactLight',
} as const;

export const motion = {
  spring,
  ease,
  duration,
  stagger,
  scale,
  texture,
  textMorph,
  letterboxAspect,
  reducedMotion,
} as const;
