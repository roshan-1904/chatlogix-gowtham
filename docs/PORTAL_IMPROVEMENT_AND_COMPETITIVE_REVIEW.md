# ChatLogix portal improvement plan and competitive review

Reviewed 12 Nov 2026 against the live admin portal (`localhost:3001`) and vendor portal (`http://127.0.0.1:3000`), plus the source those screens call. Competitor rows are from public product pages and pricing comparisons dated around October 2026. Prices move with billing cycle and Meta’s rate card. Treat them as direction, not a quote.

This is a plan. It does not change product behavior.

## 1. Where ChatLogix actually competes

ChatLogix is a WhatsApp shop assistant for a small Indian seller who does not have a team, a Shopify store, or a broadcast calendar. The buyer is the owner. The job is: answer in the customer’s language, take the order, collect the money, and show the owner what happened.

Wati, AiSensy, Interakt, and Gallabox are WhatsApp Business API platforms. Their buyer is a marketing or support team. They sell seats, approved template broadcasts, a shared inbox, and a flow builder. AI that talks like a person is an add-on, often ₹1,350 to ₹3,500 a month on top of the seat plan, and they pass Meta’s message fees through with their own markup.

LimeChat and Zoko are closer on commerce, and they aim up-market. They assume a Shopify catalog, abandoned-cart journeys, COD confirmation, and a support team. LimeChat publishes custom pricing. Zoko’s early plan is usage-priced and Shopify-native.

DoubleTick sits in between: keyword and catalogue bots, plus an AI-agent add-on (about ₹3,500 a month for 3,500 credits on the Pro add-on, with 2 credits = ₹1 in their own docs).

ChatLogix should not try to become a cheaper Wati. A home baker who sent 38 assisted replies in October 2026 was charged ₹6.99 from the wallet. AiSensy’s cheapest broadcast plan was about ₹1,350 to ₹1,500 a month before Meta’s per-message fees. That gap is the product. It only survives if a reply stays near its real cost. The billing screen audited on 12 Nov 2026 would not keep it there (see section 5).

## 2. Feature inventory

Status words mean:

- **Solid** — used on a real shop in this review and behaved correctly.
- **Weak** — the screen exists and a seller can reach it, but the outcome is wrong, incomplete, or unsafe.
- **Missing** — not in the product, or marked Soon / not built.
- **Later** — competitors have it, and it is not required for the first shops ChatLogix is for.

