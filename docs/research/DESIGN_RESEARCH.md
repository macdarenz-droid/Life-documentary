# Design research — premium motion, typography, stack (26 September 2026)

Evidence behind `docs/design/DESIGN.md`. Items marked *(unverified)* were not confirmed against a source.

## Key findings
- **Use Expo SDK 57's bundled versions, not npm latest.** From `expo@57.0.25` bundledNativeModules.json: react-native 0.86.3, Reanimated 4.5.1, worklets 0.10.1, Gesture Handler ~2.32.0, Skia 2.6.2, FlashList 2.0.2, screens ~4.26.0. Reanimated 4.7.0 (npm latest) needs worklets 0.13. Always `npx expo install`.
- **Shared-element transitions are still experimental** on the New Architecture (Reanimated ≥ 4.2 behind `ENABLE_SHARED_ELEMENT_TRANSITIONS`, native stack only, no custom animation functions). expo-router `Link.AppleZoom` is alpha, iOS 18+ only, no zoom on Android; known issues expo#42797 (about 1 s delay on rapid re-open) and expo#50042 (source view stops following its ScrollView during dismissal). Neither may be the only path to continuity.
- **Remotion 4.0.529** ships many more transitions (dissolve, blurSlide, crossZoom, linearBlur, pushCut, filmBurn and others) and `@remotion/effects` (noise, vignette, light-leak, lut, color-correction…). `@remotion/light-leaks` is deprecated in favour of `@remotion/effects/light-leak`. `filmBurn` needs a Chrome flag: risky on a render server.

## Reference set
| Reference | What makes it premium | What we borrow |
|---|---|---|
| Apple TV app, iOS 26 redesign | Cinematic poster art; chrome "keeps the focus on what's playing" | Full-bleed episode stills; thin chrome over footage |
| Apple product pages *(not fetched)* | Scroll-scrubbed footage, pinned sections, masked type reveals | Scrubbed trailer at the top of an episode |
| Apple WWDC18 "Designing Fluid Interfaces", WWDC23 "Animate with springs" | Springs keep velocity when interrupted; bounce 0 by default, ~0.15 subtle, careful above 0.4 | Every move is an interruptible spring, bounce 0–0.15 |
| Severance main titles (Emmy) | Minimal type over dominant surreal footage | Episode titles: small tracked type, long holds |
| A24 | Restraint; huge display type; black and white bands; museum-label type | Huge quiet titles, lots of black |
| MUBI (Spin) | Film stills not posters; one sans at 300/500; one accent per band | Footage is the colour; two type weights |
| Letterboxd / Criterion *(observed)* | Backdrop stills fading into dark UI; editorial serif | Backdrop fade hero |
| Linear 2026 refresh | Navigation dimmed so content stands forward | Secondary chrome at ~60% |
| Family ("Family Values") | Trays that morph; persistent objects; text morph; delight scaled to rarity | Tray system, text morph, frequency rule |
| Rauno Freiberg, "Invisible Details of Interaction Design" | Interruptibility, momentum, spatial consistency; frequent actions do not animate | Gesture-driven dismissals |
| Emil Kowalski (Vaul, Sonner, animate-expo skill) | Custom beziers, never ease-in, UI under 300 ms, press scale 0.97, never scale from 0; haptic same frame as visual | Most numbers below |
| Airbnb 2025 "Lava" | Brand motion as tiny transparent video, not vector animation | Brand motion = our footage |
| Retro | The week as a filmstrip, rewind through past weeks | Filmstrip with scrub |
| Awwwards SOTY: Igloo Inc (2024), Messenger (2025) | Shader-level texture; scroll decoupled from playback so the camera is eased | Grain and light used sparingly; eased scroll |

## Principles that separate premium from template motion
1. Springs for anything spatial; curves for opacity and colour only (Apple WWDC23; Material 3 Expressive).
2. Interruptible and gesture-driven; releases inherit velocity.
3. Continuity: objects travel, spatially consistent.
4. Choreography: stagger 30–80 ms; stagger never blocks input; exits faster than entrances.
5. Restraint by frequency (Apple HIG Motion: "avoid adding motion to interactions that occur frequently").
6. Only transform and opacity animate.
7. 120 fps: 8 ms frame budget; `CADisableMinimumFrameDurationOnPhone` true (default from RN 0.82); judge in Release builds only (Debug stutters at 120 Hz).
8. Reduced motion is gentler: drop translation, scale, parallax, overshoot; keep opacity and colour; screen transitions become fades.

## Numbers
- Material 3 Standard springs (damping ratio / stiffness): fast-spatial 0.9/1400, default-spatial 0.9/700, slow-spatial 0.9/300, fast-effects 1.0/3800, default-effects 1.0/1600, slow-effects 1.0/800. Expressive spatial values *(unverified)*.
- Apple: duration + bounce; bounce 0 default, 0.15 subtle, 0.3 noticeable; presets smooth/snappy/bouncy 0.5 s at 0/0.15/0.3 *(unverified)*.
- Emil Kowalski: default spring `{duration:400, dampingRatio:1}`; after drag `{400, 0.8, velocity}`; sheet `{300, 0.8, velocity}`; ease-out (0.23,1,0.32,1); ease-in-out (0.77,0,0.175,1); iOS sheet (0.32,0.72,0,1) at 500 ms; press 100–160 ms at 0.97; toggles 150–200 ms; entrances from scale 0.9–0.97; stagger 30–80 ms.
- Reanimated 4 `withSpring` defaults: mass 4, stiffness 900, damping 120, or duration 550 with dampingRatio 1 (perceptual duration; actual ≈ 1.5×). `stiffness` cannot be mixed with `dampingRatio`: convert with c = ζ·2√(k·m).

