// Off by default. Turning it on asks for location once, finds a place name and shows it to confirm; only a
// confirmed name is used. Nothing is kept when it is off.
import { tokens } from '@life/design';
import { words } from '@life/story';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from '../../../design-system';
import type { Permissions, PlaceFinder } from '../../../domain/capturePorts';
import { Toggle } from './Toggle';

export function PlaceToggle({
  place,
  permission,
  value,
  onChange,
}: {
  place: PlaceFinder;
  permission: Permissions['location'];
  /** The confirmed place name, or null. */
  value: string | null;
  onChange: (name: string | null) => void;
}) {
  const [on, setOn] = useState(value !== null);
  const [found, setFound] = useState<string | null | undefined>(undefined);

  const turn = async (next: boolean) => {
    setOn(next);
    setFound(undefined);
    onChange(null);
    if (!next) return;
    let state = await permission.get();
    if (state === 'undetermined') state = await permission.request();
    if (state !== 'granted') {
      setFound(null);
      return;
    }
    setFound(await place.currentPlaceName());
  };

  const confirmed = on && value !== null;
  return (
    <View style={styles.block}>
      <Toggle
        label={words.extras.placeLabel}
        value={on || confirmed}
        onChange={(v) => void turn(v)}
      />
      {on && found === null ? (
        <Text variant="caption" tone="secondary">
          {words.extras.placeNotFound}
        </Text>
      ) : null}
      {on && found && !confirmed ? (
        <View style={styles.confirm}>
          <Text variant="body">{found}</Text>
          <Button label={words.extras.placeUse} variant="quiet" onPress={() => onChange(found)} />
        </View>
      ) : null}
      {confirmed ? (
        <Text variant="caption" tone="secondary">
          {value}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: tokens.space[2] },
  confirm: { gap: tokens.space[2], alignItems: 'flex-start' },
});
