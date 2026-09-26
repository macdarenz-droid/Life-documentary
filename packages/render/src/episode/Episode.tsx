import type { RenderManifestV1 } from '@life/contracts';
import { tokens } from '@life/design';
import { msToFrames, shotStartsMs } from '@life/story';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { Captions } from './Captions';
import { ClosingCard } from './ClosingCard';
import { LowerThird } from './LowerThird';
import { Music } from './Music';
import { Narration } from './Narration';
import { PhotoShot } from './PhotoShot';
import { TitleCard } from './TitleCard';
import { VideoShot } from './VideoShot';

export type EpisodeProps = RenderManifestV1 & { reducedMotion?: boolean };

export function Episode(props: EpisodeProps) {
  const { fps } = useVideoConfig();
  const manifest = props;
  const frames = (ms: number) => msToFrames(ms, fps);
  const starts = shotStartsMs(manifest);
  const lastShot = manifest.shots.length - 1;
  const closingAt =
    (starts[lastShot] ?? manifest.title.durationMs) + (manifest.shots[lastShot]?.durationMs ?? 0);

  return (
    <AbsoluteFill style={{ backgroundColor: tokens.color.background }}>
      <Sequence durationInFrames={frames(manifest.title.durationMs)} name="Title">
        <TitleCard title={manifest.title} />
      </Sequence>
      {manifest.shots.map((shot, i) => (
        <Sequence
          key={i}
          from={frames(starts[i] ?? 0)}
          durationInFrames={frames(shot.durationMs)}
          name={`Shot ${i + 1}`}
        >
          {shot.kind === 'video' ? <VideoShot shot={shot} /> : <PhotoShot shot={shot} />}
        </Sequence>
      ))}
      <Sequence
        from={frames(closingAt)}
        durationInFrames={frames(manifest.closing.durationMs)}
        name="Closing"
      >
        <ClosingCard closing={manifest.closing} credit={manifest.credit} />
      </Sequence>
      {manifest.lowerThirds.map((item, i) => (
        <Sequence
          key={i}
          from={frames(item.atMs)}
          durationInFrames={frames(item.durationMs)}
          name={`Lower third ${i + 1}`}
        >
          <LowerThird item={item} reducedMotion={props.reducedMotion ?? false} />
        </Sequence>
      ))}
      <Captions captions={manifest.captions} />
      <Narration narration={manifest.narration} />
      <Music manifest={manifest} />
    </AbsoluteFill>
  );
}
