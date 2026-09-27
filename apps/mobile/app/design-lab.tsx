import { rgba, tokens } from '@life/design';
import { Question, Uuid } from '@life/contracts';
import { pickQuestion, questionTemplates, words } from '@life/story';
import { Image } from 'expo-image';
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Button, Field, Surface, Text, useMotionPreference } from '../src/design-system';
// Motion components are imported by file: GrainBreath needs Skia, which on web loads only after CanvasKit.
import { Dissolve } from '../src/design-system/motion/Dissolve';
import { TextMorph } from '../src/design-system/motion/TextMorph';
import { TitleCard } from '../src/design-system/motion/TitleCard';
import type { FootageDay, FootageItem } from '../src/application/footage';
import { CastScreen, type CastActions, type CastRow } from '../src/features/cast';
import {
  FootageScreen,
  MomentViewer,
  type EditActions,
  type FootageActions,
  type ViewerActions,
} from '../src/features/footage';
import {
  SettingsScreen,
  type ReminderChoice,
  type SettingsActions,
} from '../src/features/settings';
import { StorylinesScreen, type StorylineActions } from '../src/features/storylines';
import { TodayScreen, type TodayScreenProps } from '../src/features/today';
import { fakeCameraView } from '../src/services/testing/FakeCameraView';
import { fakePlayback } from '../src/services/testing/fakePlayback';
import { fakeServices } from '../src/services/testing/fakeServices';

/** Lab-only cadences and sample copy (T-003d); not product timing or product words. */
const MORPH_CYCLE_MS = 1500;
const DISSOLVE_CYCLE_MS = 2500;
const SAMPLE = {
  title: ['The Week', 'It Rained'],
  fieldEmpty: 'A note, empty',
  fieldFocused: 'A note, focused',
  fieldFocusedValue: 'Rain on the tram window',
  fieldError: 'A note, with an error',
  fieldErrorText: 'This note is empty',
} as const;
const MORPH_STEPS = [words.button.holdToAnswer, words.button.recording, words.button.saved];
// Metro bundles static images through require(); there are no image module types in this app.
/* eslint-disable @typescript-eslint/no-require-imports */
const FRAMES = [
  { key: 'dusk', source: require('../assets/lab/dusk.png') as number },
  { key: 'dawn', source: require('../assets/lab/dawn.png') as number },
] as const;
/* eslint-enable @typescript-eslint/no-require-imports */

/** The Today screen with fake services and a question from the real engine; saving keeps nothing. */
const LAB_DAY = '2027-03-15';
function labTodayProps(): TodayScreenProps {
  const services = fakeServices();
  const documentaryId = Uuid.parse('00000000-0000-4000-8000-00000000d0c1');
  const pick = pickQuestion({
    today: LAB_DAY,
    seed: documentaryId,
    templates: questionTemplates,
    openStorylines: [],
    recentDays: [],
    placesBefore: [],
    momentsOneYearAgo: 0,
    history: [],
  });
  const question = Question.parse({
    id: Uuid.parse('00000000-0000-4000-8000-00000000d0c2'),
    documentaryId,
    templateId: pick.templateId,
    reason: pick.reason,
    askedOn: LAB_DAY,
    text: pick.text,
  });
  return {
    loadQuestion: async () => question,
    save: async () => undefined,
    discard: async () => undefined,
    services,
    CameraView: fakeCameraView(services.video),
  };
}

/** Lab-only seed rows (not product words): the screens run on an in-page list, as the web preview has no
 * device store. */
