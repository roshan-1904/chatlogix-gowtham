# Marketing website — site plan

**Product:** ChatLogix  
**Format:** One-page marketing site  
**Folder:** `marketing/` (docs + future source; independent of `frontend_v2`)  
**Status:** Plan locked for first build  
**Date:** 2026-09-01

---

## 1. Goal

Vendors who already take orders on WhatsApp should:

1. Recognize their current pain (inbox overload, missed orders).
2. Understand what ChatLogix is in under a minute.
3. Trust they **stay in control** (see chats, pause AI, reply themselves).
4. Understand **how it works** (link WhatsApp Business number to the official API).
5. See that **products, orders, shipments, and payments** live in one place.
6. Click **Get started** ready to onboard.

**Job of the page (one sentence they should leave with):**

> I link my WhatsApp. ChatLogix replies for me. I still see every chat, I can take over any time, and I run orders, products, shipping, and payments in one dashboard.

---

## 2. Audience

Primary: **small / micro vendors** — home baker, boutique, tailor, crafts, local shop.

| Trait | Implication for the page |
|---|---|
| They *are* customer service | Speak as a shopkeeper, not a SaaS pitch |
| WhatsApp is the shop | Never imply they must change the number customers already use |
| Low tech patience | Four steps max for “how it works”; no architecture |
| Phone-first | Sticky CTA on small screens; large type; short paragraphs |
| Fear of losing control | “You’re still in control” is a first-class section, not a footnote |

Not the audience: developers, platform admins, Meta partners.

---

## 3. Positioning

**What we are:** An AI shop assistant on WhatsApp plus a dashboard to run the shop.

**What we are not:** A chatbot toy, a replacement for the vendor, or a new customer-facing app. Customers keep using WhatsApp.

**Problem we own:** The bottleneck is not demand. It is **responding to thousands of chats** while also packing orders. Slow or missed replies damage the relationship and hide orders in the inbox.

**Outcome we sell:** Healthy customer relationships (fast, consistent replies) and an easier day (vendor focuses on orders; AI handles repetitive messages). Control stays with the vendor.

---

## 4. Page information architecture

Single URL. Sticky nav. In-page anchors. No extra marketing routes for v1 (no /blog, /pricing page unless copy is approved).

### Nav

| Label | Anchor |
|---|---|
| Product | `#offer` |
| How it works | `#how-it-works` |
| You’re in control | `#control` |
| Get started | `#get-started` (also the primary button) |

Logo left → nav → **Get started** (always visible).

### Scroll order (do not reorder without a reason)

The story is **pain → bottleneck → offer → trust → mechanism → control → ops → act**.

| # | Section id | Purpose | Graphic |
|---|---|---|---|
| 1 | `hero` | Who we are + primary CTA | Canvas: messages → replies → order; navy mesh |
| 2 | `problem` | Life of a WhatsApp shop today | Three SVG scenes, faint chat pattern |
| 3 | `bottleneck` | Messages vs orders (the constraint) | **Time-split chart** (+ optional inbox vs orders) |
| 4 | `offer` | What ChatLogix gives them | Stroke icons + mini diagrams |
| 5 | `relationships` | Why this keeps customers, not just saves typing | Two-lane scene (AI vs you) |
| 6 | `how-it-works` | Four steps including WhatsApp API link | **Pipeline canvas** in sync with steps |
| 7 | `control` | Inbox, pause AI, manual reply | Interactive Stop / Start Auto-Reply demo |
| 8 | `dashboard` | Products, orders, shipments, payments in one place | SVG ops hub |
| 9 | `get-started` | Onboarding checklist + CTA | Quiet; navy mesh only |
| 10 | `faq` | Fear-removers | No motion |
| 11 | `footer` | Legal, contact | No motion |

