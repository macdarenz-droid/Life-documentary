import { permissionWords } from './permissions';

/** Every user-facing string. Plain and warm; never game words or exclamation marks (CLAUDE.md rule 11). */
export const words = {
  documentary: {
    defaultTitle: 'My documentary',
  },
  permissions: permissionWords,
  today: {
    placeholderTitle: 'Life Documentary',
    placeholderLine: 'Your first question arrives soon.',
    modeLabel: 'Record with',
    modeVideo: 'Video',
    modeVoice: 'Voice',
    holdLonger: 'Hold a little longer to keep an answer.',
    secondsLeft: 'seconds left',
    startRecording: 'Start recording',
    stopRecording: 'Stop recording',
    openSettings: 'Open Settings',
    couldNotSave: 'This one could not be saved. Try once more.',
  },
  extras: {
    photo: 'Photo',
    fromLibrary: 'From library',
    note: 'Note',
    place: 'Place',
    noteLabel: 'A line about today',
    save: 'Save',
    close: 'Close',
    clipTooLong: 'Clips from the library can be up to a minute long. This one is longer.',
    clipUnreadable: 'This clip could not be read. Try another one.',
    moodLabel: 'Mood',
    placeLabel: 'Add the place',
    placeUse: 'Use this place',
    placeNotFound: 'No place name was found here.',
    keepOnPhone: 'Keep on this phone',
    keepOnPhoneHelp: 'This moment stays on this phone and is never used in episodes.',
    saved: 'Saved',
  },
  moods: {
    bright: 'Bright',
    calm: 'Calm',
    tender: 'Tender',
    tired: 'Tired',
    heavy: 'Heavy',
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
