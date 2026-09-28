import type { RenderManifestV2 } from '@life/contracts';
import { rgba, tokens } from '@life/design';
import { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { px } from '../scale';
import { captionPages, type CaptionPage } from './captionPages';

const { scrim, text, textSecondary } = tokens.color;
const caption = tokens.type.bodyStrong;
/** The box under a page: the scrim colour, solid enough that both word colours pass AA over white. */
export const CAPTION_BOX_OPACITY = 0.85;
/** Captions sit above the bottom safe area in 9:16 and in the lower band in 16:9. */
const PORTRAIT_BOTTOM = 0.2;
const LANDSCAPE_BOTTOM = 0.05;
const LANDSCAPE_MAX_WIDTH = 0.6;
const MAX_LINES = 2;
const fontSize = px(caption.size);
const lineHeight = caption.lineHeight / caption.size;
const padding = px(tokens.space[2]);
const MAX_BOX_PX = fontSize * lineHeight * MAX_LINES + padding * 2;

/** Pixels from the bottom of the frame to the bottom of the caption box. */
export function captionBottomPx(width: number, height: number): number {
  return height * (height > width ? PORTRAIT_BOTTOM : LANDSCAPE_BOTTOM);
}

/** Pixels from the bottom of the frame to the top of the tallest caption box (two lines). */
export function captionTopPx(width: number, height: number): number {
  return captionBottomPx(width, height) + MAX_BOX_PX;
}

type Page = CaptionPage & { approximate: boolean };

/** The caption page under the current time, word by word, on a solid box. */
export function Captions({ manifest }: { manifest: RenderManifestV2 }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const pages = useMemo<Page[]>(
    () =>
      manifest.speech.flatMap((unit) =>
        captionPages(unit).map((p) => ({ ...p, approximate: unit.approximate })),
      ),
    [manifest.speech],
  );
  const ms = (frame * 1000) / fps;
  const segment = manifest.segments.find((s) => ms >= s.fromMs && ms < s.toMs);
  if (!segment || segment.kind === 'title' || segment.kind === 'closing') return null;
  const page = pages.find((p) => ms >= p.fromMs && ms < p.toMs);
  if (!page) return null;

  const portrait = height > width;
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center' }}>
      <div
        style={{
          marginBottom: captionBottomPx(width, height),
          marginLeft: px(tokens.space[4]),
          marginRight: px(tokens.space[4]),
          maxWidth: portrait ? undefined : width * LANDSCAPE_MAX_WIDTH,
          padding: `${padding}px ${px(tokens.space[4])}px`,
          borderRadius: px(tokens.radius.md),
          backgroundColor: rgba(scrim.hex, CAPTION_BOX_OPACITY),
          fontFamily: caption.family,
          fontSize,
          lineHeight,
          textAlign: 'center',
          whiteSpace: 'pre-wrap',
          maxHeight: MAX_BOX_PX,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: MAX_LINES,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {page.words.map((w, i) => {
          const spoken = page.approximate || (ms >= w.fromMs && ms < w.toMs);
          return (
            <span
              key={i}
              style={{ color: spoken ? text : rgba(textSecondary.hex, textSecondary.alpha) }}
            >
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
