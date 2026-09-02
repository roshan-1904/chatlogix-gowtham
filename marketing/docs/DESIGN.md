# Marketing website — design (v2)

Visual and layout rules for the one-page site. Copy: [COPY.md](COPY.md). Graphics: [GRAPHICS.md](GRAPHICS.md).

**v2 rhythm:** Phone-first scroll narrative — asymmetric hero, day timeline, before/after phone compare, bento grids. Same anchor IA as v1.

**v2.1 (clean premium SaaS pass):** all three SVG graphics (`PipelineDiagram`, `OpsHubDiagram`, `RelationshipScene`) are wired into their sections via `LazyGraphic` + `React.lazy` — they had been built but never imported, so How it works / Dashboard / Relationships previously shipped permanent skeleton placeholders. Added a soft elevation scale (`shadow-card` / `shadow-cardHover` / `shadow-mock` in `tailwind.config.js`), a tinted icon-chip treatment (`graphics/icons.tsx`), and a restrained scroll-reveal (`components/Reveal.tsx`, reuses the existing `useOnceInView` hook — respects `prefers-reduced-motion` the same way the SVG graphics already did).

Theme source of truth: [`../tailwind.config.js`](../tailwind.config.js).

---

## 1. Brand

Unchanged from v1. Navy `#072349`, WhatsApp green `#25D366`, Inter, WCAG AA CTA (navy on green).

Elevation: `shadow-card` (resting cards) → `shadow-cardHover` (hover) → `shadow-mock` (phone/dashboard mocks) — soft, layered, low-opacity navy shadows, not the flat 1px-border-only look of v2.0.

---

## 2. Layout patterns (v2)

| Section | v2 pattern |
|---|---|
| Hero | Copy left; **phone + dashboard mocks always visible** right (stack on mobile) |
| Problem | **Vertical day timeline** — Morning / Afternoon / Night, not 3 equal numbered cards |
| Bottleneck | Headline + intro + **single BottleneckCompare** + closer |
| Offer | **Bento grid** (2 large + 3 small) with phone snippets |
| Relationships | Text + upgraded two-lane bubble scene |
| How it works | Stepper + **PipelineDiagram**; canvas optional on desktop |
| Control | **PauseDemo hero** on mobile; 60/40 demo left on desktop |
| Dashboard | Wide mock + tile stack + hub diagram |

Section backgrounds: navy mesh → white → band → white (fewer identical bordered card grids).

---

## 3. Typography (v2 tweaks)

- Hero scenario line: caption size, green accent on navy
- Problem quote: border-left pull quote, not oversized italic H2
- Timeline labels: time pills (Morning / Afternoon / Night), no "1. 2. 3." prefixes

---

## 4. Component inventory (v2)

| Component | Role |
|---|---|
| `mocks/PhoneFrame` | Shared phone chrome |
| `mocks/ChatBubble` | WhatsApp bubbles |
| `mocks/DashboardFrame` | Dashboard chrome |
| `PhoneMock` / `DashboardMock` | Composed mocks with variants |
| `BottleneckCompare` | Before/After phone comparison |
| `ProblemDayTimeline` | Day story with phone strips |
| `PipelineDiagram` | SVG how-it-works pipeline |
| `LazyGraphic` | Single lazy-load wrapper with skeletons |
| `Reveal` | Scroll-triggered fade+rise for section headings (`useOnceInView`, reduced-motion safe) |

**Removed:** TimeSplitChart, InboxVsOrdersChart, problemScenes wireframes.

---

## 5. Mocks

Compose from shared frames. Variants:

- `before` — high unread, unanswered threads
- `after` — assistant replies, order card visible
- `paused` — Stop Auto-Reply state

Caption: "Example only" under standalone mocks.

---

## 6. Motion

- LazyGraphic skeletons (no blank boxes)
- Bottleneck crossfade 200–400ms
- Timeline bubble enter on scroll once
- `prefers-reduced-motion`: static posters, no canvas loops

---

## 7. Accessibility

Skip link, landmarks, contrast-safe CTA, 44px targets, `aria-*` on FAQ/tabs, figure/figcaption on comparisons. Unchanged from v1.

---

## 8. Responsive checklist

- 390px: hero mocks visible without waiting for canvas
- Bottleneck toggle keyboard accessible
- PauseDemo full width on mobile
- FAQ accordion 44px tap targets
