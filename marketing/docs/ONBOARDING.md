# Marketing website — onboarding funnel

How a vendor goes from the landing page to a shop that is actually live. The website’s job is to **preview this path** so Meta’s WhatsApp connect screens and the dashboard are not a surprise.

The vendor app (`frontend_v2/apps/web-vendor`) owns the real screens. This document only describes what the **marketing page must promise** and what happens **after Get started**.

---

## 1. One-sentence promise (must stay true after signup)

Same WhatsApp number. Assistant replies from the catalog. Vendor sees every thread, can **Stop Auto-Reply** and type, and runs products, orders, shipments, and payments in one dashboard.

If a product screen contradicts this, change the product or change [COPY.md](COPY.md) — do not paper over it on the landing page.

---

## 2. Funnel

```
Landing “Get started”
        → Sign up (phone / email OTP)
        → Add or import catalog
        → Connect WhatsApp Business number (Meta Business API)
        → First live conversations in the dashboard
        → Control moment: Stop Auto-Reply → manual reply → Start Auto-Reply
```

| Step | Where it happens | What they must understand | Landing page preview |
|---|---|---|---|
| 0 | Marketing CTA | This is for *my* WhatsApp shop | Hero + Get started |
| 1 | Vendor sign up | Account is theirs | Checklist item 1 |
| 2 | Catalog | AI can only sell listed products | How it works step 1; dashboard Catalog tile |
| 3 | Connect WhatsApp | Official API; **same number**; not a password handoff | How it works step 2 + API note |
| 4 | Watch chats | Full thread visible | Control “See everything” |
| 5 | Take over | Stop / Start Auto-Reply per conversation | Control section + checklist item 5 |

**Activation** (the metric that matters): WhatsApp connected **and** at least one catalog product **and** vendor opened Conversations. Signup alone is not success.

---

## 3. CTA routing

| Environment | `Get started` goes to |
|---|---|
| Public signup live | Vendor app sign-up / login (`VITE_SIGNUP_URL`) |
| Not public yet | Waitlist form (name, WhatsApp number, shop type) — **same button label** |

Do not change the story when swapping the URL. Optional query params later (`?from=marketing`) for attribution.

Secondary CTA only scrolls to `#how-it-works`. It must not open Calendly or a PDF on v1.

---

## 4. What to show *before* they click (reduce drop-off)

Vendors drop off when step 3 looks like “you’re taking my WhatsApp.” The landing page must already say:

1. Official **WhatsApp Business API** (Meta).
2. Approve the link **once**.
3. **No personal WhatsApp password.**
4. Customers keep the **same number**.

Do not describe developer setup (webhooks, tokens, WABA IDs) on the marketing page. If the in-app connect wizard needs extra Meta clicks, the in-app copy should stay as plain as this page.

---

## 5. Control moment (why checklist item 5 exists)

Fear: “The bot will talk and I can’t stop it.”

Before they believe onboarding is done, they should:

1. Open a conversation.
2. Tap **Stop Auto-Reply**.
3. Send a message as themselves.
4. Tap **Start Auto-Reply**.

The landing page tells them this is expected on day one. The dashboard already uses those button labels (`ConversationHeader`).

Handoff (customer asks for a human) also pauses AI and notifies the vendor. Mention it on the page; do not require it to complete onboarding.

---

## 6. What the landing page must not promise

| Do not say | Why |
|---|---|
| “Connect in one tap with no Meta screens” | The official API flow is Meta’s |
| “We reply even with an empty catalog” | Catalog is the source of truth for selling |
| “We replace WhatsApp on your phone” | They can keep using the phone |
| “Always 90% less work” | Unproven as a public claim |
| A specific price | Until billing copy is approved (FAQ stays qualitative) |

---

## 7. Suggested in-app alignment (not marketing code)

When the vendor app onboarding is tightened, keep step names aligned with the landing checklist:

1. Sign up  
2. Catalog  
3. Connect WhatsApp  
4. See conversations  
5. Try Stop Auto-Reply  

Existing internal plans (document upload, demo chat, admin approval) can stay in product requirements. The **public** story is the five items above so a tired shop owner can finish in one sitting.

---

## 8. Measurement

| Event | Meaning |
|---|---|
| `cta_get_started` | Clicked landing CTA |
| `signup_started` / `signup_completed` | Account exists |
| `catalog_has_product` | Assistant has something to sell |
| `whatsapp_connected` | Number linked via Business API |
| `ai_pause_toggled` | They found Stop / Start Auto-Reply |

Marketing owns the first event. Product owns the rest. Report them as one funnel, not two dashboards that never meet.
