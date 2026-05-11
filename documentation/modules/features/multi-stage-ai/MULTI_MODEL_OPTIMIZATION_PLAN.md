# Multi-Model Optimization Plan for Multi-Stage AI Worker

**Date:** December 7, 2025  
**Objective:** Optimize cost and performance by using different AI models for different stages based on complexity and requirements

---

## Executive Summary

**Current State:** All stages use `gpt-4o-mini` ($0.15/$0.60 per 1M tokens)  
**Proposed State:** Use optimal model per stage based on complexity  
**Expected Savings:** Additional 30-40% cost reduction on top of current multi-stage savings  
**Total Potential Savings:** 80-85% vs original single-stage system

---

## Available Models & Pricing

| Model | Input Cost | Output Cost | Best For | Speed | Reasoning |
|-------|-----------|-------------|----------|-------|-----------|
| **GPT-5 Nano** | $0.05/1M | $0.40/1M | Simple tasks, high volume | Fastest | Good |
| **GPT-4o-mini** | $0.15/1M | $0.60/1M | Balanced tasks | Fast | Good |
| **GPT-4o** | $2.50/1M | $10.00/1M | Complex reasoning | Slower | Excellent |

---

## Stage-by-Stage Model Recommendation

### Stage 0: Message Normalization
**Current Model:** `gpt-4o-mini`  
**Recommended Model:** `gpt-5-nano`  
**Reasoning:**
- **Task Complexity:** Low (emoji interpretation, typo correction, abbreviation expansion)
- **Accuracy Requirement:** Medium (errors acceptable, can be corrected later)
- **Token Usage:** 50-150 tokens
- **Cost Impact:** Save 67% on input, 33% on output
- **Risk:** Low - normalization errors can be caught in later stages

**Migration Priority:** ⭐⭐⭐ High (frequent, low complexity)

---

### Stage 1: Intent Classification
**Current Model:** `gpt-4o-mini`  
**Recommended Model:** `gpt-5-nano` OR `gpt-4o-mini` (with testing)  
**Reasoning:**
- **Task Complexity:** Medium-High (critical for routing)
- **Accuracy Requirement:** High (affects all downstream stages)
- **Token Usage:** 200-400 tokens
- **Cost Impact:** Save 67% if using nano
- **Risk:** Medium - misclassification affects entire flow

**Recommendation:** 
- **Phase 1:** Test `gpt-5-nano` in parallel with `gpt-4o-mini`
- **Phase 2:** Migrate if accuracy ≥ 95% (current baseline)
- **Fallback:** Keep `gpt-4o-mini` if nano accuracy drops

**Migration Priority:** ⭐⭐ Medium (critical but testable)

---

### Stage 1.7: Correction Detection
**Current Model:** `gpt-4o-mini`  
**Recommended Model:** `gpt-5-nano`  
**Reasoning:**
- **Task Complexity:** Low (pattern detection)
- **Accuracy Requirement:** Medium (conditional stage)
- **Token Usage:** 50-100 tokens
- **Cost Impact:** Save 67% on input
- **Risk:** Low - only triggers conditionally

**Migration Priority:** ⭐⭐⭐ High (low risk, high savings)

---

### Stage 4: Primary AI Response Generation
**Current Model:** `gpt-4o-mini`  
**Recommended Model:** `gpt-4o-mini` (KEEP)  
**Reasoning:**
- **Task Complexity:** Very High (main customer response + data extraction)
- **Accuracy Requirement:** Critical (customer-facing, order creation)
- **Token Usage:** 600-1000 tokens (largest stage)
- **Cost Impact:** This is the main cost driver
- **Risk:** High - quality directly impacts customer experience

**Alternative Consideration:**
- **Option A:** Keep `gpt-4o-mini` (recommended)
- **Option B:** Test `gpt-5-nano` with strict quality monitoring
- **Option C:** Use `gpt-4o` for complex orders (order_update, multi-item)

**Migration Priority:** ⭐ Low (keep current, test alternatives carefully)

---

### Stage 4.7: Proactive Assistance
**Current Model:** `gpt-4o-mini`  
**Recommended Model:** `gpt-5-nano`  
**Reasoning:**
- **Task Complexity:** Low-Medium (suggestion generation)
- **Accuracy Requirement:** Low (optional, non-critical)
- **Token Usage:** 100-200 tokens
- **Cost Impact:** Save 67% on input
- **Risk:** Very Low - optional stage, failures are acceptable

