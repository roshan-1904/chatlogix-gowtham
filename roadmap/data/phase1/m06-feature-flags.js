window.CL_DATA.modules.push({
  id: 'm06', ph: 1, icon: '🚩', status: 'planned',
  title: 'Feature Flags & A/B Testing',
  desc: 'Per-vendor flag overrides (3 TODOs) · real prompt-version A/B · experiment tracking',
  tags: ['feature-flags', 'ab-testing', 'experiments', 'optimization'],
  deps: [],

  overview: 'Global flags (`structured-responses`, `customer-insights`, `event-processing`) work, but per-vendor DB overrides are open TODOs in `featureFlags.ts`. `getAIPromptVersion()` is hard-coded to "v1" — no real experimentation. Builds proper per-vendor JSON overrides with the existing 30s in-memory cache, an experiment table that assigns conversations to variants, and quality/cost deltas pulled from `QualityMetrics` + `CreditUsage`. Foundation for ongoing cost optimization toward the <$0.0022/msg target.',
});
