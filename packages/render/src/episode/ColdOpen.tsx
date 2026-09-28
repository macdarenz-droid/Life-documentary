import { tokens } from '@life/design';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { letterboxBarPx } from '../frame';
import { Media, type SegmentMedia } from './Media';

/** The cold open: its media with its own sound, letterboxed. */
export function ColdOpen({
  media,
  reducedMotion,
}: {
  media: SegmentMedia;
  reducedMotion: boolean;
}) {
  const { width, height } = useVideoConfig();
  const bar = letterboxBarPx(width, height, tokens.motion.letterboxAspect);
  const barStyle = {
    position: 'absolute',
    left: 0,
    right: 0,
    height: bar,
    backgroundColor: tokens.color.theatreBlack,
  } as const;
  return (
    <AbsoluteFill>
      <Media media={media} reducedMotion={reducedMotion} />
      <div style={{ ...barStyle, top: 0 }} />
      <div style={{ ...barStyle, bottom: 0 }} />
    </AbsoluteFill>
  );
}