| Capability | ChatLogix now | Versus the field | Status |
| --- | --- | --- | --- |
| Natural-language order taking in Tanglish / Tamil / English | Kanmani took Sugan’s order in chat, including voice notes | LimeChat, Zoko, and DoubleTick AI do this for larger brands. Wati, AiSensy, and Interakt are still mostly flows and keywords unless the AI add-on is bought | Solid, and the differentiator |
| Voice notes | Transcribed and answered in the thread | DoubleTick and Zoko advertise this. Most broadcast tools do not lead with it | Solid |
| Shop-written assistant personality | Bot name, tone, greeting, and address are editable | Flow builders offer this as prompt config on higher plans | Solid |
| Catalog the assistant sells from | 8 live products, categories, import, photo import, variants | Gallabox and LimeChat send Meta catalog cards (up to 30 products in one LimeChat catalog message). ChatLogix answers in prose | Weak on presentation, solid as a data source |
| FAQs the assistant can reuse | Two FAQs, and a path to promote a query into an FAQ | Table stakes everywhere | Weak, because open queries are not being saved |
| Human inbox | One owner, full thread, customer memory (address, preferences) | Gallabox, Wati, Interakt: multi-agent inbox, assignment, internal notes, canned replies | Weak. Notes and quick replies say “coming soon”. Reply box appears only after AI is paused |
| Orders | List, detail, status, address, timeline | Everyone who does commerce has this, plus status notifications | Weak. Numbers, pending count, cancelled orders, and a ₹0 empty order are wrong |
| Payments in chat | UPI text, COD, Razorpay link disabled | Gallabox: Razorpay, WhatsApp Pay, payment status in an inbox. LimeChat and Zoko: checkout on chat and COD-to-prepaid. Interakt: WhatsApp Pay and Shopify | Weak. Collection is off. A payment message named the wrong person |
| AI wallet, cost plus markup | Ledger, October usage ₹6.99 charged / ₹4.65 OpenAI / 33.5% margin | Competitors sell a monthly plan and mark up Meta. They do not show the shop their OpenAI cost | Solid as a model. Unsafe at the settings saved on 12 Nov 2026 |
| WhatsApp connection | Connect wizard exists. Admin can map a number | Competitors onboard the number as a BSP and then treat it as connected | Weak. A shop that already chats is told to connect. Mapped numbers show Unknown |
| Broadcasts, click-to-WhatsApp ads, drip campaigns | Not built. Templates page says the meaning is undecided | This is the core of Wati, AiSensy, Interakt, Gallabox, Zoko | Later. Do not build a broadcast suite to match them |
| Shared team and roles | `vendor_staff` is a type. The shell requires `vendor` | Interakt: unlimited agents. Wati Growth: 3 users. Gallabox: assignment rules | Missing, and acceptable for a one-owner shop. Not acceptable once a second person wraps orders |
| Abandoned cart, reorder, COD confirm | Not built | LimeChat, Zoko, and DoubleTick lead with these | Later, after templates and a trusted payment status exist |
| Shipping labels and live tracking | Create Shipment is on the order. The client still expects HTTP 501 | LimeChat ties this to logistics partners. Zoko sends “where is my order” from Shopify | Missing. Hide the button until it works |
| Shopify / WooCommerce sync | Not built | Assumed by LimeChat, Zoko, Interakt, AiSensy | Later. The current seller types or photographs a catalog |
| Admin: shops, wallet, markup, usage, tax shell, support cases | Present and mostly readable | BSP tools hide this inside their own billing. A shop never sees OpenAI cost | Solid operations surface, with the bugs in section 5 |
| Approve or reject a shop | Copy says review can be turned on. There is no approve or reject control | Not a competitor feature. It is ChatLogix’s own gate | Missing |
| Analytics a seller would recognize | Dashboard counts, conversion line on recent chats | Competitors show campaign ROI, CSAT, bot containment, agent SLAs | Weak, and enough for now if the counts are true |

## 3. What is good and should stay

These are worth protecting while the fix list in section 5 is done.

1. **The assistant talks like the shop.** Sugan’s thread switched between Tamil and English, answered a voice note, remembered the name and the area, and built a cart. Flow-builder products make the customer type “1” for shoes and “2” for food (DoubleTick’s order bot still works that way). That menu style loses a home baker’s customer.

2. **The price can be a few rupees, not a few thousand.** October usage for Ibell was ₹6.99 for 38 replies. Public Indian list prices for a usable Wati, AiSensy, Interakt, or Gallabox plan sit roughly between ₹1,350 and ₹3,000 a month before Meta’s own message fees, which those platforms mark up (comparisons published in October 2026 put a marketing message around ₹0.96 to ₹1.09 against Meta’s ₹0.86). ChatLogix’s wallet is the right commercial shape for a shop that sends dozens of replies, not tens of thousands of broadcasts.

3. **The owner can see why the wallet moved.** Admin usage splits “charged to shops” from “OpenAI cost” and shows margin. Vendor and admin ledgers for Ibell matched at ₹3,471.52. Competitors do not expose their model cost. Keep this. It is how a shop trusts a per-reply charge.

4. **The assistant has a bounded memory of the customer.** Address, preferences, and tone sit beside the thread. That is more useful to a baker than a tag list, provided the name is never the string `null`.

5. **Unanswerable questions have a place to go.** The queries page is the right design: the assistant admits it does not know, the owner answers once, and the answer can become an FAQ. The design is ahead of a pure flow builder. The shop is not using it (five questions open for 31 to 51 days).

6. **Catalog entry matches a seller without a website.** Photo import, a template, and a normal product form are the right on-ramps. LimeChat’s strength is syncing a Shopify catalog the current ChatLogix seller does not have.

7. **Admin and vendor money are separated in the interface.** Order payments (Razorpay Route) are not the AI wallet. The copy says so in both apps. Keep that split. Gallabox and Interakt mix marketing credit, seat fees, and checkout in one commercial story. ChatLogix’s split is clearer for this seller.

