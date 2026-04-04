# Project Template

---

## Overview
<!-- Describe the project purpose, scope, and key objectives -->
Command-line themed web game built for the browser and hosted on a website domain.

### Core Concept
- A small character moves from right to left through changing environments.
- The player drags an umbrella to protect the character.
- Clouds at the top of the screen create different weather conditions.
- snow, rain, hail

### Gameplay Loop
- Keep the character safe for as long as possible. Gain points the longer you can keep the character safe
- The landscape scrolls by to create movement and tension.
- New obstacles, speeds, and environments are introduced over time.

### Progression Ideas
<!-- - Add a shark level. -->
- Increase difficulty as the run continues.
- Support multiple characters to protect later on.

### Presentation Goals
- Make it look like a command line themed game with a web-friendly layout.
- Keep the experience simple enough to host and run entirely in the browser.
- Game will be started with a basic command line prompt
- Rain will fall off umbrella.

---

## Tech Stack
<!-- List all technologies, frameworks, libraries, and tools being used -->

Recommended stack:

- **Frontend**
  - CSS
  - HTML
  - TypeScript
  - Vite
  - `@chenglou/pretext`
  - Optional: Web Audio API for sound effects

- **Backend**
  - TypeScript

This is the simplest stack I’d recommend for a browser-first game: fast to build, easy to host, and no server required.


---

## Installation

### System Prerequisites

1. **Node.js** (v16 or higher)
  - Download the **LTS Windows Installer (.msi)**: https://nodejs.org/
  - Verify in **PowerShell**: `node --version` and `npm --version`
  - npm comes bundled with Node.js

2. **Git for Windows** (recommended)
  - Download: https://git-scm.com/download/win
  - Verify in **PowerShell**: `git --version`

3. **Windows Terminal / PowerShell**
  - Use PowerShell for all commands below

### Optional (Quick Install with winget)

If you use `winget`, you can install prerequisites with:

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```


### Install Project Dependencies

From PowerShell, in the project folder, run:

```powershell
npm install
```

This will install all required packages listed in `package.json`:

- **Vite** - Fast build tool and dev server for TypeScript/JavaScript projects
- **TypeScript** - Type-safe JavaScript compiler
- **@chenglou/pretext** - Terminal-like text rendering library for the retro aesthetic
- **Web Audio API** - Built into modern browsers (no install needed)

### Verify Installation

Start the development server to confirm everything works:

```powershell
npm run dev
```

The game should load in your browser at `http://localhost:5173` (or the URL shown in the terminal).

### Build for Production

When ready to deploy:

```powershell
npm run build
```

This creates optimized static files in the `dist/` folder ready for hosting.

### Windows Troubleshooting

- If `npm` or `node` is not recognized, close and reopen PowerShell after install.
- If still not recognized, confirm Node.js was added to PATH, then restart your machine.
- If script policy errors appear, run PowerShell as Administrator and use:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

- If port `5173` is already in use, stop the other process or run Vite on a different port.


## Hosting
<!-- Specify hosting platform, domain, CDN, and related infrastructure -->

- **Platform:** GitHub Pages or Cloudflare Pages
- **Domain:** Your custom domain later if needed
- **Cost Estimate:** Free to start


---

## File Structure
<!-- Document the project directory structure -->

```
project-root/
├── index.html
├── package.json
├── package-lock.json
├── plan.md
├── README.md
├── tsconfig.json
└── src/
  ├── game.ts
  ├── main.ts
  ├── pretext-renderer.ts
  └── style.css
```

---

## Deployment Checklist
<!-- Steps required for deployment -->

- [ ] Add project scripts for local dev and production build
- [ ] Install and verify the frontend dependencies
- [ ] Confirm the game runs correctly in a local browser session
- [ ] Test that Pretext text layout and rendering work at the target screen sizes
- [ ] Build the production static site output
- [ ] Preview the production build locally before deploying
- [ ] Deploy the static site to GitHub Pages or Cloudflare Pages
- [ ] Verify the deployed site loads correctly on desktop and mobile
- [ ] Check the custom domain or Pages URL if one is being used

---

## Resources
<!-- Links to documentation, tutorials, and useful references -->

### Core Technologies
- **TypeScript**: https://www.typescriptlang.org/docs/
- **Vite**: https://vitejs.dev/guide/
- **HTML Canvas API**: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API
- **CSS Animations**: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Animations

### Game Development
- **Canvas Rendering Best Practices**: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial
- **Game Loop Pattern**: https://www.isaacsukin.com/news/2015/01/detailed-explanation-game-loops-and-timing
- **Input Handling (Mouse/Touch)**: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events

### Libraries & Utilities
- **Pretext (@chenglou/pretext)**: https://github.com/chenglou/pretext
  - Terminal-like text rendering for retro aesthetic
  - GitHub repository for examples and issues
- **Web Audio API**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
  - For sound effects and audio feedback

### Inspiration & Reference Games
- **Flappy Bird (web version)**: Classic simple game mechanics
- **Commander Keen**: Platformer with command-line theming inspiration
- **ASCII Art Games**: Terminal-based game aesthetics
- **Game Design Resources**:
  - https://www.gamasutra.com/ (game design articles)
  - https://ldjam.com/ (Ludum Dare game jam examples)

### Hosting & Deployment
- **GitHub Pages**: https://pages.github.com/
  - Static site hosting with free tier
  - Direct GitHub integration
- **Cloudflare Pages**: https://pages.cloudflare.com/
  - Alternative static hosting with git integration
  - Free tier with unlimited deployments
- **Deployment Guides**:
  - GitHub Pages with Vite: https://vitejs.dev/guide/static-deploy.html#github-pages
  - Custom Domain Setup: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site

### Performance & Browser APIs
- **RequestAnimationFrame**: https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame
  - Recommended for smooth game loops
- **Web Workers**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API
  - For offloading heavy computations if needed later
- **Browser DevTools Performance**: https://developer.chrome.com/docs/devtools/performance/

### Design & Aesthetics
- **Terminal Font Libraries**:
  - Courier New (system default)
  - IBM Plex Mono: https://github.com/IBM/plex
  - JetBrains Mono: https://www.jetbrains.com/lp/mono/
- **Color Palettes for Retro Terminal**:
  - Dracula: https://draculatheme.com/
  - Gruvbox: https://github.com/morhetz/gruvbox
  - Solarized: https://ethanschoonover.com/solarized/

- [Pretext README](https://github.com/chenglou/pretext)
- [Vite](https://vite.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [GitHub Pages](https://pages.github.com/)

## Additional Sections (Optional)

---
