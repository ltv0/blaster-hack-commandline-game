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
- Add a shark level.
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

- [Pretext README](https://github.com/chenglou/pretext)
- [Vite](https://vite.dev/)
- [TypeScript](https://www.typescriptlang.org/)

---

## Share Any Resources We End Up Using Here
<!-- Additional resources discovered during development -->

- [Pretext README](https://github.com/chenglou/pretext)
- [Vite](https://vite.dev/)
- [GitHub Pages](https://pages.github.com/)

---

## Additional Sections (Optional)

---
