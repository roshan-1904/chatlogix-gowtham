# Multi-Stage AI USD Cost Tracking Implementation Plan

> **⚠️ Superseded (as of 2026-09):** This plan targets `backend/src/services/multiStageOrchestrator.ts`, which has since been **retired from the live WhatsApp message hot path** (it's now only invoked by `catalogImportSandboxService.ts`, unrelated to live customer messages). Cost tracking for current production message processing (LLM-1 + CartEngine + optional LLM-2, on AWS Lambda) is a separate concern — see `docs/CONVERSATION_PROCESSOR_LAMBDA.md`. Kept below for historical reference.

## Objective

Capture and persist accurate AI spend in **USD** for every assistant response message, even when different stages use different models with different pricing.

## Scope

- Backend only (`backend/`)
- Multi-stage orchestrator flow, including unified and fallback paths
- USD-only storage (no INR conversion)
- Per-stage tracking + per-message aggregated storage

## Success Criteria

1. Every assistant `Message` row stores final `aiCostUsd`.
2. Cost is calculated per stage using that stage's model pricing.
3. Final message cost equals sum of stage-level costs for the response.
4. Model-wise cost breakdown is available on each assistant message.
5. No AI path (primary/unified/fallback) skips cost instrumentation.

## Implementation Phases

### Phase 1: Schema Updates

Update `backend/prisma/schema.prisma` with new fields.

#### `Message` additions

- `aiCostUsd` (prefer `Decimal`, else `Float`)
- `aiPromptTokens` (`Int @default(0)`)
- `aiCompletionTokens` (`Int @default(0)`)
- `aiPrimaryModel` (`String?`)
- `aiModelBreakdown` (`Json?`)

Keep existing `aiTokensUsed` for backward compatibility.

#### `StageExecutionLog` additions

- `model` (`String?`)
- `promptTokens` (`Int @default(0)`)
- `completionTokens` (`Int @default(0)`)

Keep existing `cost` field as USD.

#### Migration tasks

1. Create Prisma migration.
2. Run migration on local/dev DB.
3. Regenerate Prisma client.
4. Verify existing code paths still compile.

---

### Phase 2: Centralize Cost Calculation

Enhance `backend/src/utils/costCalculator.ts` as the single pricing source.

#### Required behavior

- Accept `model`, `promptTokens`, `completionTokens`, optional `totalTokens`.
- Return normalized output:
  - `model`
  - `promptTokens`
  - `completionTokens`
  - `totalTokens`
  - `costUsd`
  - `isEstimated` (true when using assumed split)

#### Rules

- Use exact per-model pricing when prompt/completion tokens are present.
- When only total tokens exist, apply a documented estimate (e.g., 80/20 split).
- For unknown models, fall back to default model pricing and emit warning logs.

---

### Phase 3: Stage-Level Instrumentation

Update `backend/src/services/multiStageOrchestrator.ts` so every AI stage writes complete pricing metadata.

#### For each AI-invoking stage, ensure `logStageExecution` gets

- `model`
- `tokensUsed`
- `promptTokens`
- `completionTokens`
- `cost` (USD from centralized calculator)

#### Normalize fallback paths

- Remove hardcoded cost shortcuts where possible.
- Route legacy/fallback estimates through the same calculator.
- Mark estimated values in metadata where exact token split is unavailable.

---

### Phase 4: Aggregate Final Response Cost

At the end of orchestration (before Stage 9 queueing), aggregate stage data.

#### Build totals

- `totalTokensUsed` (sum of AI stages)
- `totalPromptTokens`
- `totalCompletionTokens`
- `totalCostUsd`

#### Build model-wise breakdown

Group by model:

- `promptTokens`
- `completionTokens`
- `totalTokens`
- `costUsd`

Also include `_totals` block for direct consumption.

---

### Phase 5: Persist on Assistant Message

Update `backend/src/services/responseQueuingService.ts`.

#### Extend queue metadata payload

Pass these values into stage 9 metadata:

- `tokensUsed`
- `costUsd`
- `promptTokens`
- `completionTokens`
- `primaryModel`
- `modelBreakdown`

#### Store in `Message` create

When creating assistant message, persist:

- `aiTokensUsed`
- `aiCostUsd`
- `aiPromptTokens`
- `aiCompletionTokens`
- `aiPrimaryModel`
- `aiModelBreakdown`

Use safe defaults when metadata is absent to avoid breaking older callers.

---

### Phase 6: Validation & Reporting

Create a verification script in `backend/scripts/`:

- Pick a conversation/message.
- Compare `sum(stageExecutionLog.cost)` vs `message.aiCostUsd`.
- Validate token and model breakdown totals.
- Fail if mismatch exceeds tolerance (rounding threshold).

Optionally extend usage/reporting endpoints to read directly from `Message.aiCostUsd` for response-level spend.

## Data Contract (Recommended)

Suggested `aiModelBreakdown` JSON structure:

```json
{
  "gpt-4o-mini": {
    "promptTokens": 1200,
    "completionTokens": 350,
    "totalTokens": 1550,
    "costUsd": 0.00039
  },
  "gpt-4o": {
    "promptTokens": 400,
    "completionTokens": 120,
    "totalTokens": 520,
    "costUsd": 0.00220
  },
  "_totals": {
    "promptTokens": 1600,
    "completionTokens": 470,
    "totalTokens": 2070,
    "costUsd": 0.00259
  }
}
```

## Testing Plan

1. Unit tests (`costCalculator`)
   - exact model pricing
   - unknown model fallback
   - estimated mode when split unavailable
2. Integration tests (`multiStageOrchestrator`)
   - mixed-model stage execution
   - unified path
   - fallback path
3. Persistence tests (`responseQueuingService`)
   - assistant message stores all new cost fields
4. Regression checks
   - existing flows continue when metadata missing

## Rollout Plan

1. Deploy schema migration + backend changes together.
2. Monitor logs for unknown model pricing fallbacks.
3. Run verification script on recent conversations.
4. Optional backfill for old messages that only have `aiTokensUsed`.

## Open Decisions

1. **Money type:** `Decimal` (recommended) vs `Float` (faster integration).
2. **Estimated flag:** whether to add explicit DB field to tag estimated costs.
3. **Primary model logic:** highest-cost model vs highest-token model.