function labStorylineActions(): StorylineActions {
  let n = 0;
  const id = () =>
    Uuid.parse(`00000000-0000-4000-8000-${(0x5100 + (n += 1)).toString(16).padStart(12, '0')}`);
  let rows = [
    { id: id(), title: 'The new job', openedOn: '2027-01-11', closed: false, momentCount: 14 },
    { id: id(), title: 'Half marathon', openedOn: '2027-02-02', closed: false, momentCount: 6 },
    { id: id(), title: 'Moving house', openedOn: '2026-10-20', closed: true, momentCount: 22 },
  ];
  const set = (target: string, patch: Partial<(typeof rows)[number]>) => {
    rows = rows.map((r) => (r.id === target ? { ...r, ...patch } : r));
  };
  return {
    load: async () => [...rows.filter((r) => !r.closed), ...rows.filter((r) => r.closed)],
    create: async (title) => {
      rows = [
        ...rows,
        { id: id(), title: title.trim(), openedOn: LAB_DAY, closed: false, momentCount: 0 },
      ];
    },
    rename: async (target, title) => set(target, { title: title.trim() }),
    close: async (target) => set(target, { closed: true }),
    reopen: async (target) => set(target, { closed: false }),
    remove: async (target) => {
      rows = rows.filter((r) => r.id !== target);
    },
  };
}

function labCastActions(): CastActions {
  let n = 0;
  const id = () =>
    Uuid.parse(`00000000-0000-4000-8000-${(0xca00 + (n += 1)).toString(16).padStart(12, '0')}`);
  let rows: CastRow[] = [
    { id: id(), name: 'Mara', relation: 'sister' },
    { id: id(), name: 'Sam' },
  ];
  return {
    load: async () => [...rows],
    add: async (name, relation) => {
      const r = relation?.trim();
      rows = [...rows, { id: id(), name: name.trim(), ...(r ? { relation: r } : {}) }];
    },
    rename: async (target, name) => {
      rows = rows.map((r) => (r.id === target ? { ...r, name: name.trim() } : r));
    },
    setRelation: async (target, relation) => {
      rows = rows.map((r) => {
        if (r.id !== target) return r;
        const next: CastRow = { id: r.id, name: r.name };
        if (relation) next.relation = relation.trim();
        return next;
      });
    },
    remove: async (target) => {
      rows = rows.filter((r) => r.id !== target);
    },
  };
}

/** Lab-only seed moments (not product words): three days, the first two with posters from the lab frames.
 * The web preview has no device store, so the screens run on in-page lists. */
const labId = (n: number) =>
  Uuid.parse(`00000000-0000-4000-8000-${(0xf000 + n).toString(16).padStart(12, '0')}`);
const LAB_ITEMS: FootageItem[] = [
  {
    id: labId(1),
    kind: 'answer',
    mediaKind: 'video',
    assetId: labId(101),
    timeLabel: '08:12',
    durationLabel: '0:09',
    questionText: 'What did the morning sound like?',
    storylineIds: [labId(201)],
    castIds: [],
    localOnly: false,
    hasPoster: true,
  },
  {
    id: labId(2),
    kind: 'note',
    timeLabel: '13:40',
    text: 'Lunch by the river, the first warm day.',
    storylineIds: [],
    castIds: [],
    localOnly: true,
    hasPoster: false,
  },
  {
    id: labId(3),
    kind: 'photo',
    mediaKind: 'photo',
    assetId: labId(103),
    timeLabel: '19:05',
    storylineIds: [labId(201)],
    castIds: [],
    localOnly: false,
    hasPoster: true,
  },
  {
    id: labId(4),
    kind: 'answer',
    mediaKind: 'audio',
    assetId: labId(104),
    timeLabel: '21:30',
    durationLabel: '0:07',
    questionText: 'Who made you laugh today?',
    storylineIds: [],
    castIds: [],
    localOnly: false,
    hasPoster: false,
  },
];
const LAB_DAYS: FootageDay[] = [
  { date: '2027-03-15', dayLabel: 'Monday 15 March', items: [LAB_ITEMS[0]!, LAB_ITEMS[1]!] },
  { date: '2027-03-14', dayLabel: 'Sunday 14 March', items: [LAB_ITEMS[2]!] },
  { date: '2027-03-12', dayLabel: 'Friday 12 March', items: [LAB_ITEMS[3]!] },
];