**Migration Priority:** ⭐⭐⭐ High (optional stage, low risk)

---

### Stage 6: Response Refinement
**Current Model:** `gpt-4o-mini`  
**Recommended Model:** `gpt-5-nano`  
**Reasoning:**
- **Task Complexity:** Medium (refines existing response)
- **Accuracy Requirement:** Medium (only when clarification needed)
- **Token Usage:** 200-400 tokens
- **Cost Impact:** Save 67% on input
- **Risk:** Low-Medium - conditional stage, can fallback to original

**Migration Priority:** ⭐⭐ Medium (conditional, testable)

---

### Stage 7: Message Composition
**Current Model:** `gpt-4o-mini`  
**Recommended Model:** `gpt-5-nano`  
**Reasoning:**
- **Task Complexity:** Low-Medium (formatting and polish)
- **Accuracy Requirement:** Medium (final formatting)
- **Token Usage:** 150-300 tokens
- **Cost Impact:** Save 67% on input
- **Risk:** Low - formatting task, can be validated

**Migration Priority:** ⭐⭐⭐ High (formatting task, low risk)

---

### Stage 8.5: Quality Assessment
**Current Model:** `gpt-4o-mini`  
**Recommended Model:** `gpt-5-nano`  
**Reasoning:**
- **Task Complexity:** Low (scoring and assessment)
- **Accuracy Requirement:** Low (monitoring only, non-critical)
- **Token Usage:** 100-200 tokens
- **Cost Impact:** Save 67% on input
- **Risk:** Very Low - optional monitoring stage

**Migration Priority:** ⭐⭐⭐ High (monitoring only, low risk)

---

## Recommended Model Assignment

| Stage | Current Model | Recommended Model | Priority | Risk Level |
|-------|--------------|-------------------|----------|------------|
| **Stage 0** | gpt-4o-mini | **gpt-5-nano** | High | Low |
| **Stage 1** | gpt-4o-mini | **gpt-5-nano** (test first) | Medium | Medium |
| **Stage 1.7** | gpt-4o-mini | **gpt-5-nano** | High | Low |
| **Stage 4** | gpt-4o-mini | **gpt-4o-mini** (keep) | Low | High |
| **Stage 4.7** | gpt-4o-mini | **gpt-5-nano** | High | Very Low |
| **Stage 6** | gpt-4o-mini | **gpt-5-nano** | Medium | Low-Medium |
| **Stage 7** | gpt-4o-mini | **gpt-5-nano** | High | Low |
| **Stage 8.5** | gpt-4o-mini | **gpt-5-nano** | High | Very Low |

---

## Cost Analysis

### Current Cost (All gpt-4o-mini)
**Per Message (Average Case):**
- Stage 0: 100 tokens = $0.000015
- Stage 1: 300 tokens = $0.000045
- Stage 1.7: 100 tokens = $0.000015 (conditional)
- Stage 4: 800 tokens = $0.000120
- Stage 4.7: 200 tokens = $0.000030 (optional)
- Stage 6: 300 tokens = $0.000045 (conditional)
- Stage 7: 200 tokens = $0.000030
- Stage 8.5: 150 tokens = $0.000023 (optional)

**Total:** ~$0.000323 per message

### Optimized Cost (Multi-Model)
**Per Message (Average Case):**
- Stage 0: 100 tokens = $0.000005 (gpt-5-nano) ⬇️ 67%
- Stage 1: 300 tokens = $0.000015 (gpt-5-nano) ⬇️ 67%
- Stage 1.7: 100 tokens = $0.000005 (gpt-5-nano) ⬇️ 67%
- Stage 4: 800 tokens = $0.000120 (gpt-4o-mini) ➡️ Same
- Stage 4.7: 200 tokens = $0.000010 (gpt-5-nano) ⬇️ 67%
- Stage 6: 300 tokens = $0.000015 (gpt-5-nano) ⬇️ 67%
- Stage 7: 200 tokens = $0.000010 (gpt-5-nano) ⬇️ 67%
- Stage 8.5: 150 tokens = $0.000008 (gpt-5-nano) ⬇️ 67%

**Total:** ~$0.000188 per message  
**Savings:** ~42% reduction vs current multi-stage  
**Total Savings:** ~91% vs original single-stage system

