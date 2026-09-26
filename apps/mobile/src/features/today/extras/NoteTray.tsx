// One line about today, up to 280 characters, saved as a note.
import { words } from '@life/story';
import { useState } from 'react';
import { Button, Field, Tray } from '../../../design-system';

export const NOTE_MAX = 280;

export function NoteTray({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  return (
    <Tray open={open} onClose={onClose} label={words.extras.note}>
      <Field
        label={words.extras.noteLabel}
        value={text}
        onChangeText={(t) => setText(t.slice(0, NOTE_MAX))}
      />
      <Button
        label={words.extras.save}
        variant="quiet"
        disabled={trimmed.length === 0}
        onPress={() => {
          onSave(trimmed);
          setText('');
        }}
      />
    </Tray>
  );
}
