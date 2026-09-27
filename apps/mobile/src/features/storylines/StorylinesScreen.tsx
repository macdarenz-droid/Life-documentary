// Storylines (P8): the threads of a life as quiet rows, open ones first, closed ones dimmed under
// "Closed". One amber action names a new storyline; a row opens a Tray to rename, close, reopen or remove.
import type { Uuid } from '@life/contracts';
import { tokens } from '@life/design';
import { words } from '@life/story';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { StorylineSummary } from '../../application/storylines';
import { InputError } from '../../application/storylines';
import { Button, Field, Text, Tray } from '../../design-system';

export type StorylineActions = {
  load(): Promise<StorylineSummary[]>;
  create(title: string): Promise<unknown>;
  rename(id: Uuid, title: string): Promise<unknown>;
  close(id: Uuid): Promise<unknown>;
  reopen(id: Uuid): Promise<unknown>;
  remove(id: Uuid): Promise<unknown>;
};

export type StorylinesScreenProps = {
  actions: StorylineActions;
  /** Back to Today; absent in the Design Lab. */
  onBack?: () => void;
};

function Row({ row, onPress }: { row: StorylineSummary; onPress: () => void }) {
  const tone = row.closed ? 'secondary' : 'text';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.title}, ${words.storylines.since(row.openedOn)}, ${words.storylines.moments(row.momentCount)}`}
      onPress={onPress}
      style={styles.row}
    >
      <View style={styles.rowText}>
        <Text variant="bodyStrong" tone={tone} accessibilityRole="none">
          {row.title}
        </Text>
        <Text variant="caption" tone="secondary" accessibilityRole="none">
          {words.storylines.since(row.openedOn)}
        </Text>
      </View>
      <Text variant="timecode" tone="secondary" accessibilityRole="none">
        {String(row.momentCount)}
      </Text>
    </Pressable>
  );
}

export function StorylinesScreen({ actions, onBack }: StorylinesScreenProps) {
  const [rows, setRows] = useState<StorylineSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [selected, setSelected] = useState<StorylineSummary | null>(null);
  const [title, setTitle] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => setRows(await actions.load()), [actions]);
  useEffect(() => {
    void reload();
  }, [reload]);

  /** Runs one change, reloads the list and closes the trays; a refused change shows its words line. */
  const change = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
    } catch (e) {
      if (!(e instanceof InputError)) console.error('The storyline could not be changed.', e);
      setError(e instanceof InputError ? e.message : words.today.couldNotSave);
      return;
    }
    setCreating(false);
    setNewTitle('');
    setSelected(null);
    setAsking(false);
    await reload();
  };

  const open = (rows ?? []).filter((r) => !r.closed);
  const closed = (rows ?? []).filter((r) => r.closed);
  const pick = (row: StorylineSummary) => {
    setError(null);
    setAsking(false);
    setTitle(row.title);
    setSelected(row);
  };

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
          {words.storylines.title}
        </Text>
        {rows !== null && rows.length === 0 ? (
          <Text variant="body" tone="secondary">
            {words.storylines.empty}
          </Text>
        ) : null}
        {open.map((row) => (
          <Row key={row.id} row={row} onPress={() => pick(row)} />
        ))}
        {closed.length > 0 ? (
          <Text variant="label" tone="secondary" accessibilityRole="header">
            {words.storylines.closed}
          </Text>
        ) : null}
        {closed.map((row) => (
          <Row key={row.id} row={row} onPress={() => pick(row)} />
        ))}
        <Button
          label={words.storylines.newStoryline}
          onPress={() => {
            setError(null);
            setCreating(true);
          }}
        />
      </ScrollView>

      <Tray
        open={creating}
        onClose={() => setCreating(false)}
        label={words.storylines.newStoryline}
      >
        <Field label={words.storylines.titleLabel} value={newTitle} onChangeText={setNewTitle} />
        {error && creating ? (
          <Text variant="body" tone="secondary">
            {error}
          </Text>
        ) : null}
        <Button
          label={words.storylines.save}
          variant="quiet"
          disabled={newTitle.trim().length === 0}
          onPress={() => void change(() => actions.create(newTitle))}
        />
      </Tray>

      <Tray
        open={selected !== null}
        onClose={() => setSelected(null)}
        label={selected?.title ?? words.storylines.title}
      >
        {selected ? (
          <>
            <Field label={words.storylines.titleLabel} value={title} onChangeText={setTitle} />
            <Button
              label={words.storylines.rename}
              variant="quiet"
              disabled={title.trim().length === 0 || title.trim() === selected.title}
              onPress={() => void change(() => actions.rename(selected.id, title))}
            />
            <Button
              label={selected.closed ? words.storylines.reopen : words.storylines.close}
              variant="quiet"
              onPress={() =>
                void change(() =>
                  selected.closed ? actions.reopen(selected.id) : actions.close(selected.id),
                )
              }
            />
            {asking ? (
              <View style={styles.ask}>
                <Text variant="body">{words.storylines.removeAsk}</Text>
                <Button
                  label={words.storylines.removeConfirm}
                  variant="quiet"
                  onPress={() => void change(() => actions.remove(selected.id))}
                />
                <Button
                  label={words.storylines.keep}
                  variant="quiet"
                  onPress={() => setAsking(false)}
                />
              </View>
            ) : (
              <Button
                label={words.storylines.remove}
                variant="quiet"
                onPress={() => setAsking(true)}
              />
            )}
            {error && !creating ? (
              <Text variant="body" tone="secondary">
                {error}
              </Text>
            ) : null}
          </>
        ) : null}
      </Tray>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.background },
  content: { padding: tokens.space[5], gap: tokens.space[4] },
  back: { minHeight: tokens.space[7], justifyContent: 'center', alignSelf: 'flex-start' },
  row: {
    minHeight: tokens.space[7],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.space[3],
    paddingVertical: tokens.space[2],
  },
  rowText: { flex: 1, gap: tokens.space[1] },
  ask: { gap: tokens.space[3] },
});
