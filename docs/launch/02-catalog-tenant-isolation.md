# 2. Admin catalog tenant isolation

## 1. Phase and why this task is in it

Phase 1. The assistant already loads a catalog by the conversation's vendor (`resolveCatalogContext` in `backend/src/conversation/context/resolveCatalogContext.ts`). The operator's screen does not. Ibell cannot be signed off while admin inspection shows another shop's products. This sits beside task 1 because a wrong catalog and a wrong price are both blockers before the next customer message is trusted.

## 2. Problem and user impact

`frontend_v2/apps/web-admin/src/pages/ShopInspection.tsx` loads `GET /products?vendorId=${vendorId}` from the route param. The products router takes `req.user.vendorId` first. The admin phone `+919790690170` is also Isha Bakers, so the token's shop wins. The 12 Nov inspection of Ibell returned 30 products for vendor `cb41052c-605d-4024-8f05-2f921574e2a2` (Black Forest, Geode Cubes). Ibell's own catalog is the brownie and cookie set, on the order of 8 products.

A later save from that screen can change Isha Bakers while the page title says Ibell. The customer-facing path is a separate bug only if the pipeline passes the wrong vendor. This task is the operator path.

## 3. Current behavior

`backend/src/routes/products.ts`:

| Handler | How the shop is chosen |
| --- | --- |
| `GET /` | `req.user?.vendorId \|\| req.query.vendorId`. A non-admin whose token shop differs from that id gets 403. An admin skips that check, so the token shop is used whenever it is set. |
| `GET /categories` | Same `\|\|` expression. |
| `POST /` | `req.user?.vendorId` only. An admin who is also a vendor creates the product on the token shop. |
| `GET /:id`, `PUT /:id`, `DELETE /:id`, `GET /:id/stats` | Vendor filter is applied only when `vendorId && !admin`. An admin loads or mutates any product id. |
| `POST /bulk` | Same admin bypass. The handler can update products from more than one shop. |

`requireVendorAccess` in `backend/src/middleware/authorize.ts` lets an admin through and requires a vendor token to match the extracted id. `GET /api/orders` uses it on `req.query.vendorId` (`backend/src/routes/orders.ts`). The orders list uses the query id. Do not change orders unless a test shows the query id ignored.

`resolveVendorId` in `backend/src/routes/customerQueries.ts` is the closer pattern: an admin with a query `vendorId` uses that id; otherwise it returns the token shop. Shop inspection passes `vendorId` for queries. The products list never reaches the query id when the token has a shop.

Grep for `req.user?.vendorId || req.query.vendorId` hits only those two handlers in `products.ts`. Siblings with the same effect:

- `backend/src/routes/faqs.ts` `GET /` and `POST /` use `req.user?.vendorId` and ignore a query or body shop. `GET /:id`, `PUT /:id`, and `DELETE /:id` skip the vendor filter for an admin.
- `requireProductForActor` in `backend/src/services/productMediaStorage.ts` skips `vendorId` when `actor.isAdmin` is true, so media routes on `/api/products/:id/media` can read or write any product.
- `backend/src/routes/catalogEnhance.ts`, `payments.ts`, `vendorWallet.ts`, and `vendorWhatsApp.ts` use the token shop. Those are the logged-in shop's own actions. The admin inspection page does not call them with another shop's id. Leave them token-scoped.

`invalidateCompactCatalog(vendorId)` after product writes must keep using the product's real `vendorId`, which today is `existing.vendorId` on update and delete. A create that lands on the wrong shop also invalidates the wrong cache.

## 4. Step-by-step implementation

1. Add `resolveProductVendorId(req)` next to the products router, modeled on `resolveVendorId` and stricter for admins:
   - Admin: use `req.query.vendorId` or `req.body.vendorId` when it is a non-empty string. Ignore `req.user.vendorId`. If the admin sent no shop id, respond 400. Do not fall back to the token shop.
   - Vendor: use `req.user.vendorId` only. If a query or body `vendorId` is present and different, respond 403.
2. Use that helper on every handler in `products.ts`: list, categories, get-by-id, create, update, delete, stats, and bulk.
   - List and categories query `where.vendorId` from the helper.
   - Create writes `vendorId` from the helper, then `invalidateCompactCatalog` on that id.
   - Get, update, delete, and stats: load the product, then require `product.vendorId` to equal the resolved shop. An admin who passes Ibell's id and Isha's product id gets 404. A vendor never sees another shop's id.
   - Bulk: require every selected product's `vendorId` to equal the resolved shop. Drop the path that updates several shops in one admin call.
3. Apply the same rule on `faqs.ts` list, create, get, update, and delete. Admin list and create take the requested shop id. Vendor calls with no shop id keep using the token. Admin get and update require the FAQ's `vendorId` to match the requested shop.
4. In `requireProductForActor`, when `isAdmin` is true, require a shop id argument (query or a new parameter the media routes already can pass) and match `product.vendorId`. When the media routes have no shop id on the request, take it from the product after a load and still refuse a vendor whose token shop differs. An admin mutation must not succeed against a product outside the shop the caller named. If the media UI never sends a shop id, the product's own `vendorId` is the scope after the load, and the vendor check stays `product.vendorId === actor.vendorId` for non-admins. State in the test which argument you used.
5. Add a regression test (route test beside `backend/src/routes/__tests__/`):
   - Admin token whose `vendorId` is shop A, `GET /products?vendorId=` shop B, response products all have `vendorId` B.
   - Vendor token for shop A, `GET /products?vendorId=` shop B, response 403.
   - Admin `POST /products` with body `vendorId` B creates under B, including when the token shop is A.
   - Admin `PUT /products/:id` for a product owned by A, with shop id B, returns 404 and does not change the row.
6. Re-check `ShopInspection.tsx`. It already passes `vendorId` on the products request. No client change is required for the list once the server prefers that id. Confirm the categories request, if the tab issues one, also sends `vendorId`.

No conversation-pipeline edit, so [`docs/INCOMING_RESPONSE_GENERATOR_FLOW.md`](../INCOMING_RESPONSE_GENERATOR_FLOW.md) stays as it is. No pricing edit.

## 5. What not to change

- `resolveCatalogContext` and the conversation pipeline's vendor id.
- `GET /api/orders` and `requireVendorAccess`, unless a test shows the query shop ignored.
- Wallet routes, onboarding, and the vendor's own WhatsApp connect routes. They stay on the token shop.
- Product rows, prices, and stock. This task changes which shop a request is allowed to see.
- Ibell's live number and Embedded Signup.

## 6. Acceptance checks

- On `localhost:3001`, signed in as `+919790690170`, open Ibell's catalog tab. The list is Ibell's brownies and cookies, on the order of 8 products. Black Forest and Geode Cubes stay on Isha Bakers (`cb41052c-605d-4024-8f05-2f921574e2a2`).
- A vendor token for shop A receives 403 for shop B's products, categories, and a product id owned by B.
- An admin create or update with shop id Ibell writes an Ibell product. The same call does not change an Isha product.
- Negative case: an admin request with no shop id returns 400 and an empty write. It does not list Isha Bakers by default.
- Negative case: vendor A still cannot read vendor B after the admin path is fixed.

## 7. Dependencies

Task 1's host note is done. The code change does not wait on the settings write. Phase 2 waits on this test.
