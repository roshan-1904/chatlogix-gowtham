window.CL_DATA.modules.push({
  id: 'catalog', ph: 0, icon: '📚', status: 'planned',
  title: 'Smart Catalog Engine',
  desc: 'Six domain extractors · sandbox · audit · fast-path · rate-limited · CSV/Excel/photo intake',
  tags: ['catalog', 'import', 'ai', 'extraction'],
  deps: [],

  overview: 'A multi-month subsystem that lets vendors import their entire product list from messy real-world sources (photos, screenshots, CSVs, Excel, vendor templates). Six domain-specific extractors (bakery, restaurant, garment, electronics, grocery, generic), normalization + dedup, AI enrichment for missing fields, sandbox dry-run (no commits), atomic commit with rollback, full audit trail with diffs. Rate-limited per vendor (1/hr full analyze, 20/hr fast-path, daily ₹ cap). The vendor-experience differentiator that turns "I have 500 products in WhatsApp screenshots" into a working catalog in minutes.',
});
