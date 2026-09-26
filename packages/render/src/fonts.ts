// The app's fonts (DESIGN §2), loaded from the same @expo-google-fonts files the app bundles, so the
// render needs no network. Each face is registered under the family name in `@life/design`.
import instrumentSerif from '@expo-google-fonts/instrument-serif/400Regular/InstrumentSerif_400Regular.ttf';
import instrumentSerifItalic from '@expo-google-fonts/instrument-serif/400Regular_Italic/InstrumentSerif_400Regular_Italic.ttf';
import interRegular from '@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf';
import interSemiBold from '@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf';
import { fontFamily } from '@life/design';
import { cancelRender, continueRender, delayRender } from 'remotion';

const faces: [family: string, url: string][] = [
  [fontFamily.display, instrumentSerif],
  [fontFamily.displayItalic, instrumentSerifItalic],
  [fontFamily.text, interRegular],
  [fontFamily.textStrong, interSemiBold],
];

let loaded = false;

/** Registers the four faces once; the render waits until they are ready. */
export function loadFonts(): void {
  if (loaded || typeof document === 'undefined') return;
  loaded = true;
  const handle = delayRender('Loading fonts');
  Promise.all(
    faces.map(async ([family, url]) => {
      const face = new FontFace(family, `url('${url}') format('truetype')`);
      document.fonts.add(await face.load());
    }),
  )
    .then(() => continueRender(handle))
    .catch((err: unknown) => cancelRender(err));
}
