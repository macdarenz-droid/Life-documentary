// Cast (P8): the people the person has named, as quiet rows (name, and a relation if given). One amber
// action names a person; a row opens a Tray to rename, set the relation or remove. Nothing else is ever
// stored about anyone (CLAUDE.md rule 7).
import type { Uuid } from '@life/contracts';
import { tokens } from '@life/design';
import { words } from '@life/story';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { InputError } from '../../application/storylines';
import { Button, Field, Text, Tray } from '../../design-system';

export type CastRow = { id: Uuid; name: string; relation?: string | undefined };

export type CastActions = {
  load(): Promise<CastRow[]>;
  add(name: string, relation?: string): Promise<unknown>;
  rename(id: Uuid, name: string): Promise<unknown>;
  setRelation(id: Uuid, relation: string | null): Promise<unknown>;
  remove(id: Uuid): Promise<unknown>;
};

export type CastScreenProps = {
  actions: CastActions;
  /** Back to Today; absent in the Design Lab. */
  onBack?: () => void;
};

export function CastScreen({ actions, onBack }: CastScreenProps) {
  const [rows, setRows] = useState<CastRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRelation, setNewRelation] = useState('');
  const [selected, setSelected] = useState<CastRow | null>(null);
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
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
      if (!(e instanceof InputError)) console.error('The cast could not be changed.', e);
      setError(e instanceof InputError ? e.message : words.cast.changeFailed);
      return;
    }
    setAdding(false);
    setNewName('');
    setNewRelation('');
    setSelected(null);
    setAsking(false);
    await reload();
  };

  const pick = (row: CastRow) => {
    setError(null);
    setAsking(false);
    setName(row.name);
    setRelation(row.relation ?? '');
    setSelected(row);
  };

  const errorLine = error ? (
    <Text variant="body" tone="secondary">
      {error}
    </Text>
  ) : null;

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
          {words.cast.title}
        </Text>
        {rows !== null && rows.length === 0 ? (
          <Text variant="body" tone="secondary">
            {words.cast.empty}
          </Text>
        ) : null}
        {(rows ?? []).map((row) => (
          <Pressable
            key={row.id}
            accessibilityRole="button"
            accessibilityLabel={row.relation ? `${row.name}, ${row.relation}` : row.name}
            onPress={() => pick(row)}
            style={styles.row}
          >
            <Text variant="bodyStrong" accessibilityRole="none">
              {row.name}
            </Text>
            {row.relation ? (
              <Text variant="caption" tone="secondary" accessibilityRole="none">
                {row.relation}
              </Text>
            ) : null}
          </Pressable>
        ))}
        <Button
          label={words.cast.namePerson}
          onPress={() => {
            setError(null);
            setAdding(true);
          }}
        />
      </ScrollView>

      <Tray open={adding} onClose={() => setAdding(false)} label={words.cast.namePerson}>
        <Field label={words.cast.nameLabel} value={newName} onChangeText={setNewName} />
        <Field label={words.cast.relationLabel} value={newRelation} onChangeText={setNewRelation} />
        {adding ? errorLine : null}
        <Button
          label={words.cast.save}
          variant="quiet"
          disabled={newName.trim().length === 0}
          onPress={() => void change(() => actions.add(newName, newRelation))}
        />
      </Tray>

      <Tray
        open={selected !== null}
        onClose={() => setSelected(null)}
        label={selected?.name ?? words.cast.title}
      >
        {selected ? (
          <>
            <Field label={words.cast.nameLabel} value={name} onChangeText={setName} />
            <Button
              label={words.cast.rename}
              variant="quiet"
              disabled={name.trim().length === 0 || name.trim() === selected.name}
              onPress={() => void change(() => actions.rename(selected.id, name))}
            />
            <Field label={words.cast.relationLabel} value={relation} onChangeText={setRelation} />
            <Button
              label={words.cast.saveRelation}
              variant="quiet"
              disabled={relation.trim() === (selected.relation ?? '')}
              onPress={() =>
                void change(() =>
                  actions.setRelation(selected.id, relation.trim().length > 0 ? relation : null),
                )
              }
            />
            {asking ? (
              <View style={styles.ask}>
                <Text variant="body">{words.cast.removeAsk}</Text>
                <Button
                  label={words.cast.removeConfirm}
                  variant="quiet"
                  onPress={() => void change(() => actions.remove(selected.id))}
                />
                <Button label={words.cast.keep} variant="quiet" onPress={() => setAsking(false)} />
              </View>
            ) : (
              <Button label={words.cast.remove} variant="quiet" onPress={() => setAsking(true)} />
            )}
            {!adding ? errorLine : null}
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
  row: { minHeight: tokens.space[7], justifyContent: 'center', gap: tokens.space[1] },
  ask: { gap: tokens.space[3] },
});
