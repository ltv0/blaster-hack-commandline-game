# Blaster Hack Commandline Game

Command-line themed browser game where you drag an umbrella to protect a traveler from rain, snow, and hail.

Play the hosted version at https://www.ltv0.me/blaster-hack-commandline-game/

## Features
- Terminal-style boot prompt and HUD
- Mouse and touch umbrella controls
- Rain, snow, and hail hazards
- Progressive difficulty ramp
- Survival scoring
- Game over and restart flow
- Text-only visual rendering on canvas (ASCII/glyph blocks only; no sprite/image assets)

## Reference Resources
- Main implementation reference: https://github.com/rinesh/pretext-breaker
- Source code reference: https://github.com/rinesh/pretext-breaker/tree/main/src
- Pretext npm package reference: https://www.npmjs.com/package/@chenglou/pretext
- Architecture alignment target: `src/main.ts`, `src/game.ts`, and `src/pretext-renderer.ts`.
- umbrella sprite: https://www.asciiart.eu/art/063c0304bc2d8903 



## Windows Setup
1. Install Node.js LTS: https://nodejs.org/
2. (Optional) Install Git for Windows: https://git-scm.com/download/win
3. Open PowerShell in the project directory:

```powershell
blaster-hack-commandline-game
```

4. Install dependencies:

```powershell
npm install
```

5. Start dev server:

```powershell
npm run dev
```

6. Build production output:

```powershell
npm run build
```

7. Preview production build:

```powershell
npm run preview
```

## Controls
- Enter or Space: Start from prompt
- Mouse/touch drag: Move umbrella
- R: Restart after game over

## Scripts
- `npm run dev` - Start Vite dev server
- `npm run build` - Build static production output
- `npm run preview` - Preview the built output
- `npm run type-check` - Run TypeScript checks
