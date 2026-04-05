# Blaster Hack Commandline Game Plan

---

## Overview
Command-line themed browser game where the player protects a moving character from weather hazards by dragging an umbrella.

### Project Goals
- Ship a playable MVP that runs fully in the browser.
- Keep implementation lightweight and static-host friendly.
- Preserve a retro terminal aesthetic while remaining readable on desktop and mobile.
- Use text-only visual assets rendered via glyphs (no bitmap or vector sprite assets).

---

## Scope

### MVP (Ship First) (DONE)
- One playable level with scrolling environment.
- One character that moves continuously.
- Umbrella drag interaction using mouse and touch.
- Weather hazards: rain, snow, hail.
- Survival score that increases over time.
- Game over and restart flow.

### Phase 2 (After MVP)
- Additional characters to protect.
- Difficulty ramp tuning and hazard variants.
- New themed levels (for example, shark level concept).
- Expanded audio and visual polish.


---

## Gameplay Specification

### Core Loop
1. Start game from a command-line styled prompt screen.
2. Character auto-moves while environment scrolls.
3. Player positions umbrella to block incoming hazards.
4. Score increases while character remains protected.
5. Hazard speed or intensity gradually increases.
6. On failure, show final score and allow restart.

### Controls
- Desktop: Mouse drag to move umbrella.
- Mobile: Touch drag to move umbrella.
- Keyboard: Optional restart key (`R`) after game over.

### Acceptance Criteria
- Character takes damage only when exposed to active hazards.
- Umbrella collision reliably blocks hazards.
- Score increments at predictable intervals (for example, every second).
- Difficulty increase is noticeable within the first 60-90 seconds.
- Game runs at stable frame pacing on modern desktop and mobile browsers.
- Gameplay visuals are composed only from text/glyph rendering (ASCII-style blocks and symbols).

---

## Tech Stack

### Frontend
- HTML
- CSS
- TypeScript
- Vite
- `@chenglou/pretext`
- Optional: Web Audio API for sound effects

### Runtime Architecture
- No backend required for MVP.
- Static asset hosting only.

Why this stack:
- Fast local iteration with Vite.
- Type safety and maintainability with TypeScript.
- Simple deployment to static hosting platforms.

---

## Windows Installation and Setup

### Prerequisites (Windows)
1. Node.js LTS (v18+ recommended)
   - Download Windows installer (.msi): https://nodejs.org/
2. Git for Windows (recommended)
   - Download: https://git-scm.com/download/win
3. PowerShell or Windows Terminal

Optional install via winget:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

### Verify Prerequisites
Run in PowerShell:

```powershell
node --version
npm --version
git --version
```

### Project Setup Steps (PowerShell)
1. Open PowerShell.
2. Navigate to the repo folder.

```powershell
cd C:\Users\lukek\Documents\github\blaster-hack-commandline-game
```

3. Install dependencies.

```powershell
npm install
```

4. Start local development server.

```powershell
npm run dev
```

5. Build production output.

```powershell
npm run build
```

6. Preview production build locally.

```powershell
npm run preview 
```

### Required npm Scripts
Ensure `package.json` includes:
- `dev`: starts Vite dev server
- `build`: creates production build
- `preview`: serves built output locally
- `type-check` (optional): runs TypeScript checks

### Windows Troubleshooting
- If `node` or `npm` is not recognized, reopen PowerShell after install.
- If still failing, verify Node.js is in PATH and restart Windows.
- If PowerShell blocks scripts, run:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

- If port `5173` is busy, stop the conflicting process or configure a different Vite port.

---

## Hosting and Deployment

### Primary Hosting Target
- GitHub Pages (recommended first deployment path)

### Secondary Option
- Cloudflare Pages

### Deployment Checklist
- [X] Confirm `npm run build` completes without errors
- [X] Validate game behavior in local `npm run preview`
- [X] Confirm mobile and desktop layout behavior
- [X] Deploy `dist/` output to selected platform
- [X] Verify live URL and restart flow in production

---
### Current Feature Checklist

#### High Priority
- [X] BASIC MVP
- [X] Visual uplift
- [X] Cloud wrap-around mechanics (infinite scroll or spawning new clouds as the clouds leave)
- [X] BACKGROUND AND GORUND SHOULD BE DISTINGQUISHED BY TEXT INSTEAD OF BEING A BLANK CANVAS
- [X] Background ASCII terrain (both ground and sky)
- [X] Object trail effects (visual effects. We have some motion trails already but they suck)
- [X] improving stick chungus
- [ ] Boss hazards (these should spawn every 5 rounds)

#### Medium Priority
- [X] Power-up system 
- [ ] Hazard variants (acid rain, thunder, blizzards? Maybe add some random gameplay differences per each cloud.)
- [ ] Milestone rewards (idk something for progression)
- [X] Sound effects
- [X] No Background music
- [ ] Screen shake
- [X] Particle variety (we actually have this partially implemented already.)

#### Low Priority
- [X] Performance optimization (idk it sucks to run on my pc)
- [ ] Mobile touch improvements
- [ ] Settings menu
- [ ] Leaderboards (idk how to hook this up online.)
- [ ] multiplayer



## File Structure

```text
project-root/
|- index.html
|- package.json
|- package-lock.json
|- plan.md
|- README.md
|- tsconfig.json
`- src/
   |- game.ts
   |- main.ts
   |- pretext-renderer.ts
   `- style.css
```

---

## References

### Implementation Reference
- Pretext Breaker repository: https://github.com/rinesh/pretext-breaker
- Source folder reference: https://github.com/rinesh/pretext-breaker/tree/main/src
- README reference: https://github.com/rinesh/pretext-breaker#readme
- Live demo reference: https://www.pretext.cool/demo/pretext-breaker
- Pretext npm package reference: https://www.npmjs.com/package/@chenglou/pretext
- Mirror architecture and rendering patterns from `src/main.ts`, `src/game.ts`, and `src/pretext-renderer.ts`.

### How to Use This Reference
- Reuse: app bootstrap and loop wiring patterns from `src/main.ts` and `src/game.ts`.
- Reuse: measured-text rendering helpers and caching flow from `src/pretext-renderer.ts`.
- Adapt: gameplay entities, collision rules, and balancing to this umbrella survival concept.
- Adapt: UI copy, prompt text, and HUD labels to match this game's theme and controls.
- Keep: static-hosting workflow (`npm run build`, `npm run preview`) and TypeScript/Vite project conventions.
- Keep: all on-canvas visuals text-first (glyphs/ASCII), matching the pretext-breaker demo direction.
- Verify: each imported pattern still works with this project's controls (mouse/touch drag + restart flow).

### Core Docs
- TypeScript: https://www.typescriptlang.org/docs/
- Vite Guide: https://vitejs.dev/guide/
- Canvas API: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API
- CSS Animations: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Animations
### Project Libraries
- Pretext (`@chenglou/pretext`) npm package: https://www.npmjs.com/package/@chenglou/pretext
- Pretext GitHub repository: https://github.com/chenglou/pretext
- Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API

### Deployment Docs
- GitHub Pages: https://pages.github.com/
- Vite static deploy: https://vitejs.dev/guide/static-deploy.html#github-pages
- Cloudflare Pages: https://pages.cloudflare.com/

### Visual Style Resources
- IBM Plex Mono: https://github.com/IBM/plex
- JetBrains Mono: https://www.jetbrains.com/lp/mono/
- Solarized palette: https://ethanschoonover.com/solarized/
