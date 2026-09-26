// A voice recorder over expo-audio. expo-audio creates recorders only through a hook, so this is a hook
// the composition root calls once.
import { RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useMemo } from 'react';
import type { VoiceRecorder } from '../../domain/capturePorts';

export function useExpoVoiceRecorder(): VoiceRecorder {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  return useMemo<VoiceRecorder>(
    () => ({
      start: async (maxMs) => {
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record({ forDuration: maxMs / 1000 });
      },
      stop: async () => {
        const seconds = recorder.currentTime;
        await recorder.stop();
        return recorder.uri ? { uri: recorder.uri, durationMs: Math.round(seconds * 1000) } : null;
      },
    }),
    [recorder],
  );
}