---

## Implementation Plan

### Phase 1: Low-Risk Migrations (Week 1)
**Stages to Migrate:**
1. ✅ Stage 0 (Message Normalization)
2. ✅ Stage 1.7 (Correction Detection)
3. ✅ Stage 4.7 (Proactive Assistance)
4. ✅ Stage 8.5 (Quality Assessment)

**Expected Savings:** ~15-20% cost reduction  
**Risk:** Very Low  
**Testing:** A/B test with 10% traffic

---

### Phase 2: Medium-Risk Migrations (Week 2-3)
**Stages to Migrate:**
1. ✅ Stage 7 (Message Composition)
2. ✅ Stage 6 (Response Refinement) - conditional

**Expected Additional Savings:** ~10-15%  
**Risk:** Low-Medium  
**Testing:** A/B test with 25% traffic, monitor quality metrics

---

### Phase 3: Critical Stage Testing (Week 4)
**Stage to Test:**
1. ⚠️ Stage 1 (Intent Classification)

**Approach:**
- Run parallel: 50% gpt-4o-mini, 50% gpt-5-nano
- Monitor intent accuracy, confidence scores
- Compare cost and quality metrics
- Migrate if accuracy ≥ 95% (current baseline)

**Expected Additional Savings:** ~10-15% if successful  
**Risk:** Medium  
**Fallback:** Keep gpt-4o-mini if quality drops

---

### Phase 4: Stage 4 Optimization (Optional, Week 5+)
**Considerations:**
- Keep `gpt-4o-mini` for Stage 4 (recommended)
- OR: Test `gpt-5-nano` with strict quality gates
- OR: Use `gpt-4o` for complex orders only (order_update, multi-item)

**Expected Additional Savings:** 0-20% (depending on approach)  
**Risk:** High  
**Recommendation:** Defer until other optimizations proven

---

## Quality Assurance Strategy

### Metrics to Monitor

1. **Intent Classification Accuracy**
   - Target: ≥ 95% (current baseline)
   - Monitor: Classification confidence, misclassification rate
   - Alert: If accuracy drops below 93%

2. **Response Quality**
   - Target: Naturalness score ≥ 4.7/5.0
   - Monitor: Customer satisfaction, conversation quality
   - Alert: If quality drops below 4.5/5.0

3. **Data Extraction Accuracy**
   - Target: Order items extracted correctly ≥ 98%
   - Monitor: Empty orderItems rate, product matching accuracy
   - Alert: If extraction rate drops below 95%

4. **Cost Metrics**
   - Monitor: Cost per message, cost per stage
   - Target: 40-50% reduction vs current
   - Alert: If cost increases unexpectedly

### Fallback Strategy

**For Each Stage:**
- Implement automatic fallback to `gpt-4o-mini` if:
  - Quality metrics drop below thresholds
  - Error rate increases significantly
  - Response time degrades

**Monitoring:**
- Real-time quality dashboards
- Automated alerts for quality degradation
- A/B test comparison reports

---

## Advanced Optimization: Conditional Model Selection

### Stage 4: Dynamic Model Selection

**Proposal:** Use different models based on order complexity

```typescript
if (intent === 'order_update' && orderItems.length > 3) {
  // Complex order update - use gpt-4o-mini (or gpt-4o)
  model = 'gpt-4o-mini';
} else if (intent === 'product_inquiry' && needsClarification) {
  // Simple inquiry - use gpt-5-nano
  model = 'gpt-5-nano';
} else {
  // Default - use gpt-4o-mini
  model = 'gpt-4o-mini';
}
```

**Benefits:**
- Optimize cost for simple cases
- Maintain quality for complex cases
- Expected savings: Additional 10-15%

---

## Risk Assessment

### Low Risk Migrations ✅
- Stage 0, 1.7, 4.7, 8.5, 7
- **Impact:** High savings, low risk
- **Recommendation:** Migrate immediately

### Medium Risk Migrations ⚠️
- Stage 1, Stage 6
- **Impact:** High savings, medium risk
- **Recommendation:** Test thoroughly before migration

### High Risk (Keep Current) 🔴
- Stage 4 (Primary AI Response)
- **Impact:** Largest cost driver, critical quality
- **Recommendation:** Keep gpt-4o-mini, test alternatives carefully

