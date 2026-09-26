// Permission wording: the system prompts (mirrored in apps/mobile/app.json) and the in-app words when a
// permission is off. Plain, specific, never pushy.
export const permissionWords = {
  prompts: {
    camera: 'Life Documentary uses the camera to record your ten-second answers.',
    microphone: 'Life Documentary uses the microphone to record your voice in your answers.',
    photos: 'Life Documentary opens your photo library so you can add a photo or clip you choose.',
    location:
      'Life Documentary uses your location only to name the place of a moment, when you turn this on.',
  },
  denied: {
    camera:
      'The camera is off for Life Documentary. It records your answers. You can turn it on in Settings.',
    microphone:
      'The microphone is off for Life Documentary. It records your voice. You can turn it on in Settings.',
    location:
      'Location is off for Life Documentary. It only names places. You can turn it on in Settings.',
  },
  openError: 'Your documentary could not open. Close the app and open it again.',
} as const;