## 4. What to improve before more shops

Priority is from the 12 Nov 2026 walkthrough. P0 blocks a safe launch. P1 breaks a shop’s day. P2 makes the product feel unfinished next to Gallabox or LimeChat.

### P0 — do these before another real customer message

| Change | Why |
| --- | --- |
| Set the per-turn platform fee and the outbound media fee back to ₹0 until a Meta rate card exists | The billing form showed ₹222 per turn and ₹22 per media. The charge formula adds that fee before the shop’s markup. October replies were about ₹0.18. Settings were last saved 12 Nov 2026, 12:21 am. |
| Clear the USD/INR override of ₹50 | The same screen showed a live Frankfurter rate of ₹93.69. Charges use the override, so OpenAI cost in rupees is about 47% low. Alerts still said the FX rate was fine. |
| Turn mock wallet top-up off outside local development | The vendor wallet tells the shop to use “Add money (simulated)”. The admin checkbox says to turn this off before going live, and it was on. |
| Make admin catalog reads use the shop id in the URL | Inspecting Ibell returned 30 products belonging to `cb41052c-605d-4024-8f05-2f921574e2a2` (Black Forest, Geode Cubes). Ibell’s own catalog is 8 brownie and cookie products. The products route prefers `req.user.vendorId`. This admin phone is also Isha Bakers, so the token carries that shop. |

Confirm whether this `PlatformSettings` row is the one production Lambdas read before treating the fee as a local-only mistake.

### P1 — the shop cannot trust the screen

| Change | Why |
| --- | --- |
| If the shop already receives chats, stop saying “Connect WhatsApp” | Ibell has orders and threads. Both mapped numbers show status Unknown, one with a sample-looking phone-number id. Sending that owner through Embedded Signup can disturb a live number. |
| Put the customer’s name on payment instructions | Sugan’s payment text named someone else and a personal UPI. |
| Make “pending orders” mean open orders, or label the card “this month” | The dashboard showed 0. The orders page showed 3 that still need collection. The query is date-scoped. The label is not. |
| Remove payment and shipment actions from cancelled orders and from orders with no items | `ORD-ORDER-2026090006` is cancelled and still offers UPI confirmation and Create Shipment. `ORD-ORDER-2026090002` is ₹0 with no items and still says Collect payment. |
| Never show the customer name `null` or a raw id | The inbox, dashboard, and queries all do this today. |
| Work the query queue, and do not file an order request as an unanswered FAQ | Three of Raji’s open items are “place the order”, “repeat the cancelled order”, and “I need them tomorrow”. Those should become an order or a human handoff, not sit 51 days under Other. |
| Add approve and reject when a shop is `pending_approval` | Lumina Fragrances is waiting. The dashboard says review can be turned on. Nothing in the admin UI approves or rejects. A missing `registrationStatus` on the vendor token is treated as approved. |
| Make “where is my order” read the order that exists | On 6 Oct the assistant told Sugan it could not see an order, in a thread that already had one. Competitors treat WISMO as a basic flow. |

### P2 — quality bar versus a normal WhatsApp inbox

| Change | Why |
| --- | --- |
| Show the reply box without making the owner discover Pause AI | `MessageInput` renders only when AI is paused. The thread does not say so. Gallabox and Wati assume a human can type immediately and the bot can be handed off. |
| Ship quick replies. Leave broadcasts out | The panel already says “Quick replies (coming soon)”. Every inbox competitor has canned replies. Templates-as-marketing can wait. |
| Hide Create Shipment until the API is real | `shipping.ts` still maps HTTP 501 to “not yet available”. |
| Persist wallet blocks, or stop offering that Reliability tab | The tab tells the operator the `WalletBlockEvent` table is waiting on a migration, then shows an empty list. |
| Fix order numbers and the customer column | The list says `#ORD-ORDER-2026100001` and shows a phone. The dashboard says `Order #6ea27d8e` and shows a name. Pick the human order number and the name in both places. |
| Clean catalog facts the assistant will repeat | Stock displayed as “9999.999 box”, “1000 kg”, and “Not tracked”. An FAQ offers birthday cakes. The sellable list is brownies, cookies, and a tin. Empty delivery instructions produce a generic courier answer. |
| Replace the admin emoji sidebar and make it usable on a phone | The vendor app already has icons, groups, collapse, and a 390px menu. The admin app does not. |
| Stop parsing customer text with `innerHTML` | `TextBubble` assigns message content to a detached div’s `innerHTML` before reading `textContent`. The access token is in `localStorage` (`chatlogix_auth_token`). |
| Confirm money and policy actions | Freeze, unfreeze, reserve, issue invoice, close a tax month, and save billing settings do not ask for confirmation. Wallet recharge does. |
| Delete the custom-date `alert` | `DateRangeFilter` calls `alert('Custom date picker coming soon')`. |
| Replace the six placeholder dashboard tests | `useDashboardStats.test.ts` is six copies of `expect(true).toBe(true)`. The other 110 frontend tests passed on 12 Nov 2026 and do not render a page. |

