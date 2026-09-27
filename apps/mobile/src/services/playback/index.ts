import type { PlaybackViews } from '../../application/captureContext';
import { ExpoAudioView } from './ExpoAudioView';
import { ExpoVideoView } from './ExpoVideoView';

/** The device player views, handed to the capture context by the composition root. */
export const expoPlayback: PlaybackViews = { Video: ExpoVideoView, Audio: ExpoAudioView };
