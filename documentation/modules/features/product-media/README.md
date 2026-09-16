# Product media (catalog images & videos)

Vendor-uploaded product photos and videos stored in S3, sent to customers as **native WhatsApp image/video messages** when they ask in chat.

**Authoritative spec:** [docs/PRODUCT_MEDIA.md](../../../../docs/PRODUCT_MEDIA.md)

## Summary

- **Where:** `web-vendor` product edit — media gallery (planned).
- **Storage:** `WA_MEDIA_S3_BUCKET` (`chatlogix-wa-media`). Keys: **`vendor/{vendorId}/conversations/…`** (inbound), **`vendor/{vendorId}/catalog/{productId}/…`** (product uploads). See spec §9.
- **AI:** LLM-1 op `send_product_media` → response queue → dispatcher (`sendWhatsAppImage` / `sendWhatsAppVideo`).
- **Billing:** One charge for the assistant turn (real AI cost × markup) plus one `outbound_media` charge per sent image/video. The media charge is **₹0 today** — its only component is `PlatformSettings.platformFeeOutboundMediaPaise`, which stays 0 until the P2h WhatsApp rate card. See [BILLING_AND_PRICING.md](../../../../docs/BILLING_AND_PRICING.md).

## Status

**Planning** — see spec §21 implementation phases. No `ProductMedia` model or outbound media path in code yet.

## Related

- Customer Queries when facts/media missing: `docs/CUSTOMER_QUERIES.md`
- Pipeline doc (update when implemented): `docs/INCOMING_RESPONSE_GENERATOR_FLOW.md`
