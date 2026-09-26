const palette = {
  theatreBlack: '#0A0A0C',
  velvet: '#1A1418',
  screenWhite: '#F4F1EC',
  filmAmber: '#E0A458',
  projectorCyan: '#7FD1E6',
} as const;

export const tokens = {
  color: {
    ...palette,
    background: palette.theatreBlack,
    surface: palette.velvet,
    text: palette.screenWhite,
    accent: palette.filmAmber,
    focus: palette.projectorCyan,
  },
  space: [0, 4, 8, 12, 16, 24, 32, 48, 64],
  radius: { sm: 6, md: 12, lg: 20 },
  font: { size: { caption: 13, body: 16, title: 22, display: 34 } },
  motion: { durationMs: { fast: 150, base: 250, slow: 450 } },
} as const;

export type Tokens = typeof tokens;
