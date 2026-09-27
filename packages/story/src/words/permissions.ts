// Permission wording: the system prompts (mirrored in apps/mobile/app.json) and the in-app words when a
// permission is off. Plain, specific, never pushy.
export const permissionWords = {
  prompts: {
    camera: 'Life Documentary uses the camera to record your ten-second answers and take photos.',
    microphone: 'Life Documentary uses the microphone to record your voice when you answer.',
    photos: 'Life Documentary opens your photo library so you can pick a photo or clip to add.',
    location:
      'Life Documentary uses your location only to find the name of a place you add to a moment.',
  },
  denied: {
    camera:
      "The camera is off for Life Documentary. Turn it on in your phone's Settings to record answers and take photos.",
    microphone:
      "The microphone is off for Life Documentary. Turn it on in your phone's Settings to record your voice.",
    location:
      "Location is off for Life Documentary. Turn it on in your phone's Settings to add a place to a moment. It isn't used for anything else.",
  },
  openError: "Your documentary couldn't open. Close the app and open it again.",
} as const;
