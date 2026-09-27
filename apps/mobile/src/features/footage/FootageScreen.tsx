// Footage (P10): the days as a Filmstrip with the chosen day's moments below, or the storylines and
// their moments. Quiet rows; nothing here is amber (DESIGN §6). A row opens the moment full screen.
import type { LocalDate, Uuid } from '@life/contracts';
import { tokens } from '@life/design';
import { words } from '@life/story';
import { Image, type ImageProps } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeIn, ReduceMotion } from 'react-native-reanimated';
import type { FootageDay, FootageItem, FootageStoryline } from '../../application/footage';
import { Text } from '../../design-system';
import { Filmstrip, type FilmstripFrame } from '../../design-system/motion/Filmstrip';

export type PosterSource = Exclude<ImageProps['source'], undefined>;

export type FootageActions = {
  /** Up to `DAYS_PER_PAGE` days, newest first, strictly before `beforeDay` when given. */
  loadDays(beforeDay?: LocalDate): Promise<FootageDay[]>;
  loadStorylines(): Promise<FootageStoryline[]>;
  loadStoryline(id: Uuid): Promise<FootageItem[]>;
  /** A plain copy of the asset's poster for an Image, or null. */
  poster(assetId: Uuid): Promise<PosterSource | null>;
};

export type FootageScreenProps = {
  actions: FootageActions;
  onOpen?: (momentId: Uuid) => void;
  /** Back to Today; absent in the Design Lab. */
  onBack?: () => void;
};

export const DAYS_PER_PAGE = 14;

const dissolve = FadeIn.duration(tokens.motion.duration.dissolve)
  .easing(Easing.bezier(...tokens.motion.ease.dissolve).factory())
  // A fade is kept under reduced motion (DESIGN §1.10: opacity remains).
  .reduceMotion(ReduceMotion.Never);

function rowLabel(item: FootageItem): string {
  return [
    words.footage.kinds[item.kind],
    item.timeLabel,
    item.durationLabel,
    item.questionText ?? item.text,
    item.localOnly ? words.footage.onThisPhone : undefined,
  ]
    .filter(Boolean)
    .join(', ');
}

