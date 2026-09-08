# Signup Page — Marketing Copy & Layout Spec

**Route:** `/signup`  
**App:** `frontend_v2/apps/web-vendor`  
**Status:** **Implemented** (2026-09-05)  
**Related:** [Public Signup & Trial Onboarding](./public-signup-onboarding.md) (flow, API, trial wallet)

---

## Purpose

The signup page is the **primary conversion surface** for new vendors. It must:

1. Speak to **non-IT shop owners** (home bakers, tailors, kirana sellers) in plain language
2. Explain **what problem we solve** and **how ChatLogix helps** before asking for a phone number
3. Build **trust** (safe demo, no card, no live WhatsApp during trial)
4. Surface **₹100 free trial credit** clearly
5. Support **SEO** with intentional headings and meta tags (without keyword stuffing)

**Reference layout:** Mirror the 65% / 35% split already used on [`Login.tsx`](../../../../frontend_v2/apps/web-vendor/src/pages/Login.tsx). Current [`Signup.tsx`](../../../../frontend_v2/apps/web-vendor/src/pages/onboarding/Signup.tsx) is a centered single-column layout — to be upgraded.

---

## Layout specification

### Desktop (≥ `lg` breakpoint)

```
┌─────────────────────────────────────────────┬──────────────────┐
│  65% — Marketing panel                      │  35% — Form      │
│  bg-primary-500, white text                 │  bg-gray-50      │
│                                             │                  │
│  Hero (H1 + subhead)                        │  Step title      │
│  Problem block (H2 + bullets)               │  Phone / OTP     │
│  Solution block (H2 + bullets)              │  (reuse auth     │
│  ₹100 offer highlight box                   │   components)    │
│  Trust strip                                │  Log in link     │
│  FAQ (optional, collapsible)                │                  │
└─────────────────────────────────────────────┴──────────────────┘
```

**Tailwind (match Login):**

| Region | Classes |
| --- | --- |
| Outer shell | `min-h-screen flex flex-col lg:flex-row` |
| Marketing (left) | `hidden lg:flex lg:flex-[0.65] lg:flex-col lg:justify-center lg:px-8 xl:px-12 bg-primary-500 text-white` |
| Form (right) | `flex-1 lg:flex-[0.35] flex flex-col justify-center py-8 … px-4 … bg-gray-50` |

### Mobile (< `lg`)

- Hide the 65% marketing panel (`hidden lg:flex`)
- Show compact **ChatLogix logo** + **trial pill** above the form:
  - `₹100 free · No card · Safe demo — real customers not messaged`
- Optional: collapsible “Why ChatLogix?” below the form (FAQ accordion)

### Heading hierarchy (one H1 per page)

| Element | Tag | Location |
| --- | --- | --- |
| Hero headline | **H1** | Marketing panel only |
| Section titles (Problem, Solution, Offer) | **H2** | Marketing panel |
| Feature / bullet titles | **H3** or bold `<p>` | Marketing panel |
| Form step title | **H2** | Form panel (not a second H1) |

---

## SEO strategy

### Search intent

Target shop owners searching for:

- WhatsApp automation for small business
- Automatic WhatsApp replies / customer service
- WhatsApp order management
- AI assistant for WhatsApp shop

**Avoid** developer terms: pipeline, webhook, API, credits, JWT.

### Target keyword map

| Priority | Phrase | Placement |
| --- | --- | --- |
| Primary | WhatsApp shop assistant | H1, meta title |
| Secondary | automatic WhatsApp replies | H2 Solution, meta description |
| Secondary | WhatsApp order management | Solution bullets |
| Long-tail | answer customer questions on WhatsApp | Subhead, FAQ |
| Local | ₹100 free trial, India, no credit card | Offer box, meta description |

### Meta tags (`/signup` only)

Set per-route (not the generic `index.html` title). Suggested values:

| Field | Copy | Max length |
| --- | --- | --- |
| **`<title>`** | `Free WhatsApp Shop Assistant for Small Business \| ChatLogix` | ~60 chars |
| **`meta description`** | `Automate WhatsApp customer replies & orders for your shop. Start free with ₹100 trial credit — no card needed. Built for home businesses & local shops in India.` | ~155 chars |
| **OG title** | Same as `<title>` | — |
| **OG description** | Emphasize trial + safe demo before live WhatsApp | — |

**Implementation note:** Use `react-helmet-async` or equivalent in `Signup.tsx`; do not change global `index.html` for all routes.

### Internal linking

| From | Anchor text | To |
| --- | --- | --- |
| Signup footer | “Log in to your shop” | `/login` |
| Login footer | “Start free WhatsApp trial” | `/signup` |

---

## Approved copy — marketing panel (65%)

All strings below should live in `frontend_v2/apps/web-vendor/src/components/onboarding/onboardingCopy.ts` under a `signup.marketing` key when implemented.

### Hero

**H1:**  
Stop losing orders on WhatsApp — let an AI shop assistant reply for you

**Subhead:**  
ChatLogix helps **small businesses and home shops** handle **WhatsApp customer messages** automatically — prices, product questions, and orders — so you can focus on making and delivering.

---

### Section: Problem

**H2:** Why shop owners struggle with WhatsApp every day

| Bullet title | Body |
| --- | --- |
| Same questions, every day | “Rate enna?”, “Delivery irukka?”, “Stock irukka?” — repeated questions eat hours you could spend on your work. |
| Missed messages = missed sales | When you’re busy in the kitchen, on the shop floor, or on the road, customers move to the next seller. |
| Late-night typing | Replying manually after a long day instead of resting or growing the business. |

