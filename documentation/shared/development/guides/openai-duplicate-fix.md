# OpenAI Duplicate Calls Fix

## Problem
All OpenAI API calls were being duplicated twice, causing unnecessary costs and slower response times. The issue was visible in OpenAI's dashboard as duplicate completions for every request.

## Root Cause
The `generateStructuredResponse` method in `backend/src/services/aiService.ts` had a validation retry logic that was triggering a second OpenAI API call whenever the first response failed schema validation. However, the validation logic was flawed:

1. The method always called `parseStructuredResponse()` which returns a fallback response even on parse errors
2. The `parsedOk` flag was only set to `true` if schema validation succeeded
3. If schema validation failed (which happened frequently), `parsedOk` remained `false`
4. This caused the retry logic to execute a second OpenAI call unnecessarily
5. Both the original call AND the retry call were logged in OpenAI's dashboard, creating the appearance of duplicates

## Solution
Modified the retry logic in `generateStructuredResponse` to only retry when absolutely necessary:

1. Changed the retry condition from `!parsedOk` to `needsRetry`
2. Only set `needsRetry = true` when:
   - No JSON is found in the response, OR
   - The response has parse errors AND no valid fallback message
3. Added detailed logging to track when retries occur and why
4. Improved error handling to distinguish between minor validation issues and complete failures

## Code Changes
**File**: `backend/src/services/aiService.ts`

**Key Changes**:
- Lines 1434-1514: Improved retry logic with better conditions
- Added `needsRetry` flag to control when retries actually happen
- Added comprehensive logging for retry scenarios
- Only retry when response is completely malformed, not just when schema validation fails

## Expected Results
- **Before**: Every API call was duplicated (2 calls per message)
- **After**: Only 1 API call per message, with retries only when absolutely necessary
- **Cost Savings**: ~50% reduction in OpenAI API costs
- **Performance**: Faster response times (no unnecessary retry delay)

## Monitoring
Retries will now be logged with warnings when they occur:
- Look for log entries with message: `"⚠️ Schema validation failed and fallback also failed - will retry"`
- Look for log entries with message: `"⚠️ No JSON found in response - will retry"`
- Look for log entries with message: `"⚠️ Parse error and no valid fallback - will retry"`

If you see frequent retry warnings, investigate the AI prompt or response format.

## Testing
After deploying this fix, monitor:
1. OpenAI dashboard - should see single completions instead of duplicates
2. Application logs - should see retries only when responses are truly malformed
3. Response quality - should remain the same or improve
4. API costs - should decrease significantly