Copy: [COPY.md](COPY.md). Layout/type: [DESIGN.md](DESIGN.md). Charts, backgrounds, canvas: [GRAPHICS.md](GRAPHICS.md). Funnel: [ONBOARDING.md](ONBOARDING.md).

The page is **not text-only**. Each section has a graphic job (chart, scene, canvas, or interactive mock). If the graphic is missing, the section is unfinished.

---

## 5. Primary and secondary actions

| Action | Where | Target |
|---|---|---|
| **Get started** | Hero, nav, `#get-started`, mobile sticky bar | Vendor signup / login (`VITE_SIGNUP_URL` when built) |
| **See how it works** | Hero only | Scroll to `#how-it-works` |

No competing CTAs (no “Book a demo”, “Watch video”, “Download PDF”) on v1 unless we actually have that asset.

Until public signup is live, the same button may open a **waitlist form** (name, WhatsApp number, shop type). Document the switch in env, not by changing the story.

---

## 6. Tone and language rules

- Shopkeeper to shopkeeper. Short sentences. Concrete verbs (reply, pack, pause, ship).
- Use **Stop Auto-Reply** / **Start Auto-Reply** — that is what the dashboard button says. Do not invent “kill switch” or “human mode” as product names.
- Say **WhatsApp Business API** once, in How it works, in plain language. Do not say “cloud webhook”, “Lambda”, “credits debit”, “LLM”.
- Do not claim **90% time saved** or a per-message cost on this page unless marketing has signed numbers.
- Prefer “thousands of messages” as the *feeling* of overload; do not invent a vendor’s volume.
- Languages: English, Hindi, Tamil may be mentioned as something customers can write in — not as a full multilingual marketing site for v1 (page itself is English).

---

## 7. Product truths (must not contradict the app)

| Topic | Truth to show |
|---|---|
| Number | Same WhatsApp Business number customers already use |
| Connect | Vendor links that number through Meta’s official Business API |
| Inbox | Every customer message and every assistant reply visible in Conversations |
| Pause | Per conversation: Stop Auto-Reply → vendor types; Start Auto-Reply → AI resumes |
| Handoff | Customer asks for a person → AI pauses → vendor is notified |
| Catalog | AI can only sell what is in the catalog |
| Orders | Chats become orders the vendor works in Orders |
| Shipping | Vendor updates shipment; customer can be kept in the loop |
| Payments | Payment links sent on WhatsApp from the dashboard |
| Phone | Vendor can still use WhatsApp on their phone; dashboard is the place to see everything and run ops |

---

## 8. Success metrics

Measure whether vendors **understood and started**, not vanity traffic.

| Metric | Why |
|---|---|
| CTA click rate (Get started) | Intent |
| Scroll depth past `#how-it-works` and `#control` | They saw mechanism + trust |
| Mobile vs desktop share | Confirms phone-first design |
| Signup started → WhatsApp connected | Real onboarding, owned with [ONBOARDING.md](ONBOARDING.md) |
| Time on page (sanity check) | Bounce in &lt;10s means hero failed |

v1 analytics: page view + CTA click + section impressions if cheap to add. Do not block launch on a full product-analytics suite.

---

## 9. Out of scope for v1

- Blog, case studies, comparison tables vs competitors
- Full pricing grid (one honest line in FAQ is enough)
- Localized marketing pages (ta/hi)
- Embedding the real vendor app
- Live chat widget on the marketing page
- Live charts from production metrics
- Stock photography of random people (unless licensed later for one band)
- Three.js / WebGL / Spline
- Putting this app inside the Turborepo

---

## 10. Planned source location

When the page is implemented, **all source stays in `marketing/`**. See [SOURCE_LAYOUT.md](SOURCE_LAYOUT.md).

Stack (planned): Vite + React + TypeScript + Tailwind. Independent `package.json`. Brand colors from the vendor app (navy `#072349`, WhatsApp green `#25D366`). Canvas 2D + SVG for graphics — [GRAPHICS.md](GRAPHICS.md).