function labFootageActions(): FootageActions {
  return {
    loadDays: async (beforeDay) => LAB_DAYS.filter((d) => !beforeDay || d.date < beforeDay),
    loadStorylines: async () => [{ id: labId(201), title: 'The new job', closed: false, count: 2 }],
    loadStoryline: async (id) => LAB_ITEMS.filter((i) => i.storylineIds.includes(id)),
    poster: async (assetId) => (assetId === labId(101) ? FRAMES[0].source : FRAMES[1].source),
  };
}

function labViewerActions(): ViewerActions {
  return {
    load: async (id) => LAB_ITEMS.find((i) => i.id === id) ?? null,
    openOriginal: async (assetId) => `lab://${assetId}`,
    closeOriginal: async () => undefined,
  };
}

/** The edit tray's choices; changes are kept in memory for the page's life. */
function labEditActions(): EditActions {
  return {
    loadTags: async () => ({
      storylines: [
        { id: labId(201), title: 'The new job' },
        { id: labId(202), title: 'Half marathon' },
      ],
      cast: [{ id: labId(301), name: 'Mara', relation: 'sister' }],
    }),
    edit: async () => undefined,
    tag: async () => undefined,
    remove: async () => undefined,
  };
}

/** The reminder as if notifications were allowed; nothing is scheduled in the web preview. */
function labSettingsActions(): SettingsActions {
  let reminder: ReminderChoice = { enabled: true, hour: 8, minute: 0 };
  return {
    load: async () => ({ permission: 'granted', reminder }),
    request: async () => 'granted',
    save: async (choice) => {
      reminder = choice;
    },
    openSettings: () => undefined,
  };
}

const GrainBreath = lazy(async () => {
  if (Platform.OS === 'web') {
    const { LoadSkiaWeb } = await import('@shopify/react-native-skia/lib/module/web');
    await LoadSkiaWeb({ locateFile: (file: string) => `/${file}` });
  }
  const mod = await import('../src/design-system/motion/GrainBreath');
  return { default: mod.GrainBreath };
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="label" tone="secondary" accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

type ColourToken = (typeof tokens.color)[keyof typeof tokens.color];

function swatchHex(value: ColourToken): string {
  return typeof value === 'string' ? value : value.hex;
}

/** Translucent tokens show at their alpha; the scrim shows at its darkest stop. */
function swatchFill(value: ColourToken): string {
  if (typeof value === 'string') return value;
  return rgba(value.hex, 'alpha' in value ? value.alpha : value.to);
}

function useCycle(length: number, everyMs: number): number {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % length), everyMs);
    return () => clearInterval(id);
  }, [length, everyMs]);
  return i;
}

