// The viewer's edit tray (P10): the note, the mood and the storyline and cast tags of one moment, and
// "Delete", which asks once. Values in, actions out; the route builds the actions from the use cases.
import type { MomentMood, Uuid } from '@life/contracts';
import { tokens } from '@life/design';
import { words } from '@life/story';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { FootageItem } from '../../application/footage';
import { InputError } from '../../application/storylines';
import { Button, ChipList, Field, MoodChips, Text, Tray } from '../../design-system';

/** The same limit as the Note tray on Today. */
const NOTE_MAX = 280;

export type EditActions = {
  loadTags(): Promise<{
    storylines: { id: Uuid; title: string }[];
    cast: { id: Uuid; name: string; relation?: string | undefined }[];
  }>;
  edit(id: Uuid, patch: { text: string | null; mood: MomentMood | null }): Promise<void>;
  tag(id: Uuid, tags: { storylineIds: Uuid[]; castIds: Uuid[] }): Promise<void>;
  remove(id: Uuid): Promise<void>;
};

export function EditTray({
  open,
  item,
  actions,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  item: FootageItem;
  actions: EditActions;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [storylines, setStorylines] = useState<{ id: Uuid; label: string }[]>([]);
  const [cast, setCast] = useState<{ id: Uuid; label: string }[]>([]);
  const [text, setText] = useState(item.text ?? '');
  const [mood, setMood] = useState<MomentMood | null>(item.mood ?? null);
  const [storylineIds, setStorylineIds] = useState<Uuid[]>(item.storylineIds);
  const [castIds, setCastIds] = useState<Uuid[]>(item.castIds);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Each opening starts from the moment as it is stored.
  useEffect(() => {
    if (!open) return;
    setText(item.text ?? '');
    setMood(item.mood ?? null);
    setStorylineIds(item.storylineIds);
    setCastIds(item.castIds);
    setAsking(false);
    setError(null);
    let active = true;
    void actions.loadTags().then((options) => {
      if (!active) return;
      setStorylines(options.storylines.map((s) => ({ id: s.id, label: s.title })));
      setCast(
        options.cast.map((c) => ({
          id: c.id,
          label: c.relation ? `${c.name} · ${c.relation}` : c.name,
        })),
      );
    });
    return () => {
      active = false;
    };
  }, [open, item, actions]);

  const attempt = async (work: () => Promise<void>) => {
    setError(null);
    try {
      await work();
    } catch (e) {
      if (!(e instanceof InputError)) console.error('The moment could not be changed.', e);
      setError(e instanceof InputError ? e.message : words.today.couldNotSave);
    }
  };

  return (
    <Tray open={open} onClose={onClose} label={words.footage.editLabel}>
      <Field
        label={words.footage.noteLabel}
        value={text}
        onChangeText={(t) => setText(t.slice(0, NOTE_MAX))}
        multiline
      />
      <Text variant="label" tone="secondary">
        {words.footage.mood}
      </Text>
      <MoodChips value={mood} onChange={setMood} />
      <Text variant="label" tone="secondary">
        {words.tags.storylines}
      </Text>
      <ChipList options={storylines} selected={storylineIds} onChange={setStorylineIds} />
      <Text variant="label" tone="secondary">
        {words.tags.cast}
      </Text>
      <ChipList options={cast} selected={castIds} onChange={setCastIds} />

      {error ? (
        <Text variant="body" tone="secondary">
          {error}
        </Text>
      ) : null}
      <Button
        label={words.footage.done}
        onPress={() =>
          void attempt(async () => {
            const trimmed = text.trim();
            await actions.edit(item.id, { text: trimmed === '' ? null : trimmed, mood });
            await actions.tag(item.id, { storylineIds, castIds });
            onSaved();
          })
        }
      />
      {asking ? (
        <View style={styles.ask}>
          <Text variant="body" tone="secondary">
            {words.footage.deleteAsk}
          </Text>
          <Button
            label={words.footage.deleteConfirm}
            variant="quiet"
            onPress={() =>
              void attempt(async () => {
                await actions.remove(item.id);
                onDeleted();
              })
            }
          />
          <Button label={words.footage.keep} variant="quiet" onPress={() => setAsking(false)} />
        </View>
      ) : (
        <Button label={words.footage.delete} variant="quiet" onPress={() => setAsking(true)} />
      )}
    </Tray>
  );
}

const styles = StyleSheet.create({
  ask: { gap: tokens.space[2] },
});
