# TRIGGERED - The Joe Ejection

## What This Is
A browser-playable infinite vertical scroller. Joe gets triggered by a text message, clings to a rocket, and ejects into space. Player taps left/right halves of the screen (or A/D / arrow keys) to dodge obstacles. Every trigger message that pops as a notification accelerates the rocket. Score = how long you survive before exploding.

Sister game to `baldin-ring/`. Same cast universe, same tech stack, same charm-over-polish tone.

## Quality Bar
Personal joke game for the group chat. Funny > pretty. Has to be readable on a phone (one-handed, vertical orientation). Friends-only audience.

## Hosted At
- **Live URL:** https://mcastelli99.github.io/triggered/
- **Repo:** https://github.com/mcastelli99/triggered
- GitHub Pages from `main` branch root. Push to `main` to deploy.

## Files
| File | What It Is | When to Read It |
|---|---|---|
| `index.html` | Page shell, canvas, mobile viewport meta, touch zones | Changing page structure |
| `style.css` | Page + canvas styling, touch zone overlays + active feedback | Adjusting visual chrome |
| `game.js` | Full game (state, render, input, triggers, Joe art, audio) | Anything gameplay or visual |
| `assets/Joe.jpg` | Real photo of Joe used as the in-game character head | Replacing Joe's likeness |
| `about_this_project.md` | This file | Onboarding new context |
| `_project-state.md` | Current status + next steps | Resuming work |

## Key Concepts
- **Joe:** mostly bald (the "M" widow's peak is HISTORICAL - has fully receded). Italian, not Arabic. Real photo `assets/Joe.jpg` is clipped to an oval and used as the in-game character. Cartoon arms + distress overlays drawn on top.
- **Trigger notifications:** Top-of-screen toasts that slide in like phone notifications. They are NOT obstacles. Each one bumps the rocket's speed tier and triggers a pain SFX + Joe emote shout.
- **Trigger tiers:**
  - Mild (Danny job pings, Mom plans, Dad errands): +1 speed
  - Spicy (Frank rally, Kirk takes, penis size discourse): +1 speed + screen shake
  - Nuclear (IT - ex-wife): +2 speed + red flash + bigger scream
- **Joe's emote shouts:** "JESUS CHRIST", "FACK", "TODAY... IS THE WORST DAY OF MY LIFE.", etc. Comic-book yellow burst bubbles above his head when triggered (55% chance, 90% on nuclear).
- **Speed scaling:** 12 tiers. Lateral speed also scales with tier so dodging stays possible at top speed (skill ceiling).
- **Audio:** Web Audio (no files). Alarm-style music with tempo that accelerates with speed tier. Pain SFX (mild grunt / spicy yelp / nuclear shriek) on each trigger. Death explosion on hit.
- **Infinite run:** No levels. You play until you blow up. High score persists in localStorage per device.

## Cast (Trigger Sources)
- **Frank** - well-meaning friend trying to rally Joe (Joe is sensitive). ~33% betting (his hammers + asking Joe's plays), ~22% sexual conquest brags ("PR mom", "21 yr old's IG MN", uses "hy"/"MN" chat lingo), ~22% casual watch-party/wings/Piggy MN setups, ~22% weed gummies + life banter. **Does NOT drink** (the group doesn't party like that). Does edibles.
- **Danny** - pestering questions about Joe's job search + Kirk takedown takes.
- **IT (ex-wife)** - NUCLEAR tier. Updates about Nathan + Alex, swap requests, her vacations, dropping laundry off, her new job, started dating.
- **Mom** - always making plans Joe doesn't want (christenings, brunches, family events) + asking for Carolyn to text her.
- **Dad** - pesky errands ("take the mail in", "return this Amazon", "fix the wifi", "drive to airport").
- **chat** - random penis-size discourse (either direction).

## Tech Stack
- HTML5 + Canvas + plain JS (no framework, no build step)
- Mobile-first: touch zones (left/right halves) with visual active feedback
- Keyboard fallback: A/D or arrow keys, M to mute
- Web Audio for music + SFX (procedural, no files)
- High score in localStorage
- Hosted via GitHub Pages

## Naming
- Game title: **TRIGGERED**
- Subtitle: **The Joe Ejection**
- Hero: **Joe** (the M nickname is historical)
