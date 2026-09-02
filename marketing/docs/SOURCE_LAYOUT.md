# Marketing website — source layout

Where the one-page site will live when it is built. **Do not put this app in `frontend_v2`.** Everything stays under `marketing/` so the landing page can deploy on its own (Vercel, Netlify, S3).

Status: **docs only**. The tree below is the planned shape; it is not created until implementation.

---

## Planned tree

```
marketing/
  README.md
  docs/
    SITE_PLAN.md
    COPY.md
    DESIGN.md
    ONBOARDING.md
    SOURCE_LAYOUT.md
    GRAPHICS.md
  public/
    favicon.svg
    og-image.png              # later
    graphics/
      chat-pattern.svg
      problem-team.svg
      problem-repeat.svg
      problem-buried.svg
  src/
    main.tsx
    App.tsx
    index.css
    content/
      copy.ts
    graphics/
      HeroCanvas.tsx
      HowItWorksCanvas.tsx
      TimeSplitChart.tsx
      InboxVsOrdersChart.tsx
      RelationshipScene.tsx
      OpsHubDiagram.tsx
      icons.tsx
      usePrefersReducedMotion.ts
      useInViewPause.ts
    components/
      Nav.tsx
      CtaButton.tsx
      Hero.tsx
      PhoneMock.tsx
      DashboardMock.tsx
      Problem.tsx
      Bottleneck.tsx
      Offer.tsx
      Relationships.tsx
      HowItWorks.tsx
      Control.tsx
      Dashboard.tsx
      Onboard.tsx
      Faq.tsx
      Footer.tsx
      StickyMobileCta.tsx
      PauseDemo.tsx
  index.html
  package.json                # independent; not a Turborepo workspace
  vite.config.ts
  tailwind.config.js
  tsconfig.json
  .env.example                # VITE_SIGNUP_URL=
  .gitignore
```

---

## Stack (planned)

- Vite + React + TypeScript
- Tailwind CSS
- No vendor-app packages (`@chatlogix/ui`, api-client, auth). Duplicate the two brand colors if needed (`#072349`, `#25D366`) rather than coupling deploys.
- Copy imported from `src/content/copy.ts` so section files stay layout-only.
- Graphics: Canvas 2D (hero + how-it-works) + inline SVG charts. No Three.js. See [GRAPHICS.md](GRAPHICS.md).

---

## Env

| Variable | Purpose |
|---|---|
| `VITE_SIGNUP_URL` | Get started target (signup, login, or waitlist) |

---

## Implementation order (when building)

1. Scaffold Vite app in `marketing/` with Tailwind.
2. Port [COPY.md](COPY.md) into `copy.ts`.
3. Sections top to bottom per [SITE_PLAN.md](SITE_PLAN.md).
4. Graphics per [GRAPHICS.md](GRAPHICS.md): TimeSplitChart first, then HowItWorksCanvas, then HeroCanvas.
5. Mocks and PauseDemo per [DESIGN.md](DESIGN.md).
6. Wire CTA to `VITE_SIGNUP_URL`.
7. Reduced-motion + off-screen canvas pause.
8. Deploy independently; do not wait on vendor-app releases.

---

## What stays out of this folder

- Vendor dashboard, admin app, backend, Prisma, Lambdas
- Real customer data in mocks
- Pricing tables until copy is approved
