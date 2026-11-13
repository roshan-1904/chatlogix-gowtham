# WhatsApp catalog cards

Phase 4. This note is a reason to wait. It is not a build spec.

## Why it waits

Ibell's assistant already answers from the text catalog for that shop (`resolveCatalogContext` takes a `vendorId`). Admin inspection of that catalog is task 2, and it was wrong on 12 Nov. A product card, a multi-product message, or a Meta commerce catalog would show whatever catalog the send path resolves. Until Phase 1's exit check passes, that can be another shop's 30 bakery products, or a card priced with a ₹222 platform fee on the surrounding turn.

Cards also need approved product media and a 24-hour session or a template. `send_product_media` already sends a photo from `ProductMedia` when the customer asks. That path is enough for a first shop.

## What must be true first

- Phase 3's exit: a new shop's admin catalog is that shop's products, a reply is under ₹1 with platform fee 0, and Ibell's number was not put through Embedded Signup.
- Task 2's rule stays: an admin cannot write shop A's media onto shop B (`requireProductForActor`).
- The owner can take the thread (task 8) when a card would have been the wrong product.

## What not to build meanwhile

Do not add Meta product messages, multi-product lists, catalog sync to WhatsApp Commerce, or a card renderer in the response dispatcher. Do not extend `send_product_media` into a carousel. Leave `docs/PRODUCT_MEDIA.md` as the photo path. Do not start a catalog-mapping project beside tasks 1–13.