export default function DesignLab() {
  const { reduced } = useMotionPreference();
  const [text, setText] = useState('');
  const [titleRun, setTitleRun] = useState(0);
  const morph = useCycle(MORPH_STEPS.length, MORPH_CYCLE_MS);
  const frame = FRAMES[useCycle(FRAMES.length, DISSOLVE_CYCLE_MS)] ?? FRAMES[0];
  const [todayProps] = useState(labTodayProps);
  const [storylineActions] = useState(labStorylineActions);
  const [castActions] = useState(labCastActions);
  const [settingsActions] = useState(labSettingsActions);
  const [footage] = useState(labFootageActions);
  const [viewer] = useState(labViewerActions);
  const [edit] = useState(labEditActions);
  const [openMoment, setOpenMoment] = useState<Uuid | null>(null);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text variant="display34">{words.lab.title}</Text>

      <View style={styles.row}>
        {/* The Switch only shows the state; the text line below carries it for screen readers. */}
        <Switch
          value={reduced}
          disabled
          aria-hidden
          trackColor={{ false: tokens.color.surface, true: tokens.color.accent }}
        />
        {reduced ? <Text variant="body">{words.lab.reducedMotionOn}</Text> : null}
      </View>

      <Section title="Colour">
        {Object.entries(tokens.color).map(([name, value]) => (
          <View key={name} style={styles.row}>
            <View style={[styles.swatch, { backgroundColor: swatchFill(value) }]} />
            <Text variant="body">{name}</Text>
            <Text variant="timecode" tone="secondary">
              {swatchHex(value)}
            </Text>
          </View>
        ))}
      </Section>

      <Section title="Type">
        {(Object.keys(tokens.type) as (keyof typeof tokens.type)[]).map((variant) => (
          <Text key={variant} variant={variant} accessibilityRole="text">
            {variant}
          </Text>
        ))}
      </Section>

      <Section title="Buttons">
        <Button label={words.button.holdToAnswer} onPress={() => undefined} />
        <Button label={words.button.saved} variant="quiet" onPress={() => undefined} />
        <Button label={words.button.saved} disabled onPress={() => undefined} />
        <Button label={words.button.recording} haptic="impactLight" onPress={() => undefined} />
      </Section>

      <Section title="Field">
        <Field label={SAMPLE.fieldEmpty} value={text} onChangeText={setText} />
        <Field
          label={SAMPLE.fieldFocused}
          value={SAMPLE.fieldFocusedValue}
          onChangeText={() => undefined}
        />
        <Field
          label={SAMPLE.fieldError}
          value=""
          onChangeText={() => undefined}
          error={SAMPLE.fieldErrorText}
        />
      </Section>

      <Section title="Title Card">
        <Surface>
          <TitleCard key={titleRun} lines={[...SAMPLE.title]} variant="display48" play />
        </Surface>
        <Button
          label={words.lab.replay}
          variant="quiet"
          onPress={() => setTitleRun((n) => n + 1)}
        />
      </Section>

      <Section title="Text Morph">
        <TextMorph text={MORPH_STEPS[morph] ?? words.button.holdToAnswer} variant="bodyStrong" />
      </Section>

      <Section title="Dissolve">
        <Dissolve source={frame.source} recyclingKey={frame.key} style={styles.frame} />
      </Section>

      <Section title="Today">
        <View style={styles.today}>
          <TodayScreen {...todayProps} onNavigate={() => undefined} />
        </View>
      </Section>

      <Section title="Storylines">
        <View style={styles.list}>
          <StorylinesScreen actions={storylineActions} />
        </View>
      </Section>

      <Section title="Cast">
        <View style={styles.list}>
          <CastScreen actions={castActions} />
        </View>
      </Section>

      <Section title="Settings">
        <View style={styles.list}>
          <SettingsScreen actions={settingsActions} />
        </View>
      </Section>

      <Section title="Footage">
        <View style={styles.list}>
          <FootageScreen actions={footage} onOpen={setOpenMoment} />
        </View>
      </Section>

      {/* The viewer opens from a Footage row, as in the app. */}
      <Section title="Moment">
        <View style={styles.list}>
          {openMoment ? (
            <MomentViewer
              key={openMoment}
              id={openMoment}
              actions={viewer}
              Playback={fakePlayback}
              edit={edit}
              onClose={() => setOpenMoment(null)}
            />
          ) : null}
        </View>
      </Section>

      <Section title="Grain and Breath">
        <Suspense fallback={<View style={styles.frame} />}>
          <GrainBreath style={styles.frame}>
            <Image source={FRAMES[0].source} contentFit="cover" style={StyleSheet.absoluteFill} />
          </GrainBreath>
        </Suspense>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.background },
  content: { padding: tokens.space[5], gap: tokens.space[6] },
  section: { gap: tokens.space[3] },
  today: { height: 1040, overflow: 'hidden', borderRadius: tokens.radius.md },
  list: { height: 640, overflow: 'hidden', borderRadius: tokens.radius.md },
  sectionBody: { gap: tokens.space[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[3] },
  swatch: {
    width: tokens.space[6],
    height: tokens.space[6],
    borderRadius: tokens.radius.sm,
    borderWidth: tokens.border.outline,
    borderColor: rgba(tokens.color.ash.hex, tokens.color.ash.alpha),
  },
  frame: { aspectRatio: tokens.motion.letterboxAspect, borderRadius: tokens.radius.md },
});