### P3 — polish

Wallet balance is shown three times on the vendor dashboard. Admin dates are `23/10/2026` and vendor wallet dates are `10/23/2026`. Admin shop orders print `₹1200.00` and the vendor prints `₹1,200.00`. The usage page’s billing link is the raw path `/billing`. The sidebar says plan “Pro” even though plans do not grant a quota.

## 5. What to add, and what to leave

Add only what a one-owner food shop needs in order to trust the assistant with a customer’s money. Leave the broadcast suite to Wati, AiSensy, and Interakt.

### Add in the first release after the P0 and P1 fixes

| Feature | Why it earns a place | Who already has it |
| --- | --- | --- |
| Payment that marks the order paid without the owner pasting a UPI line | UPI-sent orders from September and October were still pending in November. Gallabox records Razorpay and WhatsApp Pay status back on the chat. ChatLogix collection is off, and the fallback text named the wrong person | Gallabox, LimeChat, Zoko, Interakt |
| A visible handoff | One control: “I’ll reply” pauses the assistant and focuses the composer. “Back to assistant” resumes it. Today the owner has to find Pause AI | Gallabox, Wati, LimeChat (“smart handoff”) |
| Quick replies and internal notes | The UI already reserves the space. Order-status lines (“out for delivery”, “ready for pickup”) should be one tap | Every shared inbox |
| Honest WhatsApp status | Connected, quality, and the number customers message. Unknown and a second sample id should be an admin warning, not a green “active” | BSP consoles show this because their business depends on it |
| Order status the assistant can quote | Status, items, total, and the next step, from the order row, in the customer’s language | LimeChat support suite, Zoko “Wismo”, DoubleTick order tracking |
| Low-balance behavior the owner sees | Reply pauses, dashboard says why, one path to add money. The Reliability tab cannot do this until blocks are stored | Competitors stop the send when the wallet or plan credit is empty. ChatLogix’s own alert rules mention low wallet and then reported none |
| Shop decision | Approve, reject with a reason, or leave auto-approve on and remove the “waiting” card | Internal. Competitors do not have this because they are not the marketplace |

### Add once ten shops are live and the wallet price is trusted

| Feature | Why it can wait |
| --- | --- |
| WhatsApp catalog cards and multi-product messages | Prose works for eight bakery SKUs. It will not work for a shop with sizes and photos the way LimeChat’s catalog message does. Build it when a shop has more than a screen of products. |
| COD confirmation and “your order is ready” utility templates | These are the highest-value templates for food. They need Meta template approval and the undecided Templates page to become a real utility-template list, not a broadcast tool. |
| A second person on the shop | `vendor_staff` is already a role name. Build assignment only when an owner asks someone else to pack orders. |
| Reorder nudge for a product the customer already bought | LimeChat and Zoko make this a growth feature. It is a good second act for a brownie shop. It is a bad first act if payment status is still wrong. |
| CSAT on a closed thread | One question after delivery. Useful once fulfillment status is real. |

### Do not add to match a competitor

