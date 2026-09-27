# Life Documentary — design direction

The one current picture of how the app and the episodes look and move. The owner asked (2026-09-26) for "premium websites for the design, smooth transitions rather than generic Figma templates". This file turns that into rules, tokens and named transitions a coder can build and a reviewer can check. Research and sources: `docs/research/DESIGN_RESEARCH.md`. Product authority: `docs/VISION.md`.

## 1. The stance

**A film, not an app.** The references are title sequences and cinema brands, not app templates: Apple TV (chrome steps back, artwork carries the screen), Severance's titles (small confident type over dominant imagery, long holds), A24 (huge quiet type, lots of black, museum-label restraint), MUBI (film stills instead of posters, one sans at two weights), Linear's 2026 refresh (secondary chrome dimmed so content stands forward), Family (trays that morph, objects that persist between screens, text that morphs), Retro (the week as a filmstrip).

What makes it premium, and what we therefore require:
1. **The footage is the only colour.** The interface is black, near-black and warm white. Amber is a single accent for one action per screen.
2. **Type is huge and quiet, or small and confident, never medium.** Display serif for titles; one sans at two weights for everything else.
3. **Springs for anything that moves in space; curves only for opacity and colour.** Springs keep the finger's speed when interrupted (Apple WWDC23; Material 3 Expressive moved to springs).
4. **Interruptible and gesture-driven.** Every dismissal follows the finger and can be reversed mid-flight.
5. **Continuity.** Objects travel between screens instead of cutting. The episode still you tapped becomes the player.
6. **Choreography, not simultaneity.** Items arrive in a stagger; exits are faster than entrances.
7. **Restraint by frequency.** Things done many times a day do not animate (tab switch, chip, list scroll). Occasional things get standard motion. Rare moments (a new episode, the premiere) get the full treatment.
8. **Only transform and opacity animate.** Never width, height, margin or layout properties.
9. **120 fps on ProMotion.** Judge smoothness only on Release builds on a real device.
10. **Reduced motion is gentler, not dead.** Translation, scale, parallax and grain animation stop; opacity and colour remain; screen transitions become a fade.

Banned: bouncy overshoot (damping ratio below 0.85), confetti, gradients as decoration, glassmorphism cards, drop-shadow card stacks, emoji in system text, stock illustration, Lottie mascots, template "swoosh" transitions, skeleton shimmer (use a still frame or a blurhash instead).

## 2. Tokens (owned by `packages/design`; the app and the render read the same file)

### Colour
| Token | Hex | Use |
|---|---|---|
| `theatreBlack` | `#0A0A0C` | background |
| `velvet` | `#1A1418` | raised surface (trays, sheets) |
| `screenWhite` | `#F4F1EC` | primary text |
| `ash` | `#F4F1EC` at 60% | secondary text and dimmed chrome |
| `filmAmber` | `#E0A458` | the one primary action per screen, record state |
| `projectorCyan` | `#7FD1E6` | focus ring only |
| `scrim` | `#0A0A0C` at 0→85% | gradient under text on footage |

### Typography (open licence now, paid upgrade later)
- **Display:** Instrument Serif (OFL 1.1), regular and italic. Episode titles, title cards, the daily question, pull quotes. Sizes 34 / 48 / 64.
- **Text:** Inter (OFL) for UI at 400 and 600 only; Inter Display static files for 28 pt and up.
- **Labels:** Inter 600, uppercase, tracking +6%, 12–13 pt: `EPISODE 12 · WEEK OF 14 SEP`.
- **Numbers:** `tabular-nums` for timecodes and durations.
- **Upgrade path (owner decides, paid app licences):** GT Sectra Display + Söhne.

### Motion
```ts
export const spring = {
  press:   { mass: 1, stiffness: 1400, damping: 67 },  // Material 3 fast-spatial, damping ratio 0.9
  move:    { mass: 1, stiffness: 700,  damping: 48 },  // default-spatial 0.9: cards, trays
  scene:   { mass: 1, stiffness: 300,  damping: 31 },  // slow-spatial 0.9: full screen, letterbox
  effect:  { mass: 1, stiffness: 1600, damping: 80 },  // ratio 1.0: opacity or colour on a spring
  release: { duration: 400, dampingRatio: 0.85 },      // after a gesture, with the gesture's velocity
} as const;
export const ease = {
  out:      [0.23, 1, 0.32, 1],     // entrances, reveals
  inOut:    [0.77, 0, 0.175, 1],    // on-screen travel
  sheet:    [0.32, 0.72, 0, 1],     // iOS-like sheets
  dissolve: [0.33, 0, 0.67, 1],     // film dissolves
} as const;
export const duration = { press: 120, micro: 180, ui: 260, dissolve: 320, scene: 520, title: 900, titleHold: 2200 } as const;
export const stagger  = { list: 40, listCap: 6, word: 60, char: 22 } as const;
export const scale    = { press: 0.97, enterFrom: 0.96, cardLift: 1.02 } as const;
export const textMorph = { shift: 0.3 } as const;                 // Text Morph slide, share of the line height
export const texture  = { grainOpacity: 0.035, grainFps: 24, crossfadeBlurPx: 3, kenBurns: { from: 1.0, to: 1.06, ms: 12000 } } as const;
export const letterboxAspect = 2.39;
```
Damping values are computed from the damping ratio with `c = ζ · 2 · √(k · m)`; a unit test pins them (task T-003a). Every spatial token has a reduced-motion equivalent: a fade of `duration.micro`.

