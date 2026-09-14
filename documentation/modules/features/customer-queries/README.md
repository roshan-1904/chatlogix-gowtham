# Customer Queries (knowledge inbox)

When the WhatsApp AI cannot ground a **product or policy** fact, it should not bury “I’ll check with the vendor” in the conversation thread. **Customer Queries** is a vendor inbox for those gaps. After the vendor answers once, ChatLogix can store an **English FAQ** (or send the vendor to fix **English product variants**) so the next customer is answered automatically.

**Authoritative spec:** [docs/CUSTOMER_QUERIES.md](../../../../docs/CUSTOMER_QUERIES.md)  
**Quoted WhatsApp replies (v1.1 design):** [docs/CUSTOMER_QUERY_QUOTED_REPLIES.md](../../../../docs/CUSTOMER_QUERY_QUOTED_REPLIES.md)

## Summary

- **Detect:** LLM-1 `knowledge_gap` op (phrase fallback). Does **not** pause AI (unlike handoff).
- **Vendor UI:** Queries list + badge; reply from the list or from Conversations.
- **Then:** Confirm → English FAQ, or update catalog variants, or dismiss.
- **English only** in stored FAQ Q+A and product variant labels (customer WhatsApp stays in their language).
- **Order status is out of scope:** never “we’ll check and get back”; answer from `RECENT ORDERS`.

## Status

**Implemented (v1)** — D6, persist, `/queries` inbox, promotion, English FAQ/variant gates, throttled vendor ping. Spec: `docs/CUSTOMER_QUERIES.md`.

**Implemented (v1.1)** — Auto-quote on Queries reply (`quoteMessageId`); optional Reply in Conversations (`replyToMessageId`); Graph fallback with `questionOriginal` + reply. Spec: `docs/CUSTOMER_QUERY_QUOTED_REPLIES.md`.

## Motivating chat

Customer `9790690170` (Murali / Ibell Creations): size availability deferred to Kanmani and never became a ticket; order-status also said “still checking” even though orders were in the prompt.

## Related

- FAQ retrieval: `backend/src/conversation/prefetch.ts` `loadFaqs`
- Handoff (do not reuse): `backend/src/conversation/handoff.ts`
- English helper: `backend/src/utils/vendorEnglish.ts`
- Catalog enhancer (polish FAQ after save): [docs/VENDOR_CATALOG_ENHANCER.md](../../../../docs/VENDOR_CATALOG_ENHANCER.md)
