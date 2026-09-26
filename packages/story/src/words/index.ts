/** Every user-facing string. Plain and warm; never game words or exclamation marks (CLAUDE.md rule 11). */
export const words = {
  documentary: {
    defaultTitle: 'My documentary',
  },
  today: {
    placeholderTitle: 'Life Documentary',
    placeholderLine: 'Your first question arrives soon.',
  },
  lab: {
    title: 'Design lab',
    replay: 'Play again',
    reducedMotionOn: 'Reduced motion is on',
  },
  button: {
    holdToAnswer: 'Hold to answer',
    recording: 'Recording',
    saved: 'Saved',
  },
} as const;

export const bannedWords = ['streak', 'badge', 'level up', 'leaderboard', 'points', 'xp'] as const;
export * from './recap';
