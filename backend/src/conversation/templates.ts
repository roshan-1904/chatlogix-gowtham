/**
 * Canned customer-facing copy for guard/error paths (spec §21, §25's code
 * layout lists a `templates.ts` for exactly this: no-credit, paused,
 * fallback). Only what's actually used by the pipeline built so far —
 * `aiPaused` has no customer-facing template at all (spec §21: "Store
 * inbound, no LLM, no debit, ACK" — no reply is sent while paused, the
 * vendor replies manually via the dashboard).
 */

export const WALLET_EMPTY_TEMPLATE =
  "We're unable to process your message right now. The shop will get back to you shortly.";

export const PROCESSOR_FALLBACK_TEMPLATE =
  "Sorry — I'm having trouble right now. Please send that again, or wait for the shop to reply.";
