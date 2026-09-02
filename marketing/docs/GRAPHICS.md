# Marketing website — graphics, charts, and motion (v2)

**v2 direction:** Phone-first. Shop owners understand phones, not bar charts. Primary explainers are **WhatsApp + dashboard mocks** and **illustrated mini-scenes**. One optional simplified day-split bar at most.

Copy: [COPY.md](COPY.md). Layout: [DESIGN.md](DESIGN.md).

---

## 1. Decision (v2)

| Choice | Why |
|---|---|
| **Phone mocks over bar charts** | Bottleneck and problem sections use before/after phone compositions, not TimeSplitChart or InboxVsOrdersChart |
| **Shared mock system** | `PhoneFrame`, `ChatBubble`, `DashboardFrame` — one visual language across sections |
| **Scenario-driven copy** | hero.scenario, problem.timeline[], offer phoneSnippet per tile |
| **Canvas demoted** | HeroCanvas desktop overlay only; mocks are LCP on all breakpoints |
| **No fake metrics** | Example unread counts and day-split labels only |

---

## 2. Mock design system

| File | Role |
|---|---|
| `src/components/mocks/PhoneFrame.tsx` | Bezel, WhatsApp header, unread badge |
| `src/components/mocks/ChatBubble.tsx` | Customer / assistant / vendor bubbles + typing indicator |
| `src/components/mocks/DashboardFrame.tsx` | Sidebar, conversation header, Stop/Start pill |
| `PhoneMock.tsx` / `DashboardMock.tsx` | Variants: `before` \| `after` \| `paused` \| `default` |

Colors from `tailwind.config.js` mock.* tokens only.

---

## 3. Section visuals (v2)

### Hero
- **Always visible:** PhoneMock + DashboardMock (mobile + desktop)
- **Optional:** HeroCanvas lazy overlay on `md+` only
- **Reduced motion:** Static SVG poster in Hero.tsx; no canvas loop

### Problem
- **ProblemDayTimeline:** Morning / Afternoon / Night with phone strips
- Scroll-triggered bubble enter; static SVG poster per moment when reduced motion
- **Deleted:** `problemScenes.tsx` wireframes

### Bottleneck
- **BottleneckCompare:** Before | After tab toggle, crossfade 200–400ms
- Side-by-side PhoneMock + DashboardMock variants
- Tiny day-split bar (labels only) under phones
- **Deleted:** `TimeSplitChart.tsx`, `InboxVsOrdersChart.tsx`

### Offer
- Bento grid with phone snippet per tile (large tiles show mini PhoneFrame)

### Relationships
- **RelationshipScene:** WhatsApp-style bubble lanes with enter animation

### How it works
- **PipelineDiagram** (SVG) — primary pipeline visual, scroll-linked step highlight
- **HowItWorksCanvas** — optional lazy companion on desktop

### Control
- **PauseDemo** featured full-width on mobile; typing indicator when paused

### Dashboard
- Wide DashboardMock + tile stack + OpsHubDiagram (redrawn hub with conversation ring)

---

## 4. LazyGraphic (single file)

`src/graphics/LazyGraphic.tsx` only. Skeleton kinds: `default`, `canvas`, `diagram`, `phone`.

No empty placeholder divs — pulsing silhouette matching aspect ratio.

---

## 5. Motion and a11y

| Rule | Implementation |
|---|---|
| Crossfade toggles | BottleneckCompare opacity transition 300ms |
| Scroll enter | `animate-bubble-enter` on timeline bubbles |
| Reduced motion | Posters / static SVG; `@media (prefers-reduced-motion: reduce)` |
| Canvas pause | Pause button on HeroCanvas and HowItWorksCanvas |
| WCAG | figure/figcaption on comparisons; aria on tabs; 44px targets |

---

## 6. File map (v2)

| Piece | File |
|---|---|
| Mock frames | `src/components/mocks/*` |
| Bottleneck compare | `src/components/BottleneckCompare.tsx` |
| Problem timeline | `src/components/ProblemDayTimeline.tsx` |
| Pipeline | `src/graphics/PipelineDiagram.tsx` |
| Hero loop | `src/graphics/HeroCanvas.tsx` |
| Relationships | `src/graphics/RelationshipScene.tsx` |
| Ops hub | `src/graphics/OpsHubDiagram.tsx` |
| Lazy load | `src/graphics/LazyGraphic.tsx` |

**Removed in v2:** TimeSplitChart, InboxVsOrdersChart, problemScenes, duplicate LazyGraphic.

---

## 7. Build verification

```bash
cd marketing && npm run build
```

Heavy graphics remain lazy chunks. Mocks ship in main bundle for LCP.
