# How ChatLogix requirement docs are written

Edits should be indistinguishable from the existing docs. Read two launch task docs before your first edit to calibrate.

## Voice

- Short declarative sentences. One fact per sentence. "The pause control exists. The composer does not appear until the owner finds it."
- Concrete over general: a named shop (Ibell Creations, Isha Bakers), an order number, a rupee amount, a count ("on the order of 8 products"), a date.
- Code is named exactly, in backticks: file paths, components, functions, endpoints, env vars, table and column names.
- Decisive. Say what to do and what not to do. Avoid "consider", "might want to", "ideally", "robust", "seamless", "leverage".
- No marketing adjectives, no emoji, no exclamation marks.
- Say what stays manual. A plan that hides manual steps makes the shop's day look easier than it is.
- Every "why" is about the shop owner or the customer, not about engineering neatness.

## Rules that carry meaning

- **Money units:** wallet = millirupees (`*Milli`), orders/products = paise. Write rupees for people (₹6.99), units for code.
- **No calendar in `docs/launch/`.** Phases start when the previous exit check passes. A review date in a status block is fine; target dates are not.
- **Phase-4 notes stay short.** They explain why to wait and what must be true first. Do not grow them into specs unless the plan promotes the item.
- **Tables** for inventories, priorities, decisions. Columns used in this repo: `Order | Task | Doc`, `Change | Why`, `Feature | Why it earns a place | Who already has it`, `# | Topic | Status | Default`.
- **Links** are relative markdown links to other docs (`[08-handoff.md](08-handoff.md)`, `[`docs/payments/05-compliance-and-risk.md`](../payments/05-compliance-and-risk.md)`).
- **Competitor facts** carry a source and a date, and prices are "direction, not a quote".

## Status block

Placed directly under the doc's `#` title. One review block per doc; replace, do not stack.

```markdown
> **PO review 2026-11-13** · commit `abc1234` · **Status: Drifted** · Competitive role: Parity · Priority: P1 (unchanged)
> Verified: `MessageInput` still mounts only when `aiPaused` (`frontend_v2/apps/web-vendor/src/pages/Conversations.tsx:412`). Missing: focus on pause. Changed in this review: §3 current behavior, §6 added negative check.
```
