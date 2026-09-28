import { tokens } from '@life/design';
import { episodeTitleCard, msToFrames, titleCardPlan } from '@life/story';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { px } from '../scale';

const { duration, ease, stagger } = tokens.motion;
const easeOut = Easing.bezier(...ease.out);
const TIMING = { wordStaggerMs: stagger.word, wordDurationMs: duration.title };
/** How `episodeTitleCard` reads the episode label off the title. */
const EPISODE_SEPARATOR = ' · ';
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/**
 * The episode's title sequence (DESIGN §4): fade from black, a small tracked label, then the title
 * in Instrument Serif with the app's masked word reveal, held until the card ends.
 */
export function TitleCard({
  label: episodeLabel,
  text,
  subtitle,
  reducedMotion,
}: {
  label: string;
  text: string;
  subtitle?: string | undefined;
  reducedMotion: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { label, lines } = episodeTitleCard({
    text: `${episodeLabel}${EPISODE_SEPARATOR}${text}`,
    subtitle,
  });
  const plan = titleCardPlan(lines, TIMING);
  const display = tokens.type.display64;
  const labelType = tokens.type.label;
  const fromBlack = interpolate(frame, [0, msToFrames(duration.scene, fps)], [0, 1], {
    ...clamp,
    easing: easeOut,
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: tokens.color.background,
        justifyContent: 'center',
        padding: px(tokens.space[6]),
      }}
    >
      <div style={{ opacity: fromBlack }}>
        {label ? (
          <div
            style={{
              fontFamily: labelType.family,
              fontSize: px(labelType.size),
              lineHeight: `${px(labelType.lineHeight)}px`,
              letterSpacing: px(labelType.letterSpacing),
              textTransform: labelType.textTransform,
              color: tokens.color.text,
              marginBottom: px(tokens.space[4]),
            }}
          >
            {label}
          </div>
        ) : null}
        {lines.map((_, lineIndex) => (
          <div
            key={lineIndex}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              overflow: 'hidden',
              fontFamily: display.family,
              fontSize: px(display.size),
              lineHeight: `${px(display.lineHeight)}px`,
              color: tokens.color.text,
            }}
          >
            {plan.steps
              .filter((step) => step.line === lineIndex)
              .map((step, i, lineSteps) => {
                const start = msToFrames(step.delayMs, fps);
                const end = start + Math.max(1, msToFrames(step.durationMs, fps));
                const t = reducedMotion
                  ? 1
                  : interpolate(frame, [start, end], [0, 1], { ...clamp, easing: easeOut });
                return (
                  <span
                    key={step.word}
                    style={{
                      display: 'inline-block',
                      whiteSpace: 'pre',
                      opacity: t,
                      transform: `translateY(${(1 - t) * 100}%)`,
                    }}
                  >
                    {i < lineSteps.length - 1 ? `${step.text} ` : step.text}
                  </span>
                );
              })}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}
