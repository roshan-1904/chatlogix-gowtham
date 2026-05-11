window.CL_DATA.modules.push({
  id: 'pipeline', ph: 0, icon: '🧪', status: 'planned',
  title: '14-Stage AI Pipeline + Unified Processor',
  desc: '17 intents · 4 languages (en/hi/ta/te) · stage fallbacks · TOON catalog encoding · target <$0.0022/msg',
  tags: ['ai', 'pipeline', 'orchestration', 'multilingual', 'cost'],
  deps: [],

  overview: 'The core IP. Orchestrator runs 14 fractional stages (0, 0.5, 1, 1.5, 1.7, 2, 3, 4, 4.5, 4.7, 6, 7, 8, 8.5) covering normalization, intent classification (17 intents), correction detection, context fetch, primary response, proactive assist, refinement, composition, and quality scoring. Every stage has a safe fallback. The unified processor (`unifiedAIProcessorService.ts`) collapses stages 0/1/1.5/1.7/3/4/6 into one structured-output call to cut latency 30–40s → 8–12s. TOON table encoding for product catalogs saves ~40% tokens vs JSON. Languages auto-detected via Unicode ranges; replies match the customer\'s primary script.',
});