function Row({
  item,
  poster,
  onPress,
}: {
  item: FootageItem;
  poster: PosterSource | null | undefined;
  onPress?: () => void;
}) {
  const visual = item.mediaKind === 'video' || item.mediaKind === 'photo';
  const line = item.questionText ?? item.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rowLabel(item)}
      onPress={onPress}
      style={styles.row}
    >
      {visual ? (
        <View style={styles.thumb}>
          {poster ? (
            <Image
              source={poster}
              contentFit="cover"
              style={StyleSheet.absoluteFill}
              accessible={false}
            />
          ) : null}
        </View>
      ) : null}
      <View style={styles.rowText}>
        <Text variant="timecode" tone="secondary" accessibilityRole="none">
          {item.durationLabel ? `${item.timeLabel}  ${item.durationLabel}` : item.timeLabel}
        </Text>
        {line ? (
          <Text variant="body" accessibilityRole="none">
            {line}
          </Text>
        ) : null}
        {item.localOnly ? (
          <Text variant="caption" tone="secondary" accessibilityRole="none">
            {words.footage.onThisPhone}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function ModeLink({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.mode}
    >
      <Text variant="label" tone={selected ? 'text' : 'secondary'} accessibilityRole="none">
        {label}
      </Text>
    </Pressable>
  );
}

export function FootageScreen({ actions, onOpen, onBack }: FootageScreenProps) {
  const [mode, setMode] = useState<'days' | 'storylines'>('days');
  const [days, setDays] = useState<FootageDay[] | null>(null);
  const [more, setMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<LocalDate | undefined>(undefined);
  const [storylines, setStorylines] = useState<FootageStoryline[] | null>(null);
  const [storyline, setStoryline] = useState<{
    row: FootageStoryline;
    items: FootageItem[];
  } | null>(null);
  const [posters, setPosters] = useState<Record<string, PosterSource | null>>({});

  useEffect(() => {
    void (async () => {
      const first = await actions.loadDays();
      setDays(first);
      setMore(first.length === DAYS_PER_PAGE);
      setSelected(first[0]?.date);
    })();
  }, [actions]);

  useEffect(() => {
    if (mode !== 'storylines' || storylines !== null) return;
    void actions.loadStorylines().then(setStorylines);
  }, [mode, storylines, actions]);

  const loadMore = useCallback(async () => {
    if (!more || loadingMore || !days || days.length === 0) return;
    setLoadingMore(true);
    const next = await actions.loadDays(days[days.length - 1]!.date);
    setDays([...days, ...next]);
    setMore(next.length === DAYS_PER_PAGE);
    setLoadingMore(false);
  }, [actions, days, more, loadingMore]);

  const day = days?.find((d) => d.date === selected);
  const shown = useMemo(
    () => [
      ...(days ?? []).map((d) => d.items.find((i) => i.hasPoster)),
      ...(day?.items ?? []),
      ...(storyline?.items ?? []),
    ],
    [days, day, storyline],
  );

  // Posters are plain cache copies made on demand; each is asked for once.
  useEffect(() => {
    const wanted = shown.filter(
      (i): i is FootageItem & { assetId: Uuid } =>
        i !== undefined && i.hasPoster && i.assetId !== undefined && !(i.assetId in posters),
    );
    if (wanted.length === 0) return;
    let active = true;
    void (async () => {
      const found: Record<string, PosterSource | null> = {};
      for (const item of wanted) found[item.assetId] = await actions.poster(item.assetId);
      if (active) setPosters((p) => ({ ...p, ...found }));
    })();
    return () => {
      active = false;
    };
  }, [shown, posters, actions]);

  const frames: FilmstripFrame[] = (days ?? []).map((d) => {
    const first = d.items.find((i) => i.hasPoster);
    return {
      date: d.date,
      label: d.dayLabel,
      poster: first?.assetId ? (posters[first.assetId] ?? null) : null,
    };
  });

  const rows = (items: FootageItem[]) =>
    items.map((item) => (
      <Row
        key={item.id}
        item={item}
        poster={item.assetId ? posters[item.assetId] : undefined}
        {...(onOpen ? { onPress: () => onOpen(item.id) } : {})}
      />
    ));

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {onBack ? (
          <Pressable accessibilityRole="link" onPress={onBack} style={styles.back}>
            <Text variant="label" tone="secondary" accessibilityRole="none">
              {words.nav.today}
            </Text>
          </Pressable>
        ) : null}
        <Text variant="display34" accessibilityRole="header">
          {words.footage.title}
        </Text>
        <View style={styles.modes}>
          <ModeLink
            label={words.footage.days}
            selected={mode === 'days'}
            onPress={() => setMode('days')}
          />
          <Text variant="label" tone="secondary" accessibilityRole="none">
            ·
          </Text>
          <ModeLink
            label={words.footage.storylines}
            selected={mode === 'storylines'}
            onPress={() => {
              setStoryline(null);
              setMode('storylines');
            }}
          />
        </View>

        {mode === 'days' && days !== null && days.length === 0 ? (
          <Text variant="body" tone="secondary">
            {words.footage.empty}
          </Text>
        ) : null}

        {mode === 'days' && days !== null && days.length > 0 ? (
          <>
            <Filmstrip
              frames={frames}
              {...(selected ? { selected } : {})}
              onDay={setSelected}
              onEndReached={() => void loadMore()}
            />
            {day ? (
              <Animated.View key={day.date} entering={dissolve} style={styles.rows}>
                <Text variant="label" tone="secondary" accessibilityRole="header">
                  {day.dayLabel}
                </Text>
                {rows(day.items)}
              </Animated.View>
            ) : null}
          </>
        ) : null}

        {mode === 'storylines' && storyline === null ? (
          <View style={styles.rows}>
            {storylines !== null && storylines.length === 0 ? (
              <Text variant="body" tone="secondary">
                {words.footage.empty}
              </Text>
            ) : null}
            {(storylines ?? []).map((row) => (
              <Pressable
                key={row.id}
                accessibilityRole="button"
                accessibilityLabel={`${row.title}, ${words.storylines.moments(row.count)}`}
                onPress={() =>
                  void actions.loadStoryline(row.id).then((items) => setStoryline({ row, items }))
                }
                style={styles.row}
              >
                <View style={styles.rowText}>
                  <Text
                    variant="bodyStrong"
                    tone={row.closed ? 'secondary' : 'text'}
                    accessibilityRole="none"
                  >
                    {row.title}
                  </Text>
                </View>
                <Text variant="timecode" tone="secondary" accessibilityRole="none">
                  {String(row.count)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {mode === 'storylines' && storyline !== null ? (
          <Animated.View key={storyline.row.id} entering={dissolve} style={styles.rows}>
            <Pressable
              accessibilityRole="link"
              onPress={() => setStoryline(null)}
              style={styles.back}
            >
              <Text variant="label" tone="secondary" accessibilityRole="none">
                {words.footage.storylines}
              </Text>
            </Pressable>
            <Text variant="bodyStrong" accessibilityRole="header">
              {storyline.row.title}
            </Text>
            {storyline.items.length === 0 ? (
              <Text variant="body" tone="secondary">
                {words.footage.storylineEmpty}
              </Text>
            ) : null}
            {rows(storyline.items)}
          </Animated.View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.background },
  content: { padding: tokens.space[5], gap: tokens.space[5] },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  modes: { flexDirection: 'row', alignItems: 'center', gap: tokens.space[2] },
  mode: { minHeight: 44, justifyContent: 'center' },
  rows: { gap: tokens.space[3] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space[4],
    minHeight: 56,
    paddingVertical: tokens.space[2],
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: tokens.radius.sm,
    overflow: 'hidden',
    backgroundColor: tokens.color.surface,
  },
  rowText: { flex: 1, gap: tokens.space[1] },
});