*Rationale:* Tamil/Hindi phrases in quotes improve **local relevance** for Indian vendors without hurting English SEO.

---

### Section: Solution

**H2:** How ChatLogix automates your WhatsApp customer service

| Bullet title | Body |
| --- | --- |
| Smart automatic replies on WhatsApp | Answers like a trained shop staff member, using your products and prices. |
| WhatsApp order support built in | Customers ask; your assistant guides them toward a clear order. |
| Try it safely before going live | Test the **same AI** in a private demo. **Your real WhatsApp customers are not messaged** during trial. |

---

### Section: Offer (highlight box)

Visually distinct: white/10 background, border, optional wallet icon.

**H2:** ₹100 free trial credit — start your WhatsApp automation today

**Body (paragraph):**  
Create your account in minutes. We add **₹100 free** to your trial wallet so you can test **automatic WhatsApp replies**, upload your menu or product list, and chat with the assistant like a real customer.

**Bold reassurance (second line):**  
**No payment card. No setup fee. No message to your live WhatsApp until you choose to connect after approval.**

**Micro-line (optional, below box):**  
Transparent usage — you see exactly what each reply costs in rupees.

---

### Trust strip (footer of marketing panel)

Short lines, not salesy:

- Your phone is verified — only you can log in
- Built for **local shops, home bakers, tailors & sellers** — not big-company software
- Same AI engine used for **live WhatsApp** after you go live
- Human review before full access — we check your shop details, usually **1–2 business days**

---

### FAQ (optional — snippet-friendly SEO)

Collapsible on desktop; accordion on mobile. Each question is an **H3** inside the FAQ section (**H2:** Common questions).

#### What is a WhatsApp shop assistant?

A tool that reads customer messages on WhatsApp and replies with your prices, products, and order details — automatically, in a natural way.

#### Is the ₹100 trial really free?

Yes. Sign up with your mobile number. No credit card. Use ₹100 to test replies and demo chat before connecting live WhatsApp.

#### Will my customers get messages during the trial?

No. The demo runs in a safe test environment. Live WhatsApp connects only after you’re approved and ready.

#### Who is ChatLogix for?

Home businesses, bakeries, tailors, kirana sellers, and any small shop that gets orders and questions on WhatsApp.

---

## Approved copy — form panel (35%)

### Phone step

**H2:** Start free — WhatsApp shop assistant trial

**Subtext:**  
Enter your mobile number. We’ll send a one-time OTP. You get **₹100 free credit** to test automatic replies — no card required.

### OTP step

**H2:** Verify your mobile number

**Subtext:**  
Enter the 6-digit code sent to your phone. This keeps your shop account secure.

### Footer

Already have an account? **[Log in](/login)**

### Mobile trial pill (when marketing panel hidden)

`₹100 free · No card · Safe demo — real customers not messaged`

---

## Existing copy to retain (unchanged)

These strings from the current spec remain valid for **post-submit** and **errors** — do not replace with marketing copy:

| Key | Copy |
| --- | --- |
| Success toast | Your trial shop is ready. You have ₹100.00 to test how ChatLogix answers customer questions. Nothing is sent to your real WhatsApp yet. |
| Phone already registered | This number already has an account. [Log in instead] |
| OTP wrong | That code didn’t match. Check the SMS and try again. |
| Firebase rate limit | Too many tries. Please wait {N} minutes, then try again. (+ countdown) |
| Network offline | You’re offline. Check your internet and try again. |

Source: [public-signup-onboarding.md — Signup section](./public-signup-onboarding.md#signup--signup)

---

## Implementation checklist

When building UI, follow this order:

- [x] Add `signup.marketing`, `signup.form`, `signup.meta`, `signup.faq` to `onboardingCopy.ts`
- [x] Create `SignupMarketingPanel.tsx` (65% content)
- [x] Refactor `Signup.tsx` to Login-style split layout; keep `PhoneLoginForm` / `OtpVerificationForm`
- [x] Per-route `<title>` + meta description on `/signup`
- [x] Mobile: logo + trial pill; optional FAQ accordion
- [x] Cross-link Login footer: “Start free WhatsApp trial” → `/signup`
- [ ] Manual QA: desktop 65/35, mobile stack, OTP flow unchanged
- [ ] Optional polish: static WhatsApp chat mockup on marketing panel (no live API)

**Do not edit:** `.cursor/plans/vendor_onboarding_p2_4e0cb1a6.plan.md`

---

## Copy principles (language rules)

From the [trust & conversion plan](./public-signup-onboarding.md#trust-reliability--conversion-expert-plan):

| Do | Don't |
| --- | --- |
| “Your shop”, “customers on WhatsApp”, “automatic replies” | “Pipeline”, “webhook”, “LLM”, “API” |
| “₹0.38 for this reply” (transparent) | “1 credit deducted” |
| “Try before going live” | “Sandbox test-message endpoint” |
| Short sentences, one idea per line | Long paragraphs, legal tone |

---

## Revision history

| Date | Change |
| --- | --- |
| 2026-09-05 | Initial marketing + SEO copy documented before UI implementation |
| 2026-09-05 | UI implemented: 65/35 layout, SignupMarketingPanel, SignupFaq, usePageMeta |
