import type { RenderManifestV2 } from '@life/contracts';
import { tokens } from '@life/design';
import { msToFrames } from '@life/story';
import type { ReactNode } from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { loadFonts } from '../fonts';
import { ClosingCard } from './ClosingCard';
import { ColdOpen } from './ColdOpen';
import { Grain } from './Grain';
import { LowerThird } from './LowerThird';
import { Media } from './Media';
import { Music } from './Music';
import { Narration } from './Narration';
import { SceneLabel } from './SceneLabel';
import { SceneOpen } from './SceneOpen';
import { Tease } from './Tease';
import { TitleCard } from './TitleCard';

export type EpisodeProps = RenderManifestV2 & { reducedMotion?: boolean };
type Segment = RenderManifestV2['segments'][number];

loadFonts();

function SegmentView({ segment, reducedMotion }: { segment: Segment; reducedMotion: boolean }) {
  switch (segment.kind) {
    case 'coldOpen':
      return <ColdOpen media={segment.media} reducedMotion={reducedMotion} />;
    case 'title':
      return (
        <TitleCard
          label={segment.label}
          text={segment.text}
          subtitle={segment.subtitle}
          reducedMotion={reducedMotion}
        />
      );
    case 'sceneOpen':
      return <SceneOpen segment={segment} reducedMotion={reducedMotion} />;
    case 'shot':
      return <Media media={segment.media} reducedMotion={reducedMotion} />;
    case 'closing':
      return <ClosingCard closing={segment} reducedMotion={reducedMotion} />;
    case 'tease':
      return <Tease segment={segment} />;
  }
}

/** Draws a v2 manifest: the segments back to back, then the overlays, the narration and the music. */
export function Episode(props: EpisodeProps) {
  const { fps } = useVideoConfig();
  const manifest = props;
  const reducedMotion = props.reducedMotion ?? false;
  const frames = (ms: number) => msToFrames(ms, fps);
  // Frames from each span's own rounded ends, so rounding never opens a gap between segments.
  const span = (fromMs: number, toMs: number, name: string, child: ReactNode, key: number) => (
    <Sequence
      key={key}
      from={frames(fromMs)}
      durationInFrames={Math.max(1, frames(toMs) - frames(fromMs))}
      name={name}
    >
      {child}
    </Sequence>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: tokens.color.background }}>
      {manifest.segments.map((segment, i) =>
        span(
          segment.fromMs,
          segment.toMs,
          `${segment.kind} ${i + 1}`,
          <SegmentView segment={segment} reducedMotion={reducedMotion} />,
          i,
        ),
      )}
      {manifest.sceneLabels.map((label, i) =>
        span(
          label.atMs,
          label.atMs + label.durationMs,
          `Scene label ${i + 1}`,
          <SceneLabel text={label.text} />,
          i,
        ),
      )}
      {manifest.lowerThirds.map((item, i) =>
        span(
          item.atMs,
          item.atMs + item.durationMs,
          `Lower third ${i + 1}`,
          <LowerThird item={item} reducedMotion={reducedMotion} />,
          i,
        ),
      )}
      <Grain reducedMotion={reducedMotion} />
      <Narration narration={manifest.narration} />
      <Music manifest={manifest} />
    </AbsoluteFill>
  );
}
