// After a capture: a Tray with the open storylines and the cast as chips, multi-select, and one "Done".
// A storyline or a person can be named inline; the new one is selected at once.
import type { Uuid } from '@life/contracts';
import { rgba, tokens } from '@life/design';
import { words } from '@life/story';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { InputError } from '../../application/storylines';
import { Button, Field, Text, Tray } from '../../design-system';

type StorylineOption = { id: Uuid; title: string };
type CastOption = { id: Uuid; name: string; relation?: string | undefined };

/** What the Tag tray needs from the store; the route builds it from the use cases. */
export type TagActions = {
  load(): Promise<{ storylines: StorylineOption[]; cast: CastOption[] }>;
  createStoryline(title: string): Promise<StorylineOption>;
  addCastMember(name: string): Promise<CastOption>;
  tag(momentId: Uuid, tags: { storylineIds: Uuid[]; castIds: Uuid[] }): Promise<void>;
};

function toggle(list: Uuid[], id: Uuid): Uuid[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function Chip({
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
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.selected]}
    >
      <Text variant="caption" tone={selected ? 'text' : 'secondary'} accessibilityRole="none">
        {label}
      </Text>
    </Pressable>
  );
}

export function TagTray({
  open,
  momentId,
  actions,
  onClose,
}: {
  open: boolean;
  momentId: Uuid;
  actions: TagActions;
  onClose: () => void;
}) {
  const [storylines, setStorylines] = useState<StorylineOption[]>([]);
  const [cast, setCast] = useState<CastOption[]>([]);
  const [storylineIds, setStorylineIds] = useState<Uuid[]>([]);
  const [castIds, setCastIds] = useState<Uuid[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void actions.load().then((options) => {
      if (!active) return;
      setStorylines(options.storylines);
      setCast(options.cast);
    });
    return () => {
      active = false;
    };
  }, [open, actions]);

  // A new moment starts with nothing selected.
  useEffect(() => {
    setStorylineIds([]);
    setCastIds([]);
    setError(null);
  }, [momentId]);

  const attempt = async (work: () => Promise<void>) => {
    setError(null);
    try {
      await work();
    } catch (e) {
      if (!(e instanceof InputError)) console.error('Tagging failed.', e);
      setError(e instanceof InputError ? e.message : words.today.couldNotSave);
    }
  };

  return (
    <Tray open={open} onClose={onClose} label={words.tags.trayLabel}>
      <Text variant="label" tone="secondary">
        {words.tags.storylines}
      </Text>
      <View style={styles.row}>
        {storylines.map((s) => (
          <Chip
            key={s.id}
            label={s.title}
            selected={storylineIds.includes(s.id)}
            onPress={() => setStorylineIds((ids) => toggle(ids, s.id))}
          />
        ))}
      </View>
      <View style={styles.inline}>
        <Field label={words.tags.newStoryline} value={newTitle} onChangeText={setNewTitle} />
        <Button
          label={words.tags.addStoryline}
          variant="quiet"
          disabled={newTitle.trim().length === 0}
          onPress={() =>
            void attempt(async () => {
              const created = await actions.createStoryline(newTitle);
              setStorylines((list) => [...list, created]);
              setStorylineIds((ids) => [...ids, created.id]);
              setNewTitle('');
            })
          }
        />
      </View>

      <Text variant="label" tone="secondary">
        {words.tags.cast}
      </Text>
      <View style={styles.row}>
        {cast.map((c) => (
          <Chip
            key={c.id}
            label={c.relation ? `${c.name} · ${c.relation}` : c.name}
            selected={castIds.includes(c.id)}
            onPress={() => setCastIds((ids) => toggle(ids, c.id))}
          />
        ))}
      </View>
      <View style={styles.inline}>
        <Field label={words.tags.namePerson} value={newName} onChangeText={setNewName} />
        <Button
          label={words.tags.addPerson}
          variant="quiet"
          disabled={newName.trim().length === 0}
          onPress={() =>
            void attempt(async () => {
              const added = await actions.addCastMember(newName);
              setCast((list) => [...list, added]);
              setCastIds((ids) => [...ids, added.id]);
              setNewName('');
            })
          }
        />
      </View>

      {error ? (
        <Text variant="body" tone="secondary">
          {error}
        </Text>
      ) : null}
      <Button
        label={words.tags.done}
        onPress={() =>
          void attempt(async () => {
            await actions.tag(momentId, { storylineIds, castIds });
            onClose();
          })
        }
      />
    </Tray>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space[2] },
  inline: { gap: tokens.space[2] },
  chip: {
    minHeight: tokens.space[7],
    justifyContent: 'center',
    paddingHorizontal: tokens.space[4],
    borderRadius: tokens.radius.lg,
    borderWidth: tokens.border.outline,
    borderColor: rgba(tokens.color.ash.hex, tokens.color.ash.alpha),
  },
  selected: { borderColor: tokens.color.text },
});
