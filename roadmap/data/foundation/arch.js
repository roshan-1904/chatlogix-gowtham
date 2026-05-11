window.CL_DATA.modules.push({
  id: 'arch', ph: 0, icon: '🗺️', status: 'planned',
  title: 'Architecture & Infrastructure',
  desc: 'Multi-tenant Node/TS · SQS workers · Prisma + Postgres · Redis · OpenAI · WhatsApp Business API',
  tags: ['architecture', 'infrastructure', 'multi-tenant', 'sqs', 'prisma'],
  deps: [],

  overview: 'The locked technical blueprint. Multi-tenant by vendorId scoping. Inbound WhatsApp webhook → AWS SQS (LocalStack in dev) → 5 PM2-managed workers (incoming, multi-stage AI, response, media, order-recovery). Postgres via Prisma (24 models), Redis (ioredis) for cache + rate-limit, S3 for media + catalog imports, OpenAI for LLM. Three Lambda handlers (webhookHandler, multiStageProcessor, responseProcessor) deployable to AWS or run as PM2 workers.',
});
