# Life Documentary — Vision (September 2026)

The product authority. Plans, phases and tasks serve it; they never redefine it. Owner clarifications are appended at the end and take precedence over the body.

> **Life Documentary.** The documentary of your life, made while you live it.

## 1. The one idea

Everyone is already filming their life. Nobody does anything with the footage. Camera rolls hold thousands of clips no one will ever watch again, and the story those clips tell is lost.

Life Documentary is the documentary crew that follows you. Each day it asks you one question and takes one short clip. Each week it cuts what you gave it into a short, narrated episode of your life: your footage, your own voice, a real story arc, music, titles. Each year those episodes become a season, and the season finale is a film you would actually sit down and watch with the people in it.

The product is not a camera app, not a journal, and not a photo library. It is a **story engine with a daily interview**. The capture is nearly free (ten seconds). The payoff is large and recurring (an episode every week, a film every year).

## 2. Who it is for

**Primary: the documenter.** Age 20–45, already takes photos and clips daily, has tried a journaling app and stopped, wants to remember their life but does not want homework. They will give the app ten seconds a day if the weekly result moves them.

**Secondary: the cast.** Partner, children, parents, close friends who appear in the story. They can be invited as **crew** to add their own clips to a shared documentary, and they are the audience for every episode.

**Later: the legacy buyer.** Adult children who want their parents' story told before it is gone. This is the StoryWorth and Remento market, and Life Documentary reaches it once the core loop is proven (a gifted subscription that interviews a parent by voice every week).

## 3. What makes it click

These are the interaction rules the product is built on. Each comes from evidence in `docs/research/MARKET_RESEARCH.md`.

