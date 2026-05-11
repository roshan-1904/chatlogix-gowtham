window.CL_DATA.modules.push({
  id: 'm10', ph: 2, icon: '📈', status: 'planned',
  title: 'Vendor Analytics & Quality Reports',
  desc: 'Sales trends · AI quality scores · conversation funnel · credit burn · per-WhatsApp-number breakdown',
  tags: ['analytics', 'dashboard', 'quality', 'metrics'],
  deps: ['m09'],

  overview: 'Existing `dashboardStatsService.ts` covers basic KPIs. Expands to the full vendor analytics suite: orders/day, revenue, AOV, top products, conversation-to-order conversion, AI quality score from `QualityMetrics` (naturalness, completeness, continuity), credit burn rate vs revenue, per-WhatsApp-number breakdown for vendors with multiple lines. Date-range selectors, CSV export, and quality drill-down to the specific stage that misfired (using `StageExecutionLog`).',
});