| Tempting feature | Why it is the wrong fight |
| --- | --- |
| Bulk marketing broadcasts, click tracking, and drip campaigns | AiSensy Basic is about ₹1,500 a month and exists to send them. Meta marketing messages are a separate, expensive rate (about ₹0.86 from Meta, higher on the BSPs). ChatLogix’s October bill was ₹6.99 because it is not that product. |
| Click-to-WhatsApp ads and website pop-ups | Zoko and LimeChat sell these to stores that already buy ads. The current seller is on WhatsApp already. |
| Shopify as the catalog | The import and photo flows are the catalog. A sync is a new ICP. |
| Omnichannel inbox (Instagram, Facebook, TikTok) | Wati sells this. It multiplies support load before the WhatsApp thread is trustworthy. |
| AI voice calls and PSTN | DoubleTick’s enterprise add-on. Irrelevant to a baker taking a WhatsApp order. |
| Seat-based pricing | It would throw away the only commercial advantage measured in this review. |

## 6. How ChatLogix should talk about itself

Use this, not “WhatsApp marketing platform”:

> ChatLogix answers your WhatsApp customers and takes the order. You pay for the replies you use, from a wallet, at what the answer costs plus your markup. You do not buy a seat pack or a broadcast plan.

Say the quiet part in the product, not only in sales:

- A reply is about a fifth of a rupee when fees are ₹0, which is what October showed. Do not advertise that number until the ₹222 fee and the ₹50 FX pin are gone.
- Meta’s own conversation fee is not charged to the shop yet. The admin usage page already says ChatLogix absorbs it. Competitors itemize it and add 11% to 30%. Leaving it at ₹0 is a launch subsidy. Put an end date on it. Do not hide it inside a ₹222 “platform fee”, which is a different and much larger number.
- “Pro” on the sidebar should go. The plan does not grant anything.

## 7. Suggested order of work

1. **Billing safety.** Fees to ₹0, clear FX override, mock top-up off in any shared or production database. Re-read a charge and confirm it is still under a rupee.
2. **Tenant isolation.** Admin product, and any sibling list that uses `req.user.vendorId` first, must use the shop in the URL. Re-open Ibell and see brownies.
3. **Truth on the vendor home.** Connected state, pending orders, customer names, payment text, cancelled-order actions, empty orders.
4. **Handoff and quick replies.** The owner can type. The five open queries are either answered or turned into orders.
5. **Payment status.** One path that moves an order from “UPI sent” to paid, and the assistant can say so.
6. **Approve / reject**, only if auto-approve is actually turned off. Otherwise remove the waiting state so it does not imply a queue nobody can clear.
7. **Then** catalog cards, utility templates for “ready for pickup”, and a second user.

## 8. Sources

Live product, 12 Nov 2026: admin and vendor portals, and the handlers they called (`products.ts` vendor id selection, `pricingService.ts` fee formula, `DateRangeFilter.tsx`, `TextBubble.tsx`, `shipping.ts`, `Reliability.tsx` wallet-block copy, `useDashboardStats.test.ts`).

Public competitor material:

- LimeChat pricing and catalog docs: [limechat.ai/pricing](https://www.limechat.ai/pricing), [catalog guide](https://limechatai.gitbook.io/limechat-product-guide/automation/automation-flows/whatsapp-catalog), [revenue flows](https://limechatai.gitbook.io/limechat-product-guide/whatsapp-marketing/flows/revenue-generating-flows)
- Gallabox shop and payments: [docs.gallabox.com/whatsapp/shop](https://docs.gallabox.com/whatsapp/shop), [payments](https://docs.gallabox.com/whatsapp/payments), [shared inbox](https://gallabox.com/whatsapp-shared-inbox)
- Wati, AiSensy, Interakt price comparisons checked by those authors in October 2026: [Linkubit](https://www.linkubit.com/guides/wati-vs-aisensy-vs-interakt), [Jeedesigns](https://jeedesigns.com/insights/wati-vs-aisensy-vs-interakt-pricing/), [Periskope](https://periskope.app/vs/wati-vs-interakt-vs-aisensy)
- Zoko: [zoko.io](https://www.zoko.io/) and the [Shopify app listing](https://apps.shopify.com/whatsapp-button-chat)
- DoubleTick order bot and AI agents: [order bot](https://learn.doubletick.io/bot-studio/default-bots/create-order-bot), [AI agents](https://learn.doubletick.io/doubletick-ai/ai-agents-and-assistance/introduction-to-ai-agents)
