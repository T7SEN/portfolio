# t7sen | Cyber Developer Portfolio

![Project Status](https://img.shields.io/badge/System-ONLINE-success?style=for-the-badge&logo=digitalocean)
![Next.js](https://img.shields.io/badge/Next.js-16.0-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)

> **Software Architect and Developer** specializing in high-performance web applications, scalable systems, and immersive digital experiences.

This portfolio is a showcase of "Cyberpunk" aesthetics combined with modern web performance practices. It features complex GSAP animations, real-time data integrations, and a fully interactive terminal game.

## 🚀 Key Features

- **Immersive UI:** Custom magnetic cursors, GSAP entrance animations, and sound effects (SFX) via a global `SoundProvider`.
- **Real-time Presence:** Live Discord status and Spotify activity tracking using **Lanyard** WebSocket integration.
- **Guestbook:** Persistent digital ledger powered by **Upstash Redis**.
- **Command Palette:** Fully accessible `cmd+k` menu for navigation and hidden features.
- **Easter Eggs:** Unlock the "Terminal Snake" game via the Command Menu or the **Konami Code** (`↑↑↓↓←→←→BA`).
- **Observability:** Integrated **Sentry** for performance monitoring and error tracking.

## 🛠️ Tech Stack

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/) & [Shadcn UI](https://ui.shadcn.com/)
- **Animation:** [GSAP](https://greensock.com/gsap/)
- **Database:** [Upstash Redis](https://upstash.com/)
- **Testing:** [Playwright](https://playwright.dev/) (E2E)
- **Deployment:** [DigitalOcean App Platform](https://www.digitalocean.com/products/app-platform)

## ⚡ Getting Started

1. **Clone the repository:**

   ```bash
   git clone [https://github.com/t7sen/portfolio.git](https://github.com/t7sen/portfolio.git)
   cd portfolio
   ```

2. **Install dependencies (pnpm 11):**

   ```bash
   pnpm install
   ```

3. **Set up Environment Variables:**
   Create a `.env.local` file in the root directory:

   ```env
   # Database (Upstash Redis)
   UPSTASH_REDIS_REST_URL=your_url_here
   UPSTASH_REDIS_REST_TOKEN=your_token_here

   # Email (Resend)
   RESEND_API_KEY=your_key_here

   # Monitoring (Sentry)
   SENTRY_AUTH_TOKEN=your_token_here
   NEXT_PUBLIC_SENTRY_DSN=your_dsn_here
   ```

4. **Run the development server:**

   ```bash
   pnpm dev
   ```

## 🧪 Testing

This project uses **Playwright** for End-to-End (E2E) testing and **Axe-core** for accessibility compliance.

```bash
# Run all E2E tests
pnpm test:e2e

# Run tests with UI Mode
pnpm test:e2e:ui
```
