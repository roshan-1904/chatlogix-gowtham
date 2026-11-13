# Consolidated plan template

Save as `docs/product-review/<YYYY-MM-DD>-po-review.md`. Write it for the founder and the engineers who will pick up the next task: they need the status, the order, and the reasons, not the review process.

```markdown
# Product review — <YYYY-MM-DD>

Reviewed at commit `<sha>` (working tree, including uncommitted docs). Scope: <all requirement docs | folder | feature>. Competitor facts read <date range>; sources in §3.

This is a plan. It does not change product behavior.

## 1. Where we are

<3–6 sentences: what a real shop can do today, what still breaks its day, what is unsafe. Plain words.>

| Status | Count |
| --- | --- |
| Done | n |
| Partial | n |
| Not started | n |
| Drifted | n |
| Blocked | n |
| Superseded | n |

## 2. Requirement status

One row per requirement. Evidence is `path:line` or a test name.

| Requirement | Doc | Status | Evidence | Gap | Competitive role | Priority (was → now) |
| --- | --- | --- | --- | --- | --- | --- |

## 3. Market changes since the last review

What moved in the field and what it changes for us. Each item: fact, source URL + date read, consequence for the plan. Say "No material change" if that is the finding.

## 4. The plan

Phases in order. A phase starts when the previous exit check passes. No target dates.

### Phase N — <outcome in shop terms>

**Outcome.** <what the shop can do at the end>

| Order | Task | Size | Doc | Depends on |
| --- | --- | --- | --- | --- |

**Exit.** <checks someone can run: click path, query, number>

**Stays manual.** <what the owner or founder still does by hand>

## 5. New requirements found in this review

| Requirement | Why (shop impact) | Where it goes | Doc |
| --- | --- | --- | --- |

## 6. Dropped, merged or deferred

| Requirement | Decision | Reason |
| --- | --- | --- |

## 7. Open decisions for the owner

| # | Decision | Options | Recommendation | Evidence |
| --- | --- | --- | --- | --- |

## 8. Risks

Money safety, tenant isolation, production-only facts not verifiable from the repo, external waits (Razorpay D1, Meta template approval).

## 9. What this review changed

| File | Change |
| --- | --- |
```
