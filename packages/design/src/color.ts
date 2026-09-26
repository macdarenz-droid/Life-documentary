/** Colour tokens (DESIGN §2). */
const theatreBlack = '#0A0A0C';
const velvet = '#1A1418';
const screenWhite = '#F4F1EC';
const filmAmber = '#E0A458';
const projectorCyan = '#7FD1E6';
/** Secondary text and dimmed chrome: screen white at 60 %. */
const ash = { hex: screenWhite, alpha: 0.6 } as const;
/** Gradient under text on footage: theatre black from 0 % to 85 %. */
const scrim = { hex: theatreBlack, from: 0, to: 0.85 } as const;

export const color = {
  theatreBlack,
  velvet,
  screenWhite,
  ash,
  filmAmber,
  projectorCyan,
  scrim,
  background: theatreBlack,
  surface: velvet,
  text: screenWhite,
  textSecondary: ash,
  accent: filmAmber,
  focus: projectorCyan,
} as const;

function channels(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match?.[1]) throw new Error(`Invalid hex colour: ${hex}`);
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** `rgba(r, g, b, a)` for a #RRGGBB colour at the given alpha. */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The opaque #RRGGBB colour of `hex` at `alpha` composited over `backgroundHex`. */
export function blendOver(hex: string, alpha: number, backgroundHex: string): string {
  const fg = channels(hex);
  const bg = channels(backgroundHex);
  const mixed = fg.map((c, i) => Math.round(c * alpha + (bg[i] ?? 0) * (1 - alpha)));
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