### Haptics
Selection haptic on each detent (filmstrip day snap, tray detent). Light impact on record start and stop. Nothing else vibrates. The haptic fires in the same frame as the visual.

## 3. Signature transitions

Each is one component in `apps/mobile/src/design-system/motion/` with a reduced-motion path and a test for that path. Screens use these components; they never hand-roll a transition.

| # | Name | Where | Technique | Library |
|---|---|---|---|---|
| 1 | **Premiere** | Episode still → player | iOS 18+: native fluid zoom that drags to dismiss (expo-router `Link.AppleZoom`, alpha). Elsewhere: a Reanimated shared-bounds transition (react-native-screen-transitions) or a fade-through from scale 0.96. One `PremiereLink` component hides the choice. | expo-router, react-native-screen-transitions, expo-image |
| 2 | **Letterbox** | Entering watch mode | 2.39:1 black bars slide in on `spring.scene` while chrome fades to 0 and the footage scales 1 → 1.03; a drag reverses it mid-flight. | Reanimated, Gesture Handler |
| 3 | **Title Card** | Episode title, the daily question, chapter cards | Masked line reveal (each line rises from behind a clip), 60 ms word stagger, `ease.out` 900 ms, Instrument Serif. Reduced motion: 180 ms fade. | Reanimated |
| 4 | **Dissolve** | Changing day or storyline | 320 ms crossfade; the outgoing frame blurs 3 px. | expo-image `transition`, Skia for the blur |
| 5 | **Filmstrip** | The week on Today and Footage | Horizontal strip; frames scale 1 → 0.92 with distance from centre; snaps per day with a selection haptic. | FlashList v2 + Reanimated scroll handler + expo-haptics |
| 6 | **Tray** | Name a person, add a note, privacy, edit sheets | Family-style tray that morphs height between detents on `spring.move` and follows the finger with inherited velocity. | expo-router `formSheet` detents; @gorhom/bottom-sheet only if morphing needs it |
| 7 | **Grain and Breath** | Home hero, episode backdrop | Film-grain shader at 3.5% opacity, 24 fps, plus a 12 s Ken Burns 1.00 → 1.06. Static under reduced motion. Hero surfaces only, never in lists. | Skia RuntimeEffect, Reanimated |
| 8 | **Text Morph** | The record button ("Hold to answer" → "Recording" → "Saved") | Shared letters stay; the others slide and fade with a 22 ms stagger. | Reanimated layout animations |
| 9 | **Record** | Holding to answer | The screen darkens to `theatreBlack`, the question shrinks to the top in serif italic, an amber ring fills over 10 s; release saves with a light haptic and Text Morph. | Reanimated, Skia ring, expo-haptics |

## 4. The episode look (Remotion, `packages/render`)

Same tokens, same type, same restraint.
- Title sequence: small tracked label over dominant footage, then the title in Instrument Serif with the masked line reveal, a 2.2 s hold, fade from black. Never medium-sized type.
- Cuts: hard cuts on music beats by default. Transitions only `dissolve`, `fade`, `linearBlur` and `pushCut` from `@remotion/transitions`, timed with `springTiming` (`durationRestThreshold: 0.001`). No wipes, flips, ripples or zooms.
- Texture: grain from `@remotion/noise` at 3–5%; `vignette` from `@remotion/effects` at a barely visible level; one `lightLeak` (from `@remotion/effects/light-leak`, not the deprecated `@remotion/light-leaks`) at most per episode, on the title. `filmBurn` is not used (needs a Chrome flag on the render server).
- Captions: word-level with `@remotion/captions`, burned in, Inter 600 on a scrim.
- Letterbox 2.39:1 for the cold open and the season film chapters.

