import { tokens } from '@life/design';
import { px } from '../scale';

/** A small tracked label (DESIGN §4). */
export function Label({ text }: { text: string }) {
  const label = tokens.type.label;
  return (
    <div
      style={{
        fontFamily: label.family,
        fontSize: px(label.size),
        lineHeight: `${px(label.lineHeight)}px`,
        letterSpacing: px(label.letterSpacing),
        textTransform: label.textTransform,
        color: tokens.color.text,
      }}
    >
      {text}
    </div>
  );
}
