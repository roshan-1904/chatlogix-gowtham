# Field trace: schema → migration → index → backend → API → frontend

Use this when a change adds, renames, removes or retypes a database column, an API request or response field, or an enum value. Follow each field through every stop below and fill one row of the report table per field. A field that stops partway is the most common defect in this repo's kind of change: the column exists but nothing writes it, the API returns it but no screen shows it, or the screen sends it and the server drops it.

Never run a migration during a review. Read it.

## 1. Prisma schema (`backend/prisma/schema.prisma`)

- Type fits the data. Money is an integer with the unit in the name: `…Milli` for wallet/billing, paise for orders and products. Amounts that can exceed about ₹21 lakh in milli need `BigInt`.
- Nullable or default is a deliberate choice. A required column with no default cannot be added to a table that already has rows.
- Strings that have a fixed set of values: an enum or a `CHECK` constraint in the migration, matching how nearby models do it.
- Relations have an explicit `onDelete`. Money and audit tables use `Restrict`.
- The model keeps its `@@map` (table names stay PascalCase).
- `npx prisma validate` passes (it reads the schema only).

## 2. Migration (`backend/prisma/migrations/<timestamp>_<name>/migration.sql`)

- **It exists.** A schema change with no new timestamped folder is a Blocker: `deploy-ec2.sh` runs `prisma migrate deploy`, which applies folders only. The loose `*.sql` files in the migrations directory are legacy manual scripts; a new one of those is not a migration.
- **It matches the schema.** Compare column by column: name, type, nullability, default, enum values, foreign keys and `ON DELETE`, every `@@index` and `@@unique`. Prisma's index names follow `Table_col1_col2_idx`; a hand-written name that differs makes the next `migrate dev` generate a drop and re-create.
- **It works on existing rows.**
  - `NOT NULL` without `DEFAULT` on an existing table fails. Needs a default, or add nullable → backfill → set not null.
  - A new unique index fails if current data has duplicates. Is there a dedupe step?
  - A new `CHECK` or foreign key fails if current rows violate it.
  - Changing a column type or shrinking a `VARCHAR` can fail or truncate.
- **It does not lose data.** `DROP COLUMN`, `DROP TABLE`, a rename done as drop + add, or a type change with a lossy cast are Blockers unless the requirement doc says the data is disposable.
- **Backfills are safe to rerun** and leave a marker where money is involved. The wallet ×10 rescale is the cautionary tale: it must never run twice (see `CLAUDE.md`, migrations note).
- **Locking.** `Message`, `Conversation`, `Order`, `CreditUsage` and `WalletTransaction` are the large, hot tables. Adding an index or rewriting a column there locks writes while the migration runs and the pipeline is live. Call it out so the deploy is timed, even if the SQL is correct.
- **Deploy order.** The EC2 deploy applies migrations; the five Lambdas deploy separately and share the same database. New code that reads a column must not go live before the migration, and a migration that removes or renames a column must not go live while old Lambda code still reads it. For removals and renames, the safe shape is two releases: stop using it, then drop it.
- **One migration per change**, with a timestamp later than the latest existing folder.

## 3. Indexes

For every new query in the diff (and every existing query that now filters or sorts on the new field), write down the `where`, `orderBy` and join columns, then check an index covers them.

- Tenant-scoped lists lead with `vendorId`: `(vendorId, createdAt DESC)`, `(vendorId, status)` and so on. Follow the neighbouring models.
- Foreign-key columns used for lookups or joins have an index. Prisma does not add one automatically on Postgres.
- Idempotency keys, external ids (Razorpay, WhatsApp message id) and "one per X" rules are `@@unique`, not just indexed. The constraint is what stops the duplicate, not the code.
- The sort direction in the index matches the query when the list is paginated newest-first.
- Do not flag a missing index on a small, rarely read table, and do flag a new index on a hot write table that no query in the diff uses: each index slows every insert.
- `LIKE '%text%'` and JSON-field filters do not use a plain b-tree index. Say so if the feature depends on them at scale.

## 4. Backend

- **Write path:** the service that creates or updates the row sets the field. The Zod schema for the route accepts it with the right type and bounds. A vendor cannot set a field that only an admin or the system should.
- **Read path:** the query selects it. If the service uses an explicit `select`, the new field must be added there or it never leaves the database.
- **Response:** the route returns it on purpose. Check both directions: the field is present where the frontend needs it, and it is absent where it should not be seen (vendor responses must not gain admin-only or cost-internal fields because the route returns the whole row).
- `BigInt` and `Decimal` are converted before `res.json` (`utils/bigIntJson.ts`).
- Other writers and readers of the model are updated: the conversation pipeline (`backend/src/conversation/`), Lambda handlers, workers, scripts under `backend/scripts/`, seed and load-test code, and test factories.
- `backend/src/docs/openapi.ts` describes the route if the route was already documented there.
- An enum value added in the schema is handled in every `switch` and status map on both sides. Grep for one of the existing values to find them all.

## 5. Frontend (`frontend_v2`)

Find the API call for the route, then follow the field to the screen.

- Vendor app: API wrappers in `apps/web-vendor/src/lib/`, `src/services/` and `src/api/`; types in `src/types/`. Admin app: `apps/web-admin/src/lib/`. Shared: `packages/api-client`, `packages/schemas`.
- The TypeScript type for the response or request includes the field with the same name, type and nullability the backend sends. `any` hides mismatches; open the type.
- Something uses it: a component renders it, or a form sends it. A field returned by the API and referenced nowhere in `frontend_v2` is a finding ("added to the API, not used in the frontend") unless the requirement says it is backend-only. Grep the exact field name across `frontend_v2/apps` and `frontend_v2/packages`.
- Money is converted at the edge with the app's money helpers, and the screen shows rupees. A raw milli or paise number on screen is a finding.
- Null and missing are handled: rows created before the migration will not have a value.
- New user-facing text follows the app's i18n setup where the screen already uses it.
- If both apps show the same model, both were updated or the report says which was left out.
- Never look in or edit `frontend/`.

## 6. Removed or renamed fields

Grep the old name across `backend/src`, `backend/scripts`, `frontend_v2` (including `apps/vendor-mobile`), tests and docs. Every remaining use is a finding. Check raw SQL strings too; Prisma's type checker does not see inside them.

## Report table

| Field | Schema | Migration | Index | Backend write/read | API response | Frontend |
| --- | --- | --- | --- | --- | --- | --- |
| `Order.exampleField` | ok, `Int?` | ok, `2026…/migration.sql:12` | missing for `where vendorId + exampleField` | written in `orderService.ts:88`, not in `select` at `:140` | absent | type added, not rendered |

Each cell is `ok` with a location, or what is wrong. Any cell that is not `ok` becomes a finding in the main list.