## 5. Library pins (Expo SDK 57's bundled versions; always `npx expo install`)
react-native-reanimated 4.5.1 · react-native-worklets 0.10.1 · react-native-gesture-handler ~2.32.0 · @shopify/react-native-skia 2.6.2 · react-native-screens ~4.26.0 · expo-router ~57.0.23 · expo-image ~57.0.5 · expo-video ~57.0.5 · expo-blur ~57.0.3 · expo-haptics ~57.0.3 · @shopify/flash-list 2.0.2 · @expo-google-fonts/instrument-serif and @expo-google-fonts/inter at the versions `npx expo install` picks · react-native-screen-transitions (version checked when the task that needs it is written). Render: remotion, @remotion/transitions, @remotion/effects, @remotion/noise, @remotion/layout-utils, @remotion/captions at 4.0.529.
Not used: Moti (unmaintained since Jan 2025; Reanimated 4's CSS API covers it), Lottie and Rive mascots.

## 6. How design is reviewed
- Every screen task names which tokens and which signature transitions it uses, and its reduced-motion behaviour.
- A screen task is not done until the supervisor has seen it: a screen recording from a Release build on a device, or, before device builds exist, a web or simulator recording marked "not representative of 120 fps".
- Design review checklist: one amber action per screen; type is display or small, never medium; nothing bounces; nothing frequent animates; exits faster than entrances; reduced motion checked; contrast AA; the footage is the colour.

## 7. Risks
| Risk | Mitigation |
|---|---|
| The zoom transition is alpha; shared elements are experimental | `PremiereLink` hides the implementation and always has a fade-through fallback |
| Skia grain drops frames | Hero surfaces only; measured on a Release build |
| Web or simulator recordings misrepresent smoothness | Final motion sign-off only on a device Release build |
| Paid fonts cost money | Open-licence pairing ships; upgrade is an owner decision |

## 8. Voice

How the app talks. This covers every user-facing string: labels, buttons, errors, questions, notifications, permission prompts and emails. A test refuses the banned phrases and characters.

- **Who we sound like.** A careful writer at a small, design-led app. Think of Apple's own apps, Things or Day One. Calm, plain and specific. Not a chatbot, a coach or an advert.
- **Say it like a person.** Use contractions where you'd say them: "couldn't", "didn't", "what's", "it's". Use the active voice. Pick short, specific words. Say it once and stop.
- **Sentence case** for every label, button and screen title: "Take photo", "Add place". Product and screen names keep their capitals: Life Documentary, Today, Footage, Storylines, Cast, Settings.
- **Buttons** are short verbs that say what happens: "Save", "Flip camera", "Remove it", "Keep it".
- **Errors** say what happened, then what to do, in a line or two: "Couldn't open that clip. Try a different one." Never blame the person. Never "Something went wrong" or "Oops".
- **Empty states** say what goes here, the way you'd say it out loud: "Tag a moment with a storyline and it'll show up here."
- **Questions** sound like a curious friend with a good ear, not a survey or a coach. One question ending in "?", addressed to "you", that can be answered out loud in ten seconds. Ask about something concrete, like a sound, a step or a person. Leave the slot ({storyline}, {person} or {place}) as it is.
- **No guilt and no games.** Never "you missed", "you forgot" or "finally". Never streak, badge, level up, leaderboard, points or XP. People are named by the person, and nothing we write suggests the app recognises faces or voices.
- **No stock phrases.** Never write: at a glance, seamless, effortless, unlock, elevate, dive in, delve, journey, embark, tailored, curated, empower, harness, insights, in just a few taps, made easy, your story your way, cherish, treasure, memories that last, we've got you, Let's, Here's, Great job, Awesome, "Ready to ...?", "whether you're ... or ...", "not just X, but Y", "it's not about X, it's about Y". Don't write a poetic line where a plain one works. Don't keep reaching for soft words like "quiet", "gentle" or "little". No therapy-speak, no rhetorical questions in labels and no emoji.
- **Punctuation.** No exclamation marks. No em dashes, en dashes or semicolons in UI text. Use a full stop or a comma instead. Keep numbers and limits exact: "up to 280 characters", "30 days".
- **Spelling** is British: recognised, colour, favourite, organise.

**Before and after.**

- "This one could not be saved. Try once more." → "Couldn't save that. Give it another try."
- "Your moments gather here, day by day." → "Nothing here yet."
- "If {storyline} were a chapter, what would today's scene be?" → "What's one scene from {storyline} today?"

When in doubt, read it out loud. If you wouldn't say it to a friend, rewrite it. If a plain line already works, leave it alone.

The banned phrases and characters are `voiceBannedPhrases` and `voiceBannedCharacters` in `packages/story/src/words/voice.ts` (from T-012a), and a test checks every user-facing string against them. Task texts quote words in this voice; when a task text and this section disagree, this section wins.
