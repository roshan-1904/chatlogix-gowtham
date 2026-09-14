# Catalog enhancer (Enhance with AI)

Vendor portal feature: chat-assisted enrichment of **product descriptions** and **FAQ answers** for better WhatsApp customer AI.

**Authoritative spec:** [docs/VENDOR_CATALOG_ENHANCER.md](../../../../docs/VENDOR_CATALOG_ENHANCER.md)

## Summary

- **Where:** `web-vendor` product edit and FAQ edit (after entity is saved).
- **UX:** Modal with chat + live preview; mic in composer; **Use this** saves to DB.
- **Billing:** Wallet debit at **2×** OpenAI API cost; UI shows credits note only (no meter).
- **Sessions:** Redis-backed resume for **24 hours** per product/FAQ (sliding TTL).

## Feature gate

Requires **`Vendor.catalogImportEnabled`** (shared with Smart Catalog Import). Ops can disable all enhancer traffic with **`CATALOG_ENHANCE_GLOBAL_KILL=true`**.

## API

- Base: `POST /api/catalog-enhance/sessions`, messages, voice, accept, delete session.
- See spec §15 for request/response shapes.

## Status

**Implemented** — backend `backend/src/routes/catalogEnhance.ts`, frontend `frontend_v2/apps/web-vendor/src/components/catalogEnhance/`.
