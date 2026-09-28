import type { RenderManifestV2 } from '@life/contracts';
import { tokens } from '@life/design';
import { msToFrames } from '@life/story';
import {
  AbsoluteFill,
  Html5Audio,
  Img,
  OffthreadVideo,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { mediaFit } from '../frame';
import { resolveSrc } from '../resolveSrc';
import { px } from '../scale';

type Segment = RenderManifestV2['segments'][number];
export type SegmentMedia = Extract<Segment, { kind: 'shot' }>['media'];
export type Background = NonNullable<Extract<Segment, { kind: 'closing' }>['background']>;
type Photo = Extract<SegmentMedia, { type: 'photo' }>;

/** Library clips keep their own sound at this level; answers play at 1. */
const NATURAL_VOLUME = 0.4;
const VOLUME = { full: 1, natural: NATURAL_VOLUME, none: 0 } as const;

function useFit() {
  const { width, height } = useVideoConfig();
  return mediaFit(width, height);
}

function PhotoMedia({ media, reducedMotion }: { media: Photo; reducedMotion: boolean }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const fit = useFit();
  const from = media.kenBurns?.fromScale ?? 1;
  const to = media.kenBurns?.toScale ?? 1;
  const scale = reducedMotion
    ? from
    : interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [from, to], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
  return (
    <AbsoluteFill style={{ overflow: 'hidden', backgroundColor: tokens.color.background }}>
      <Img
        src={resolveSrc(media.src)}
        style={{ width: '100%', height: '100%', objectFit: fit, transform: `scale(${scale})` }}
      />
    </AbsoluteFill>
  );
}

function VideoMedia({ src, inMs, volume }: { src: string; inMs: number; volume: number }) {
  const { fps } = useVideoConfig();
  const fit = useFit();
  return (
    <AbsoluteFill style={{ backgroundColor: tokens.color.background }}>
      <OffthreadVideo
        src={resolveSrc(src)}
        trimBefore={msToFrames(inMs, fps)}
        muted={volume === 0}
        volume={volume}
        style={{ width: '100%', height: '100%', objectFit: fit }}
      />
    </AbsoluteFill>
  );
}

/** A voice answer: its own sound under a card with the question it answered. */
function VoiceMedia({ media }: { media: Extract<SegmentMedia, { type: 'voice' }> }) {
  const { fps } = useVideoConfig();
  const question = tokens.type.question;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: tokens.color.surface,
        justifyContent: 'center',
        padding: px(tokens.space[6]),
      }}
    >
      <Html5Audio src={resolveSrc(media.src)} trimBefore={msToFrames(media.inMs, fps)} volume={1} />
      {media.question ? (
        <div
          style={{
            fontFamily: question.family,
            fontSize: px(question.size),
            lineHeight: `${px(question.lineHeight)}px`,
            color: tokens.color.text,
          }}
        >
          {media.question}
        </div>
      ) : null}
    </AbsoluteFill>
  );
}

/** A cold open's or shot's picture and sound. */
export function Media({ media, reducedMotion }: { media: SegmentMedia; reducedMotion: boolean }) {
  if (media.type === 'photo') return <PhotoMedia media={media} reducedMotion={reducedMotion} />;
  if (media.type === 'voice') return <VoiceMedia media={media} />;
  return <VideoMedia src={media.src} inMs={media.inMs} volume={VOLUME[media.sound]} />;
}

/** Theatre black over a background, so the card's text reads over it. */
const DIM_OPACITY = 0.6;

/** A muted picture behind a card, dimmed. */
export function DimmedBackground({
  background,
  reducedMotion,
}: {
  background: Background;
  reducedMotion: boolean;
}) {
  return (
    <AbsoluteFill>
      {background.type === 'photo' ? (
        <PhotoMedia media={background} reducedMotion={reducedMotion} />
      ) : (
        <VideoMedia src={background.src} inMs={background.inMs} volume={0} />
      )}
      <AbsoluteFill style={{ backgroundColor: tokens.color.background, opacity: DIM_OPACITY }} />
    </AbsoluteFill>
  );
}