1. **The interview, not the blank page.** The app is a documentary interviewer. Once a day it asks one specific question drawn from your context ("You were at the lake for the first time this year. What was the water like?") and you answer in ten seconds of video or voice. Answering is the capture. There is never an empty text box to face.
2. **Your voice is the narration.** The user's own recorded lines are the spine of every episode. The AI narrator frames, connects and titles; it never paraphrases the user into someone else's words. (Remento's users love the real voice and dislike the AI rewrite. We keep the voice.)
3. **Weekly episode, never a daily streak.** A missed day is a quiet day in the episode, not a broken streak. The unit of success is the episode, delivered every Sunday evening. Weekly cadence tolerates real life; daily obligation (BeReal) burns out.
4. **Cutting the episode is the play.** The episode arrives as a finished cut. You can then re-title it, swap the narrator's line for your own, drop a clip, pick another closing shot, choose the music mood. Each edit takes one tap and re-renders. This is where users spend time and feel authorship.
5. **Storylines.** The story engine tracks threads across weeks: "the new job", "training for the half marathon", "Grandma's visits". You can open a storyline; the interviewer then asks follow-up questions about it. Storylines are how the documentary gets a real arc instead of a slideshow.
6. **Cast and crew.** People in your life are cast members (named by you, on your device only). Crew can add clips and answers to a shared documentary. Episodes are watched together. Intimate audiences retain (Retro 45.7% daily engagement, Locket "we're all doing this together"); followers do not.
7. **The premiere.** The season finale (yearly film, 8–12 minutes) is a scheduled event: a date, a poster, a trailer the week before, a shareable clip. This is the Spotify Wrapped moment of the product and its main acquisition event.
8. **Home screen presence.** A widget shows today's question, the last episode's still, or "one year ago today". The app is present without being opened.
9. **You own the film.** One tap exports every episode as MP4 and every answer as audio plus a JSON archive. If the company disappears, the documentary survives. No content is ever used to train models.

## 4. The core loop

```
Day     ask one question → 10 s answer (video or voice) → optional extra clips/photos
Week    Sunday 18:00 local: "Episode N is ready" → watch → one-tap edits → share with crew
Month   a recap card: storylines that moved, people seen most, the best line you said
Year    trailer (week 51) → premiere (chosen date) → season film → share clip
Always  widget: today's question · last still · one year ago today
```

## 5. What an episode is

- 2–4 minutes, 1080p vertical (9:16) by default with a 16:9 export.
- Structure: cold open (the best line of the week) → title card ("Episode 37 · The Week the Kitchen Flooded") → 3–5 scenes grouped by storyline or day → closing shot → next-week tease if a storyline is open.
- Narration: the user's recorded answers, lightly cut for pauses, with the AI narrator only for scene bridges ("Tuesday. The plumber did not come."). Narrator voice is chosen from a small cast of documentary voices; the user's own cloned voice is never offered without explicit recorded consent and is not in launch scope.
- Music: licensed library tracks selected by mood; never generated music at launch (licensing risk).
- Titles, lower-thirds for cast members, dates, and place names when the user allowed location.
- Generative video is not used for content. The user's footage is the content. Generative B-roll is a possible later premium add-on only if it clearly improves episodes.

## 6. Launch scope (what "done" means for release 1)

| Area | Capability | In release 1 |
|---|---|---|
| Capture | Daily question with a 10 s video or voice answer; add clips and photos from the camera or the library; a one-line text note; mood | Yes |
| Story engine | Weekly episode: script, scene selection, narration bridges, titles, music, render | Yes |
| Editing | Re-title, swap narrator line, drop a clip, choose closing shot, choose music mood; re-render | Yes |
| Storylines | Create, name, open, close; interviewer follow-ups | Yes |
| Cast | Name people (on device); lower-thirds | Yes |
| Crew | Invite up to 5 people to a shared documentary; they add answers and clips | Yes, after the solo loop works |
| Presence | Notification for the daily question and the finished episode; home-screen widget | Yes |
| Season | Yearly film, trailer, premiere date, share clip | Yes (first premiere is release 2 if the calendar says so; the pipeline ships in release 1) |
| Ownership | Export all episodes (MP4) and answers (audio + JSON); delete everything | Yes |
| Privacy | Originals on device; previews processed then deleted; only chosen clips kept for an episode; no training; no face or voice biometrics; clear consent per crew documentary | Yes |
| Legacy | Printed book, gifted interviewer for a parent | Later |
| Social | Public feed, followers, likes | Never |

## 7. Business model (working assumption, owner decides)

Evidence: memory apps cluster at $36–50 per year; AI is priced as a higher tier; physical output reaches $99–199; Photo & Video is the weakest category for trial conversion, so the free tier must be a real product and the paid tier must be obviously more.

| Tier | What you get | Price |
|---|---|---|
| Free | Unlimited capture, daily interview, local archive, a monthly 60-second recap with music (no narration), full export | $0 |
| Documentary | Weekly narrated episodes, storylines, season film and premiere, cloud backup 50 GB, crew of up to 5 | $4.99/month or $39.99/year |
| Family | Documentary for up to 6 people, shared documentaries, 300 GB | $69.99/year |
| Legacy (later) | Printed season book; a gifted interviewer plan for a parent | $99–149 one-off |

Rules: nothing that was free becomes paid later (1SE and Snapchat backlash). Storage is tiered from day one, never "unlimited" (Lapse). Never ads.

## 8. Trust rules (non-negotiable)

- Originals live **on the device** first. To understand a week, the service receives only small previews (photos downsampled to about 1,000 px, short voice answers) and deletes them after the text it needs (captions, transcripts) is written. Only the full clips chosen for an episode are kept in the cloud, and only for that episode, unless the user turned on Cloud backup (paid tiers).
- **No training** on user content, ever, in the terms and in the contracts with providers.
- Faces are grouped only on the device by the platform's own frameworks; the service never stores face embeddings or biometric identifiers.
- Location is opt-in per documentary and is shown as a place name, never coordinates, in episodes.
- Crew content stays inside the shared documentary; leaving a crew removes your future contributions and lets you take your past ones.
- Full export and full deletion (within 30 days) are one tap each, in every tier.
- A published survivability promise: if the service closes, users get 12 months' notice and an automatic full export.

## 9. Success measures

| Measure | Target at 90 days after release 1 |
|---|---|
| Daily question answered | 45% of active users on any given day |
| Episode watched within 48 h of delivery | 70% of delivered episodes |
| Episodes edited at least once | 40% |
| Week-8 retention (opened the app in week 8) | 35% |
| Crew invitation accepted | 1.5 crew per paying documentary |
| Free to Documentary conversion | 8% by day 35 |
| Episode production cost | under $0.40 per episode at the median |
| Episode delivery | 95% delivered by Sunday 18:00 local, 99% by 21:00 |

## 10. Look and feel

Cinema, not social. Dark theatre interface by default; the footage is the colour. Quiet typography, film-style title cards, a documentary tone in every string (warm, specific, never cute or gamified). No confetti, no badges, no streak flames. Accessibility: WCAG 2.2 AA, captions on every episode by default, reduced-motion respected.

Working palette (design system to confirm in P2):

| Token | Hex |
|---|---|
| Theatre Black | `#0A0A0C` |
| Velvet | `#1A1418` |
| Screen White | `#F4F1EC` |
| Film Amber | `#E0A458` |
| Projector Cyan | `#7FD1E6` |

## 11. Risks the vision accepts

- **Apple or Google ship a free "movie of your memories".** They already do (Memories, Highlight Video). They do not interview you, do not keep your voice as narration, do not track storylines across years, and do not make a premiere. The moat is the interview and the arc, not the render.
- **AI apps churn faster than non-AI apps** (RevenueCat 2026). The habit is the weekly episode and the daily question, not the AI. If the AI were removed, the recap would still arrive.
- **Cost per episode.** Narration and music are cheap; generative video is not. Generative video is out of scope for content.
- **Media storage cost.** Tiered from day one; the device is the primary store.

## Owner clarifications

- 2026-09-26 · "I'm using the repo as fresh, we will use this repo for this product." The repository `macdarenz-droid/Life-documentary` is the product's home.
- 2026-09-26 · The product definition in this file is the supervisor's working definition from research. The owner has not yet confirmed or corrected it. Until then it is the authority for architecture and tasks.
