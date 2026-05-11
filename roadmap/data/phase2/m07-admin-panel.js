window.CL_DATA.modules.push({
  id: 'm07', ph: 2, icon: '👑', status: 'planned',
  title: 'Admin Panel Build-out',
  desc: 'web-admin is scaffold only · build vendor mgmt, billing oversight, queue health, fraud review',
  tags: ['admin', 'platform', 'web-admin', 'dashboard'],
  deps: [],

  overview: '`frontend_v2/apps/web-admin` currently has only Login + a stub Dashboard. Builds the SUPER_ADMIN surface: vendor list with credit balance + message volume + AI cost, suspend/reactivate, manual credit adjustments tied to `WalletTransaction`, billing history per vendor, system queue health (SQS depths, worker error counts, stage failure rates from `StageExecutionLog`), conversation spot-checks for quality review, per-vendor feature flag toggles (depends on m06).',
});