---

## Expected Outcomes

### Cost Reduction
- **Phase 1:** 15-20% reduction
- **Phase 2:** Additional 10-15% reduction
- **Phase 3:** Additional 10-15% reduction (if successful)
- **Total Potential:** 35-50% reduction vs current multi-stage
- **Total vs Original:** 85-90% reduction vs single-stage system

### Performance Impact
- **Speed:** Faster responses (gpt-5-nano is optimized for speed)
- **Quality:** Maintained or improved (better reasoning in gpt-5-nano)
- **Reliability:** Improved (distributed risk across models)

---

## Implementation Checklist

### Week 1: Low-Risk Migrations
- [ ] Update Stage 0 to use `gpt-5-nano`
- [ ] Update Stage 1.7 to use `gpt-5-nano`
- [ ] Update Stage 4.7 to use `gpt-5-nano`
- [ ] Update Stage 8.5 to use `gpt-5-nano`
- [ ] Deploy with 10% traffic A/B test
- [ ] Monitor quality metrics for 3 days
- [ ] Roll out to 100% if metrics stable

### Week 2-3: Medium-Risk Migrations
- [ ] Update Stage 7 to use `gpt-5-nano`
- [ ] Update Stage 6 to use `gpt-5-nano`
- [ ] Deploy with 25% traffic A/B test
- [ ] Monitor quality metrics for 5 days
- [ ] Roll out to 100% if metrics stable

### Week 4: Critical Stage Testing
- [ ] Implement parallel testing for Stage 1
- [ ] Run 50/50 split for 7 days
- [ ] Compare accuracy, cost, quality metrics
- [ ] Make go/no-go decision
- [ ] Migrate if quality maintained

### Ongoing: Monitoring & Optimization
- [ ] Set up quality dashboards
- [ ] Implement automated alerts
- [ ] Review cost metrics weekly
- [ ] Optimize model selection based on data

---

## Code Changes Required

### 1. Model Configuration Service
Create `modelSelectionService.ts`:
```typescript
export function getModelForStage(
  stage: string,
  context: StageContext
): string {
  const modelConfig = {
    'stage_0': 'gpt-5-nano',
    'stage_1': 'gpt-5-nano', // after testing
    'stage_1.7': 'gpt-5-nano',
    'stage_4': 'gpt-4o-mini', // keep for now
    'stage_4.7': 'gpt-5-nano',
    'stage_6': 'gpt-5-nano',
    'stage_7': 'gpt-5-nano',
    'stage_8.5': 'gpt-5-nano'
  };
  
  return modelConfig[stage] || 'gpt-4o-mini';
}
```

### 2. Update Each Service
- Modify each service to accept `model` parameter
- Update OpenAI client calls to use dynamic model
- Add fallback logic for model failures

### 3. Feature Flags
- Add feature flags for gradual rollout
- Enable A/B testing per stage
- Monitor and control migration pace

---

## Success Criteria

### Phase 1 Success ✅
- Cost reduction: ≥ 15%
- Quality maintained: All metrics ≥ baseline
- Zero critical errors

### Phase 2 Success ✅
- Additional cost reduction: ≥ 10%
- Quality maintained: All metrics ≥ baseline
- Zero critical errors

### Phase 3 Success ✅
- Additional cost reduction: ≥ 10%
- Intent accuracy: ≥ 95%
- Quality maintained: All metrics ≥ baseline

### Overall Success ✅
- **Total cost reduction:** ≥ 35% vs current
- **Quality maintained:** All metrics ≥ baseline
- **Zero degradation:** Customer satisfaction maintained
- **Scalability:** System handles increased load

---

## Conclusion

**Recommended Approach:**
1. ✅ Migrate low-risk stages immediately (Phase 1)
2. ✅ Test medium-risk stages carefully (Phase 2)
3. ✅ Keep Stage 4 on gpt-4o-mini (critical quality)
4. ✅ Consider conditional model selection for Stage 4

**Expected Results:**
- **35-50% cost reduction** vs current multi-stage system
- **85-90% cost reduction** vs original single-stage system
- **Maintained or improved quality**
- **Faster response times**

**Timeline:** 4-5 weeks for full implementation  
**Risk:** Low-Medium (with proper testing and fallbacks)

---

**Document Created:** December 7, 2025  
**Next Review:** After Phase 1 completion