## React Native / Expo stack (npm latest vs SDK 57 pin)
| Package | npm latest | SDK 57 | Use |
|---|---|---|---|
| react-native-reanimated | 4.7.0 | 4.5.1 | Core engine; CSS-style transitions and keyframes off the JS thread; shared elements experimental |
| react-native-worklets | 0.13.0 | 0.10.1 | Reanimated peer |
| react-native-gesture-handler | 3.3.0 | ~2.32.0 | Gestures; v3 hook API needs a major upgrade task |
| @shopify/react-native-skia | 2.13.0 | 2.6.2 | Grain shader, blur, masks; hero surfaces only |
| react-native-screens | 4.28.0 | ~4.26.0 | Native stack, formSheet detents |
| expo-router | 57.0.23 | 57.0.x | `Link.AppleZoom` alpha, iOS 18+ |
| react-native-screen-transitions | *(not checked)* | — | Reanimated-first custom stack transitions, Bounds shared elements (React Navigation blog, Apr 2026) |
| expo-image | 57.0.5 | ~57.0.5 | Cross-dissolve transition, blurhash/thumbhash, prefetch |
| expo-video | 57.0.5 | ~57.0.5 | Hero playback, living thumbnails |
| expo-blur | 57.0.3 | ~57.0.3 | Static chrome material |
| expo-haptics | 57.0.3 | ~57.0.3 | Selection and light impact |
| expo-glass-effect | 57.0.4 | ~57.0.4 | iOS 26 Liquid Glass, optional for playback chrome |
| moti | 0.30.0 | — | Stagnant since Jan 2025: skip |
| @rive-app/react-native / lottie-react-native | 0.4.20 / 7.5.0 | — / ~7.3.8 | Barely needed: footage is the brand |
| @shopify/flash-list | 2.3.2 | 2.0.2 | Lists, masonry |
| @legendapp/list | 3.4.0 | — | Alternative for timelines, newer |
| @gorhom/bottom-sheet | 5.2.14 | — | Only if formSheet cannot morph |

## Typography
- Open licence: **Instrument Serif** (OFL 1.1, condensed display serif with italic; `@expo-google-fonts/instrument-serif`) + **Inter 4** (OFL; static Inter Display for ≥ 28 pt). Alternative serif: Fraunces (OFL).
- Paid upgrade: **GT Sectra Display** (Grilli Type app licence) + **Söhne** (Klim app licence by MAU tier). Prices *(unverified)*.
- MUBI discipline: two weights; uppercase tracked labels; tabular numbers for timecodes.

## Remotion
- `@remotion/transitions` presentations (checked in the package): fade, slide, wipe, flip, clockWipe, iris, none, dissolve, blurSlide, crossZoom, crosswarp, dreamyZoom, filmBurn, linearBlur, pushCut, ripple, swap, zoomBlur, zoomInOut, bookFlip. `springTiming` with `durationRestThreshold: 0.001`.
- Light leak: `lightLeak({ seed, hueShift, progress })` from `@remotion/effects/light-leak` (4.0.500+, WebGL2) on a `TransitionSeries.Overlay`.
- `@remotion/noise` for grain; `@remotion/layout-utils` for fitting titles; `@remotion/captions` for word captions.
- Premium title sequences (Severance, A24): type small and confident or huge and quiet; long holds; cut on music; one typeface; grain and vignette at 3–5%; 2.39:1 letterbox; only dissolve, fade, linearBlur, pushCut.

## Sources
Apple HIG Motion (developer.apple.com/design/human-interface-guidelines/motion) · WWDC23 Animate with springs (developer.apple.com/videos/play/wwdc2023/10158/) · Material 3 motion (m3.material.io/styles/motion/overview/how-it-works) · M3 tokens (github.com/lobsterbs/m3-expressive-web) · rauno.me/craft/interaction-design · emilkowal.ski/ui/building-a-drawer-component · github.com/emilkowalski/skills (animate-expo, review-animations) · benji.org/family-values · linear.app/now/behind-the-latest-design-refresh · apple.com/newsroom/2025/06 (Apple TV redesign) · artofthetitle.com/title/severance/ · styles.refero.design (A24) · spin.co.uk/projects/mubi · techcrunch.com/2026/08/28 (Retro) · awwwards.com/sites/igloo-inc · awwwards.com/websites/sites_of_the_year/ · docs.swmansion.com/react-native-reanimated (withSpring, CSS transitions, shared element transitions) · reactnavigation.org/docs/shared-element-transitions/ · docs.expo.dev/router/advanced/zoom-transition/ · github.com/expo/expo/issues/42797 · github.com/expo/expo/issues/50042 · reactnavigation.org/blog/2026/04/27/building-custom-screen-transitions/ · docs.expo.dev/versions/latest/sdk/image/ · legendapp.com/open-source/list/v3/overview/ · github.com/software-mansion/react-native-reanimated/discussions/9641 · fonts.google.com/specimen/Instrument+Serif · rsms.me/inter/ · grillitype.com/typeface/gt-sectra · klim.co.nz (app licensing) · remotion.dev/docs/transitions/timings/springtiming · remotion.dev/docs/effects/light-leak · remotion.dev/docs/light-leaks · npm registry and expo@57.0.25 bundledNativeModules.json (checked 2026-09-26).
