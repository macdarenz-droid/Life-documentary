import { permissionWords } from './permissions';
import { monthAndYear } from './recap';

/** What a Footage row's spoken label is built from; every part but kind and time is optional. */
export type FootageRowLabel = {
  kind: string;
  time: string;
  duration?: string;
  text?: string;
  mood?: string;
  onThisPhone?: boolean;
};

/** Every user-facing string, in the voice of DESIGN §8 (CLAUDE.md rule 11; the words test checks it). */
export const words = {
  documentary: {
    defaultTitle: 'My documentary',
  },
  permissions: permissionWords,
  today: {
    placeholderTitle: 'Life Documentary',
    placeholderLine: 'Your first question will be here soon.',
    modeLabel: 'Record with',
    modeVideo: 'Video',
    modeVoice: 'Voice',
    holdLonger: 'That was too short to save. Hold a bit longer.',
    secondsLeft: (n: number) => (n === 1 ? '1 second left' : `${n} seconds left`),
    startRecording: 'Start recording',
    stopRecording: 'Stop recording',
    openSettings: 'Open Settings',
    couldNotSave: "Couldn't save that. Give it another try.",
    cameraNotReady: "The camera didn't start in time. Give it another try.",
    photoFailed: "Couldn't take the photo. Give it another try.",
  },
  extras: {
    photo: 'Photo',
    fromLibrary: 'From library',
    note: 'Note',
    place: 'Place',
    noteLabel: 'A line about today',
    save: 'Save',
    close: 'Close',
    clipTooLong: 'That clip is over a minute long. Pick a shorter one.',
    clipUnreadable: "Couldn't open that clip. Try a different one.",
    moodLabel: 'Mood',
    placeLabel: 'Add place',
    placeUse: 'Use this place',
    placeNotFound: "Couldn't find a name for this place.",
    keepOnPhone: 'Keep on this phone',
    keepOnPhoneHelp: 'This moment stays on this phone and is never used in episodes.',
    saved: 'Saved',
    takePhoto: 'Take photo',
    flip: 'Flip camera',
    cancel: 'Cancel',
  },
  moods: {
    bright: 'Bright',
    calm: 'Calm',
    tender: 'Tender',
    tired: 'Tired',
    heavy: 'Heavy',
  },
  tags: {
    tag: 'Tag',
    trayLabel: 'Tag this moment',
    storylines: 'Storylines',
    cast: 'Cast',
    newStoryline: 'New storyline',
    namePerson: 'Name a person',
    addStoryline: 'Add storyline',
    addPerson: 'Add person',
    done: 'Done',
    titleEmpty: 'Give the storyline a name.',
    titleTooLong: 'A storyline name can be up to 60 characters.',
    titleTaken: 'An open storyline already has this name.',
    nameInvalid: 'A name can be up to 40 characters.',
    relationInvalid: 'Use up to 40 characters for how you know them.',
    tooManyStorylines: 'You can tag a moment with up to 10 storylines.',
    tooManyCast: 'You can tag up to 20 people in a moment.',
    unavailable: "That's been removed, so the change didn't save.",
  },
  nav: {
    today: 'Today',
    footage: 'Footage',
    storylines: 'Storylines',
    cast: 'Cast',
    settings: 'Settings',
  },
  storylines: {
    title: 'Storylines',
    since: (openedOn: string) => `since ${monthAndYear(openedOn)}`,
    moments: (n: number) => (n === 1 ? '1 moment' : `${n} moments`),
    closed: 'Closed',
    newStoryline: 'New storyline',
    titleLabel: 'Name',
    save: 'Save',
    rename: 'Rename',
    close: 'Close storyline',
    reopen: 'Reopen',
    remove: 'Remove',
    removeAsk: 'Remove this storyline? The moments tagged with it stay in your documentary.',
    removeConfirm: 'Remove it',
    keep: 'Keep it',
    changeFailed: "Couldn't save that change. Give it another try.",
    empty:
      'A storyline is something going on in your life that you want to follow for a while, like a new job or training for a half marathon.',
  },
  cast: {
    title: 'Cast',
    namePerson: 'Name a person',
    nameLabel: 'Name',
    relationLabel: 'How you know them (optional)',
    save: 'Save',
    rename: 'Rename',
    saveRelation: 'Save',
    remove: 'Remove',
    removeAsk:
      'Remove this person? The moments with them stay in your documentary, just without their name.',
    removeConfirm: 'Remove them',
    changeFailed: "Couldn't save that change. Give it another try.",
    keep: 'Keep them',
    empty:
      'Name the people in your days. Names stay on this phone, and Life Documentary never recognises faces or voices.',
  },
  reminders: {
    notificationTitle: "Today's question",
    notificationBody: 'It takes ten seconds to answer.',
    channelName: 'Daily question',
    settingsTitle: 'Settings',
    dailyQuestion: 'Daily question',
    dailyQuestionHelp: 'One reminder a day, at the time you choose.',
    time: 'Time',
    hour: 'Hour',
    minutes: 'Minute',
    earlier: 'Earlier',
    later: 'Later',
    /** The spoken label of a time button: the hour moves by 1, the minute by 15. */
    step: (unit: 'hour' | 'minute', direction: 1 | -1) =>
      unit === 'hour'
        ? direction < 0
          ? 'An hour earlier'
          : 'An hour later'
        : direction < 0
          ? '15 minutes earlier'
          : '15 minutes later',
    denied:
      "Notifications are off for Life Documentary. You can turn them on in your phone's Settings.",
    offerLine: 'Want a reminder for the daily question? Just one a day.',
    offerAccept: 'Remind me each morning',
    offerDismiss: 'Not now',
  },
  footage: {
    title: 'Footage',
    days: 'Days',
    storylines: 'Storylines',
    empty: 'Nothing here yet.',
    storylinesEmpty: "Tag a moment with a storyline and it'll show up here.",
    storylineEmpty: 'No moments in this storyline yet.',
    onThisPhone: 'On this phone',
    seconds: (n: number) => (n === 1 ? '1 second' : `${n} seconds`),
    minutes: (n: number) => (n === 1 ? '1 minute' : `${n} minutes`),
    /** A row as a screen reader says it: "Answer, 08:14, 7 seconds. What stayed with you today? On this phone". */
    rowLabel: (row: FootageRowLabel) => {
      const head = [row.kind, row.time, row.duration].filter(Boolean).join(', ');
      const parts = [
        head,
        row.text,
        row.mood,
        row.onThisPhone ? 'On this phone' : undefined,
      ].filter((part): part is string => Boolean(part));
      return parts
        .map((part, i) => (i < parts.length - 1 && !/[.?]$/.test(part) ? `${part}.` : part))
        .join(' ');
    },
    open: 'Open',
    close: 'Close',
    play: 'Play',
    pause: 'Pause',
    cannotOpen: "Couldn't open this moment.",
    kinds: { answer: 'Answer', clip: 'Clip', photo: 'Photo', note: 'Note' },
    noteEmpty: "A note can't be empty.",
    noteTooLong: 'A note can be up to 280 characters.',
    unavailable: "This moment was deleted, so the change didn't save.",
    edit: 'Edit',
    editLabel: 'Edit this moment',
    noteLabel: 'Note',
    mood: 'Mood',
    done: 'Done',
    delete: 'Delete',
    deleteAsk:
      "Delete this moment? It'll be gone from this phone for good. Nothing else in your documentary changes.",
    deleteConfirm: 'Delete it',
    keep: 'Keep it',
    next: 'Next',
    oneYearAgo: 'One year ago today',
  },
  deletePage: {
    title: 'Delete your Life Documentary account',
    intro: "Enter the email address on your account and we'll send you a six-digit code.",
    emailLabel: 'Email address',
    sendCode: 'Send the code',
    codeSent: (email: string) => `Enter the code we sent to ${email}. It works for 5 minutes.`,
    codeLabel: 'Six-digit code',
    checkCode: 'Continue',
    emailInvalid: "That email address doesn't look right. Check it and try again.",
    codeWrong: "That code didn't work. Check it and try again, or get a new one.",
    confirmLine:
      'Deleting removes your account and everything in it: your documentaries, moments and episodes.',
    deleteButton: 'Delete my account',
    done: (date: string) =>
      `Your account and everything in it will be deleted on ${date}, 30 days from now.`,
    howToCancel: 'To cancel, sign in to the app again before then.',
    refused: 'This request did not come from this page.',
    tooManyCodes: "You've asked for a lot of codes. Wait 10 minutes, then try again.",
  },
  account: {
    intro:
      'You can use Life Documentary on this phone without an account. Sign in to get your weekly episodes.',
    deleteAsk:
      'Delete your account? Everything in it will be deleted after 30 days. To cancel, sign in again before then.',
    deleteConfirm: 'Delete my account',
    keep: 'Keep it',
    deleted: (date: string) =>
      `Your account will be deleted on ${date}. To cancel, sign in again before then.`,
    linkFailed: "Couldn't link this phone to your account. Try again later.",
  },
  mail: {
    codeSubject: 'Your Life Documentary code',
    codeText: (code: string) => `Your Life Documentary code is ${code}. It works for 5 minutes.`,
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

export * from './voice';

export const bannedWords = ['streak', 'badge', 'level up', 'leaderboard', 'points', 'xp'] as const;
export * from './recap';
