# TRIGGERED - The Joe Ejection

## What This Is
A browser-playable infinite vertical scroller. Joe (aka "The M" from the group chat) gets triggered by a text message, clings to a rocket, and ejects into space. Player swipes/taps left and right to dodge obstacles. Every new triggering message that flies past makes the rocket faster. Score = how long you survive before exploding.

Sister game to `baldin-ring/`. Same cast universe, same tech stack, same charm-over-polish tone.

## Quality Bar
Personal joke game for the group chat. Funny > pretty. Has to be readable on a phone (one-handed, vertical orientation). Friends-only audience.

## Files
| File | What It Is | When to Read It |
|---|---|---|
| `index.html` | Page shell, canvas, mobile viewport meta | Changing page structure |
| `style.css` | Page + canvas styling, touch overlay | Adjusting visual chrome |
| `game.js` | Full game (state, render, input, triggers, Joe art) | Anything gameplay or visual |
| `about_this_project.md` | This file | Onboarding new context |
| `_project-state.md` | Current status + next steps | Resuming work |

## Key Concepts
- **The M:** Joe's nickname. Hairline forms an exaggerated capital "M" (deep widow's peak). Drawn cartoonishly extreme.
- **Trigger messages:** Text bubbles that fly past Joe periodically. Reading one bumps rocket speed +1. More triggers = faster rocket = harder dodging.
- **Trigger tiers:**
  - Mild (Frank/Danny/Mom/random): +1 speed
  - Spicy (Charlie Kirk / penis size / job search): +1 speed, screen shake
  - Nuclear (Ex-wife IT about Nathan or Alex): +2 speed, red flash, scream SFX
- **Misery cycle:** Joe rotates through exaggerated distress poses while flying (terror, scream, defeated, rage, crying).
- **Infinite run:** No levels. You play until you blow up. High score persists in localStorage.

## Cast (Trigger Sources)
- **Frank** - dismisses Joe's struggles with women, hates on incels
- **Danny** - asks about job search, defends Charlie Kirk losses
- **IT (ex-wife)** - kid updates (Nathan / Alex), day swaps, vacations, laundry, her new job. MOST extreme triggers.
- **Mom** - Carolyn texts, parents needing tech help
- **Random chat** - penis size takes (either direction)

## Tech Stack
- HTML5 + Canvas + plain JS (no framework, no build step, no external assets)
- Mobile-first: touch zones for left/right
- Keyboard fallback: A/D or arrow keys
- High score in localStorage

## Naming
- Game title: **TRIGGERED**
- Subtitle: **The Joe Ejection**
- Hero: **Joe** (aka **The M**)
