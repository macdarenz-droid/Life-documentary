// The Episodes list (P16, D42): this week's line from where the week stands, then the documentary's
// episodes newest first with their number, title, dates and length, "Plays offline" when saved, and a
// label while one is being made, running late or couldn't be made. The screen shows values only.
import type { Uuid } from '@life/contracts';
import { tokens } from '@life/design';
import { durationLabel, episodeWords } from '@life/story';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  weekLine,
  type EpisodeRow,
  type EpisodeStage,
  type ThisWeek,
} from '../../application/episodes';
import { Text } from '../../design-system';

export type EpisodesActions = {
  load(): Promise<{ week: ThisWeek; episodes: EpisodeRow[] }>;
};

export type EpisodesScreenProps = {
  actions: EpisodesActions;
  onOpen?: (id: Uuid) => void;
  onBack?: () => void;
  reloadKey?: number;
};

const STAGE_LABEL: Record<EpisodeStage, string | null> = {
  ready: null,
  making: episodeWords.makingLabel,
  late: episodeWords.lateLabel,
  failed: episodeWords.failedLabel,
};

function Row({ row, onOpen }: { row: EpisodeRow; onOpen?: (id: Uuid) => void }) {
  const { episode, stage } = row;
  const ready = stage === 'ready';
  const label = STAGE_LABEL[stage];
  const details = [
    episodeWords.dates(episode.weekStart, episode.weekEnd),
    ...(ready && episode.durationMs !== undefined ? [durationLabel(episode.durationMs)] : []),
    ...(ready && episode.localPath !== undefined ? [episodeWords.offline] : []),
    ...(label ? [label] : []),
  ].join(' · ');
  const heading = episodeWords.label(episode.number);
  const spoken = [heading, episode.title, details].filter(Boolean).join('. ');
  const body = (
    <View style={styles.rowText}>
      <Text variant="bodyStrong" accessibilityRole="none">
        {heading}
      </Text>
      {episode.title ? (
        <Text variant="body" accessibilityRole="none">
          {episode.title}
        </Text>
      ) : null}
      <Text variant="caption" tone="secondary" accessibilityRole="none">
        {details}
      </Text>
    </View>
  );
  if (!ready || !onOpen) {
    return (
      <View style={styles.row} accessible accessibilityLabel={spoken}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={() => onOpen(episode.id)}
      style={styles.row}
    >
      {body}
    </Pressable>
  );
}

export function EpisodesScreen({ actions, onOpen, onBack, reloadKey = 0 }: EpisodesScreenProps) {
  const [data, setData] = useState<{ week: ThisWeek; episodes: EpisodeRow[] } | null>(null);

  useEffect(() => {
    let active = true;
    actions
      .load()
      .then((loaded) => active && setData(loaded))
      .catch((error: unknown) => console.error('The episodes could not be loaded.', error));
    return () => {
      active = false;
    };
  }, [actions, reloadKey]);

  const line = data ? weekLine(data.week) : null;
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {onBack ? (
          <Pressable accessibilityRole="link" onPress={onBack} style={styles.back}>
            <Text variant="label" tone="secondary" accessibilityRole="none">
              {episodeWords.back}
            </Text>
          </Pressable>
        ) : null}
        <Text variant="display34" accessibilityRole="header">
          {episodeWords.title}
        </Text>
        {line ? <Text variant="body">{line}</Text> : null}
        {data && data.episodes.length === 0 ? (
          <Text variant="body" tone="secondary">
            {episodeWords.empty}
          </Text>
        ) : null}
        <View style={styles.rows}>
          {(data?.episodes ?? []).map((row) => (
            <Row key={row.episode.id} row={row} {...(onOpen ? { onOpen } : {})} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.background },
  content: { padding: tokens.space[5], gap: tokens.space[5] },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  rows: { gap: tokens.space[3] },
  row: { minHeight: 56, paddingVertical: tokens.space[2], justifyContent: 'center' },
  rowText: { gap: tokens.space[1] },
});
