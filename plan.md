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
  - HTML
  - CSS
  - TypeScript
  - Vite
  - `@chenglou/pretext`
  - Canvas or plain DOM for rendering
  - Optional: Web Audio API for sound effects

- **Backend**
  - None

- **Database**
  - None

This is the simplest stack I’d recommend for a browser-first game: fast to build, easy to host, and no server required.


---

## Hosting
<!-- Specify hosting platform, domain, CDN, and related infrastructure -->

- **Platform:** GitHub Pages or Cloudflare Pages
- **Domain:** Your custom domain later if needed
- **Cost Estimate:** Free to start

---

## Notes
<!-- Additional observations, decisions, and important information -->

---

## File Structure
<!-- Document the project directory structure -->

```
project-root/
├── src/
│   ├── components/
│   ├── services/
│   ├── utils/
│   └── ...
├── public/
├── tests/
├── config/
│   ├── api keys would probably come here
└── ...
```

---

## Deployment Checklist
<!-- Steps required for deployment -->

- [ ] Environment variables configured
- [ ] Build process completed
- [ ] Dependencies installed
- [ ] Database migrations applied
- [ ] SSL certificates installed
- [ ] DNS records updated
- [ ] Load testing completed
- [ ] Security audit passed

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
