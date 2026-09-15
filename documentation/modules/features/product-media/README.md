# Product media (catalog images & videos)

Vendor-uploaded product photos and videos stored in S3, sent to customers as **native WhatsApp image/video messages** when they ask in chat.

**Authoritative spec:** [docs/PRODUCT_MEDIA.md](../../../../docs/PRODUCT_MEDIA.md)

## Summary

- **Where:** `web-vendor` product edit — media gallery (planned).
- **Storage:** Private S3 (`ProductMedia` table, planned).
- **AI:** LLM-1 op `send_product_media` → response queue → dispatcher (`sendWhatsAppImage` / `sendWhatsAppVideo`).
- **Billing:** Per outbound message kind (text + image/video credits).

## Status

**Planning** — see spec §21 implementation phases. No `ProductMedia` model or outbound media path in code yet.

## Related

- Customer Queries when facts/media missing: `docs/CUSTOMER_QUERIES.md`
- Pipeline doc (update when implemented): `docs/INCOMING_RESPONSE_GENERATOR_FLOW.md`
