// Web (the Design Lab): Skia needs CanvasKit first, so the ring loads lazily after LoadSkiaWeb.
import { lazy } from 'react';

export const RecordRing = lazy(async () => {
  const { LoadSkiaWeb } = await import('@shopify/react-native-skia/lib/module/web');
  await LoadSkiaWeb({ locateFile: (file: string) => `/${file}` });
  const mod = await import('./RecordRing');
  return { default: mod.RecordRing };
});
