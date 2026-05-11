window.CL_DATA.modules.push({
  id: 'm15', ph: 3, icon: '🔌', status: 'planned',
  title: 'Public Vendor API & Webhooks',
  desc: 'REST API for catalog upsert, order pull, customer sync · OpenAPI spec · API keys per tier',
  tags: ['api', 'integrations', 'public-api', 'webhooks'],
  deps: [],

  overview: 'Larger vendors run their own e-commerce backends (Shopify, WooCommerce, custom ERP) and need ChatLogix to be a channel, not the source of truth. Versioned REST API with API-key auth: catalog upsert, order webhook on status change, customer profile sync, conversation export. Tiered rate limits, OpenAPI spec, Postman collection, and lightweight client libraries for Node + PHP. Unlocks the "I already have an inventory system" segment.',
});
