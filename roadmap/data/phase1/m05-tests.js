window.CL_DATA.modules.push({
  id: 'm05', ph: 1, icon: '🧪', status: 'planned',
  title: 'Test Coverage & Reliability',
  desc: 'Vitest suites for workers + multi-stage orchestrator · idempotency · webhook replay · SQS retry',
  tags: ['testing', 'reliability', 'vitest', 'workers'],
  deps: [],

  overview: 'Today: 22 vitest files concentrated in catalog/normalization/idempotency. The highest-risk surface — workers (incoming, multi-stage AI, response, media, order-recovery) and the multi-stage orchestrator itself — has no dedicated tests. Backfills coverage with golden-path + edge-case integration tests using fixtures of real conversation transcripts in all 4 supported languages. Hardens idempotency for SQS at-least-once delivery, webhook replay, and partial-stage failures.',
});
