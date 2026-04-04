# Blaster Hack Commandline Game Plan

---

## Overview
Command-line themed browser game where the player protects a moving character from weather hazards by dragging an umbrella.

### Project Goals
- Ship a playable MVP that runs fully in the browser.
- Keep implementation lightweight and static-host friendly.
- Preserve a retro terminal aesthetic while remaining readable on desktop and mobile.

---

## Scope

### MVP (Ship First)
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
- [ ] Confirm `npm run build` completes without errors
- [ ] Validate game behavior in local `npm run preview`
- [ ] Confirm mobile and desktop layout behavior
- [ ] Deploy `dist/` output to selected platform
- [ ] Verify live URL and restart flow in production

---

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

### Core Docs
- TypeScript: https://www.typescriptlang.org/docs/
- Vite Guide: https://vitejs.dev/guide/
- Canvas API: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API
- CSS Animations: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Animations

### Game Development
- Canvas Tutorial: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial
- Pointer Events: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
- requestAnimationFrame: https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame

### Project Libraries
- Pretext (`@chenglou/pretext`): https://github.com/chenglou/pretext
- Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API

### Deployment Docs
- GitHub Pages: https://pages.github.com/
- Vite static deploy: https://vitejs.dev/guide/static-deploy.html#github-pages
- Cloudflare Pages: https://pages.cloudflare.com/

### Visual Style Resources
- IBM Plex Mono: https://github.com/IBM/plex
- JetBrains Mono: https://www.jetbrains.com/lp/mono/
- Solarized palette: https://ethanschoonover.com/solarized/
