# Vendor portal (completion roadmap)

The vendor portal (`frontend_v2/apps/web-vendor`) is where a vendor supervises what the WhatsApp AI does on their behalf: catalog, FAQs, knowledge-gap queries, conversations, orders, and the wallet that pays for AI replies.

**Authoritative roadmap:** [docs/VENDOR_PORTAL_ROADMAP.md](../../../../docs/VENDOR_PORTAL_ROADMAP.md)

## What is left

Audited at commit `e1ee00e` (2026-09-14) by walking every route in `src/App.tsx` against its page and backend endpoint. Two classes of gap remain:

    10|- **Dead navigation.** `Templates`, `Billing`, and `Support` appear in the sidebar but have no route, so they render a bare `404 - Page Not Found` inside the app shell.
- **Buttons in front of 501s.** Order payment links and shipping are fully drawn but their endpoints return `501 Not implemented`, so clicks are intercepted with `window.alert`.

## Priorities

| Priority | Theme | Items |
|---|---|---|
| **P0** | Navigation honesty | Billing page, Support page, Templates decision, styled not-found + nav gating |
| **P1** | Order operations | Payment links (gateway), shipping (scope decision), order line → catalog links |
| **P2** | Polish | Vendor notes, quick replies, custom date range, alert→toast consistency |
    20|| **P3** | Money movement | Self-serve wallet recharge (today `recharge-wallet` is admin-only) |

**Suggested first sprint:** all of P0 plus the P2 quick wins — frontend-only apart from one wallet-transactions endpoint, and it removes every dead link and `alert` from the portal.

## Complete today

Login/signup, the full onboarding funnel, dashboard, conversations, [Customer Queries](../customer-queries/), catalog + smart import, FAQs, order status workflow, and all five Settings tabs.

## Related

- Customer Queries: [docs/CUSTOMER_QUERIES.md](../../../../docs/CUSTOMER_QUERIES.md)
    30|- Catalog enhancer: [docs/VENDOR_CATALOG_ENHANCER.md](../../../../docs/VENDOR_CATALOG_ENHANCER.md)
- Design rule for new portal UI: `.cursor/rules/21st-mcp-design.mdc`
