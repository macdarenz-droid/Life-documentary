// Today (P5): today's question as a Title Card and one amber "Hold to answer" button. Holding records up
// to ten seconds of video or voice with the Record transition; releasing saves the answer.
import type { LocalDate, MomentMood, Question } from '@life/contracts';
import { tokens } from '@life/design';
import { capture, dayLabel, secondsLeft, words } from '@life/story';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { Pressable, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';
import type { CaptureInput, MediaInput } from '../../application/captureMoment';
import { Button, Text, useMotionPreference } from '../../design-system';
import { Record } from '../../design-system/motion/Record';
import { recordPlan } from '../../design-system/motion/recordPlan';
import { TextMorph } from '../../design-system/motion/TextMorph';
import { TitleCard } from '../../design-system/motion/TitleCard';
import type {
  CameraViewProps,
  CaptureServices,
  Permissions,
  VideoRecorder,
  VoiceRecorder,
} from '../../domain/capturePorts';
import { AddRow, MoodChips, NoteTray, PlaceToggle, Toggle, type AddAction } from './extras';

export type TodayScreenProps = {
  today: LocalDate;
  loadQuestion: () => Promise<Question>;
  /** Saves one capture (captureMoment). */
  save: (input: CaptureInput) => Promise<unknown>;
  /** Removes a recording that was not kept. */
  discard: (path: string) => Promise<void>;
  services: CaptureServices;
  CameraView: ComponentType<CameraViewProps>;
  /** Changes when the screen comes into focus, so the question is loaded again. */
  reloadKey?: number;
};

type Mode = 'video' | 'voice';
type Phase = 'idle' | 'recording' | 'saving' | 'saved';
type Notice =
  | null
  | { kind: 'holdLonger' | 'couldNotSave' | 'clipTooLong' | 'clipUnreadable' | 'saved' }
  | { kind: 'denied'; which: 'camera' | 'microphone' };
type Session = {
  recorder: VideoRecorder | VoiceRecorder;
  mode: Mode;
  startedAt: number;
  timer: ReturnType<typeof setTimeout>;
  tick: ReturnType<typeof setInterval>;
};

const NOTICE_WORDS = {
  holdLonger: words.today.holdLonger,
  couldNotSave: words.today.couldNotSave,
  clipTooLong: words.extras.clipTooLong,
  clipUnreadable: words.extras.clipUnreadable,
  saved: words.extras.saved,
} as const;

/** Questions whose Title Card already played in this app session: the reveal plays once per day. */
const revealed = new Set<string>();

export function TodayScreen({
  today,
  loadQuestion,
  save,
  discard,
  services,
  CameraView,
  reloadKey = 0,
}: TodayScreenProps) {
  const { reduced } = useMotionPreference();
  const plan = recordPlan(reduced);
  const [question, setQuestion] = useState<Question | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [mode, setMode] = useState<Mode>('video');
  const [notice, setNotice] = useState<Notice>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [cameraAllowed, setCameraAllowed] = useState(false);
  const camera = useRef<VideoRecorder | null>(null);
  const session = useRef<Session | null>(null);
  const holding = useRef(false);
  const [mood, setMood] = useState<MomentMood | null>(null);
  const [placeName, setPlaceName] = useState<string | null>(null);
  const [placeShown, setPlaceShown] = useState(false);
  const [keepOnPhone, setKeepOnPhone] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  /** Mood, place and keep-on-phone apply to the next capture only. */
  const extras = () => ({
    ...(mood ? { mood } : {}),
    ...(placeName ? { placeName } : {}),
    localOnly: keepOnPhone,
  });
  const resetExtras = () => {
    setMood(null);
    setPlaceName(null);
    setPlaceShown(false);
    setKeepOnPhone(false);
  };

  useEffect(() => {
    let active = true;
    void loadQuestion().then((q) => {
      if (!active) return;
      setQuestion(q);
      if (q.answeredByMomentId) setPhase('saved');
    });
    return () => {
      active = false;
    };
  }, [loadQuestion, reloadKey]);

  useEffect(() => {
    void services.permissions.camera.get().then((s) => setCameraAllowed(s === 'granted'));
  }, [services]);

  useEffect(
    () => () => {
      const s = session.current;
      if (s) {
        clearTimeout(s.timer);
        clearInterval(s.tick);
      }
    },
    [],
  );

  const onRecorder = useCallback((recorder: VideoRecorder | null) => {
    camera.current = recorder;
  }, []);

  const finish = useCallback(async () => {
    const s = session.current;
    if (!s || !question) return;
    session.current = null;
    clearTimeout(s.timer);
    clearInterval(s.tick);
    const elapsed = performance.now() - s.startedAt;
    setPhase('saving');
    try {
      const result: { uri: string; durationMs: number; width?: number; height?: number } | null =
        await s.recorder.stop();
      services.haptics.impactLight();
      if (!result) {
        setPhase('idle');
        setNotice({ kind: 'couldNotSave' });
        return;
      }
      if (elapsed < plan.minMs) {
        await discard(result.uri);
        setPhase('idle');
        setNotice({ kind: 'holdLonger' });
        return;
      }
      const media: MediaInput =
        s.mode === 'video' && result.width !== undefined && result.height !== undefined
          ? {
              sourcePath: result.uri,
              mediaKind: 'video',
              durationMs: result.durationMs,
              width: result.width,
              height: result.height,
            }
          : { sourcePath: result.uri, mediaKind: 'audio', durationMs: result.durationMs };
      await save({ kind: 'answer', questionId: question.id, media, ...extras() });
      resetExtras();
      setPhase('saved');
    } catch (error) {
      console.error('The answer could not be saved.', error);
      setPhase('idle');
    }
  }, [question, services, plan.minMs, discard, save, mood, placeName, keepOnPhone]);

  /** Checks the permissions this mode needs; asks once for any not yet decided. */
  const allowed = useCallback(async (): Promise<boolean> => {
    const needed: (keyof Permissions & ('camera' | 'microphone'))[] =
      mode === 'video' ? ['camera', 'microphone'] : ['microphone'];
    let asked = false;
    for (const which of needed) {
      let state = await services.permissions[which].get();
      if (state === 'undetermined') {
        asked = true;
        state = await services.permissions[which].request();
        if (which === 'camera') setCameraAllowed(state === 'granted');
      }
      if (state !== 'granted') {
        setNotice({ kind: 'denied', which });
        return false;
      }
    }
    // After a prompt the person holds again; this press only answered the question.
    return !asked;
  }, [mode, services]);

  const begin = useCallback(async () => {
    if (!question || phase !== 'idle' || session.current) return;
    setNotice(null);
    if (!(await allowed())) return;
    const recorder = mode === 'video' ? camera.current : services.voice;
    if (!recorder) return;
    services.haptics.impactLight();
    await recorder.start(plan.maxMs);
    const startedAt = performance.now();
    session.current = {
      recorder,
      mode,
      startedAt,
      timer: setTimeout(() => void finish(), plan.maxMs),
      tick: setInterval(() => setElapsedMs(performance.now() - startedAt), 1000),
    };
    setElapsedMs(0);
    setPhase('recording');
    if (!holding.current) void finish();
  }, [question, phase, allowed, mode, services, plan.maxMs, finish]);

  /** Saves a photo, clip or note with the chosen extras; any failure shows a plain line. */
  const saveExtra = async (input: CaptureInput) => {
    try {
      await save({ ...input, ...extras() } as CaptureInput);
      resetExtras();
      setNotice({ kind: 'saved' });
    } catch (error) {
      console.error('The capture could not be saved.', error);
      setNotice({ kind: 'couldNotSave' });
    }
  };

  const onAdd = async (action: AddAction) => {
    setNotice(null);
    if (action === 'note') return setNoteOpen(true);
    if (action === 'place') return setPlaceShown((shown) => !shown);
    if (action === 'photo') {
      let state = await services.permissions.camera.get();
      if (state === 'undetermined') {
        state = await services.permissions.camera.request();
        setCameraAllowed(state === 'granted');
        return;
      }
      if (state !== 'granted') return setNotice({ kind: 'denied', which: 'camera' });
      const photo = await camera.current?.takePhoto();
      if (!photo) return setNotice({ kind: 'couldNotSave' });
      services.haptics.impactLight();
      const media: MediaInput = {
        sourcePath: photo.uri,
        mediaKind: 'photo',
        width: photo.width,
        height: photo.height,
      };
      return saveExtra({ kind: 'photo', media, localOnly: false });
    }
    const picked = await services.picker.pick();
    if (!picked) return;
    if (picked.kind === 'photo') {
      const media: MediaInput = {
        sourcePath: picked.uri,
        mediaKind: 'photo',
        width: picked.width,
        height: picked.height,
      };
      return saveExtra({ kind: 'photo', media, localOnly: false });
    }
    if (picked.durationMs === undefined) return setNotice({ kind: 'clipUnreadable' });
    if (picked.durationMs > capture.libraryClipMaxMs) return setNotice({ kind: 'clipTooLong' });
    const media: MediaInput = {
      sourcePath: picked.uri,
      mediaKind: 'video',
      durationMs: picked.durationMs,
      width: picked.width,
      height: picked.height,
    };
    return saveExtra({ kind: 'clip', media, localOnly: false });
  };

  const onPressIn = () => {
    holding.current = true;
    void begin();
  };
  const onPressOut = () => {
    holding.current = false;
    void finish();
  };
  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName !== 'activate') return;
    if (session.current) {
      holding.current = false;
      void finish();
    } else {
      // A screen reader starts with one double tap and stops with the next.
      holding.current = true;
      void begin();
    }
  };

  const recording = phase === 'recording';
  const label =
    phase === 'saved'
      ? words.button.saved
      : phase === 'idle'
        ? words.button.holdToAnswer
        : words.button.recording;
  const left = secondsLeft(elapsedMs, plan.maxMs);

  const questionView = question ? (
    <View style={styles.questionBlock}>
      <Text variant="label" tone="secondary">
        {dayLabel(today)}
      </Text>
      {revealed.has(question.id) ? (
        <Text variant="question">{question.text}</Text>
      ) : (
        <TitleCard
          lines={[question.text]}
          variant="question"
          play
          onDone={() => revealed.add(question.id)}
        />
      )}
    </View>
  ) : null;

  const button = (
    <View style={styles.controls}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: !question || phase === 'saving' }}
        accessibilityValue={
          recording
            ? {
                min: 0,
                max: plan.maxMs / 1000,
                now: left,
                text: `${left} ${words.today.secondsLeft}`,
              }
            : undefined
        }
        accessibilityActions={[
          {
            name: 'activate',
            label: recording ? words.today.stopRecording : words.today.startRecording,
          },
        ]}
        onAccessibilityAction={onAccessibilityAction}
        disabled={!question || phase === 'saved' || phase === 'saving'}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[styles.button, phase === 'saved' ? styles.quiet : styles.primary]}
      >
        <TextMorph
          text={label}
          variant="bodyStrong"
          tone={phase === 'saved' ? 'text' : 'onAccent'}
        />
      </Pressable>

      {notice && notice.kind !== 'denied' ? (
        <Text variant="body" tone="secondary">
          {NOTICE_WORDS[notice.kind]}
        </Text>
      ) : null}
      {notice?.kind === 'denied' ? (
        <View style={styles.notice}>
          <Text variant="body">{words.permissions.denied[notice.which]}</Text>
          <Button
            label={words.today.openSettings}
            variant="quiet"
            onPress={() => services.settings.open()}
          />
        </View>
      ) : null}

      {phase !== 'saved' ? (
        <View
          style={styles.modes}
          accessibilityRole="radiogroup"
          accessibilityLabel={words.today.modeLabel}
        >
          {(['video', 'voice'] as const).map((m, i) => (
            <View key={m} style={styles.modeItem}>
              {i > 0 ? (
                <Text variant="caption" tone="secondary" accessibilityRole="none">
                  {' · '}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: mode === m, disabled: recording }}
                disabled={recording}
                onPress={() => {
                  services.haptics.selection();
                  setMode(m);
                }}
              >
                <Text
                  variant="caption"
                  tone={mode === m ? 'text' : 'secondary'}
                  accessibilityRole="none"
                >
                  {m === 'video' ? words.today.modeVideo : words.today.modeVoice}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {!recording ? (
        <View style={styles.extras}>
          <AddRow onAction={(a) => void onAdd(a)} />
          <MoodChips value={mood} onChange={setMood} />
          {placeShown ? (
            <PlaceToggle
              place={services.place}
              permission={services.permissions.location}
              value={placeName}
              onChange={setPlaceName}
            />
          ) : null}
          <Toggle
            label={words.extras.keepOnPhone}
            help={words.extras.keepOnPhoneHelp}
            value={keepOnPhone}
            onChange={setKeepOnPhone}
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.screen}>
      {cameraAllowed ? (
        <View
          style={[StyleSheet.absoluteFill, { opacity: recording ? 1 : 0 }]}
          pointerEvents="none"
        >
          <CameraView onRecorder={onRecorder} style={StyleSheet.absoluteFill} />
        </View>
      ) : null}
      <Record
        recording={recording}
        elapsedMs={elapsedMs}
        overPreview={mode === 'video'}
        question={questionView}
        button={button}
      />
      <NoteTray
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        onSave={(text) => {
          setNoteOpen(false);
          void saveExtra({ kind: 'note', text, localOnly: false });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.background },
  questionBlock: { gap: tokens.space[3], paddingHorizontal: tokens.space[5] },
  controls: { alignItems: 'center', gap: tokens.space[4], paddingHorizontal: tokens.space[5] },
  button: {
    minHeight: tokens.space[7],
    minWidth: tokens.space[8] * 3,
    paddingHorizontal: tokens.space[5],
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: tokens.color.accent },
  quiet: {
    backgroundColor: 'transparent',
    borderWidth: tokens.border.outline,
    borderColor: tokens.color.ash.hex,
  },
  notice: { alignItems: 'center', gap: tokens.space[3] },
  modes: { flexDirection: 'row', alignItems: 'center' },
  modeItem: { flexDirection: 'row', alignItems: 'center' },
  extras: { alignSelf: 'stretch', gap: tokens.space[4] },
});
