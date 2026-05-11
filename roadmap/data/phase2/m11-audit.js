window.CL_DATA.modules.push({
  id: 'm11', ph: 2, icon: '📜', status: 'planned',
  title: 'Audit Logs & DPDP Compliance',
  desc: 'Unify per-domain audit trails · WORM storage · customer data export & erasure flows',
  tags: ['audit', 'compliance', 'dpdp', 'logging'],
  deps: ['m07'],

  overview: '`OrderAuditLog`, `StageExecutionLog`, and catalog-import audit already log per-domain. Unifies them into a single audit trail spanning credit adjustments, vendor settings changes, AI overrides, customer data deletion. Adds a DPDP Act–aligned customer data export endpoint (right-to-access) and erasure flow that respects existing soft-delete semantics. Logs flow to S3 with Object Lock (WORM) for tamper-evident compliance evidence.',
});
