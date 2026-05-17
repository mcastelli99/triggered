# Project State - TRIGGERED

**Status:** v2 SHIPPED - playable end to end, with music + SFX + emotes
**Last updated:** 2026-05-17

## Where Things Stand
v1 is DONE. Open `index.html` in any browser (desktop or mobile). Full loop: Title -> first trigger message pops -> Joe clings to rocket -> infinite vertical scroller. Tap or hold left/right halves of screen (or use A/D / arrow keys) to dodge obstacles. New trigger texts fly past periodically and accelerate the rocket. Hit anything = explosion = score screen with new high score celebration. Tap to retry.

Joe rendered procedurally: exaggerated M-shaped widow's peak hairline, black glasses, beard, white sweater, gold chain. Cycles through 5 misery poses (terror, scream, defeated, rage, crying) based on speed tier. The faster he goes the more unhinged the face.

## Key Decisions Made
- **Tech:** HTML5 Canvas + plain JS, single-file game logic, no build step. Same stack as `baldin-ring/`.
- **Format:** Vertical infinite scroller. High-score driven, no level completion.
- **Controls:** Mobile-first touch (left/right halves of screen). Keyboard fallback (A/D + arrow keys).
- **Speed scaling:** Trigger messages bump speed tier. Three trigger tiers (mild +1, spicy +1 + shake, nuclear +2 + flash). Cap at tier 12.
- **Art:** Procedural drawing of Joe in canvas. No external image files. Same approach as baldin-ring's procedural characters.
- **Score:** Survival time in seconds + bonus per trigger absorbed. Persists in localStorage as `joeRocketHighScore`.

## Things Built So Far
- `about_this_project.md` (WHAT)
- `_project-state.md` (WHERE - this file)
- `index.html` - canvas + viewport meta + touch zones
- `style.css` - black space backdrop, touch zone overlays
- `game.js`:
  - State machine (title -> intro -> playing -> gameover)
  - Cold-open intro: phone-screen text appears, Joe reads it, rocket ignites, ejection launches
  - Joe procedural art with M hairline + 5 distress poses + clinging-to-rocket pose
  - Rocket sprite with animated flame trail
  - Starfield + parallax space backdrop
  - Obstacles: asteroids (with craters), satellites (solar panels), UFOs, debris (warning signs)
  - Trigger messages: 60+ variations across Frank / Danny / IT / Mom / random
  - Speed system: 12 tiers, bumps on every trigger absorbed
  - Screen shake on spicy triggers, red flash on nuclear (IT) triggers
  - Collision detection (circle vs circle, generous hitboxes for fairness)
  - Explosion FX on hit (particles, flash)
  - Score: seconds survived + 5 per trigger + 10 per nuclear trigger
  - High score persistence (localStorage)
  - Pause when tab unfocused

## Next Steps (when user wants more)
1. Playtest on actual phone, tune touch zone sensitivity if needed
2. Add SFX (Web Audio generated, no files - like baldin-ring does)
3. Power-ups maybe (shield from one hit? "Carolyn texts back" = slowdown?)
4. More trigger variations as group chat evolves
5. Boss obstacles (giant phone with full IT text monologue?)
