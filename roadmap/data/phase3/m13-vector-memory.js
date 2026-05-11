window.CL_DATA.modules.push({
  id: 'm13', ph: 3, icon: '🧬', status: 'planned',
  title: 'Vector Memory & Semantic Recall',
  desc: 'pgvector on Supabase · top-K retrieval over ConversationMemory + product catalog',
  tags: ['ai', 'vector', 'pgvector', 'embeddings', 'memory'],
  deps: [],

  overview: 'Today `ConversationMemory` is structured/keyword. Upgrades to embedding-based recall via pgvector on Supabase: semantic search over past conversations ("the spicy one she ordered last month"), smarter product matching that handles natural-language descriptions, customer-attribute clustering for cohort marketing. Reduces prompt size by retrieving only top-K relevant memory chunks — directly lowers AI cost on long-running customer relationships and improves response quality on returning customers.',
});
