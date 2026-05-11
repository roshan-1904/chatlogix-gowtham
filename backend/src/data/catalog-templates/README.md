# Catalog Import Templates

Static starter catalogs surfaced via `POST /api/catalog-import/fast/template`
(Entry C — Template Start) so vendors in one of the supported categories can
skip extraction entirely and just set prices on a pre-populated row grid.

## Shape

Each file is a JSON array of objects matching a strict subset of
`NormalizedProductDraft` — intentionally minimal so the frontend can promote
rows to drafts without another round-trip:

```ts
interface TemplateRow {
  name: string;
  baseUnit: string;      // canonical — 'kg' | 'g' | 'litre' | 'ml' | 'piece' | ...
  baseQuantity: number;
  keywords: string[];    // 3-8 mixed-language tokens; frontend shows these raw
  description?: string;  // optional; shown as placeholder in review grid
}
```

Explicitly **no** `basePrice` — the vendor must fill pricing before commit; the
review grid flags every row as `needs_pricing`.

## Populated categories

- `grocery.json` — ~25 Indian grocery staples (rice, atta, oils, dals, spices,
  tea, coffee). Authored 2026-04 by engineering as a v1 seed.

## Stub categories

- `restaurant.json`, `bakery.json`, `garment.json`, `electronics.json` — empty
  arrays. `catalogTemplateService.getTemplate()` returns `[]` for these and
  `GET /api/catalog-import/template/:category/available` reports
  `{ available: false }` so the frontend hides Entry C.

**TODO:** merchandising to author real starter catalogs for each.
