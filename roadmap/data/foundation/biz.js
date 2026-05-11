window.CL_DATA.modules.push({
  id: 'biz', ph: 0, icon: '💼', status: 'planned',
  title: 'Business Model & Credit Pricing',
  desc: 'Per-message credits · wallet · target <$0.0022/AI msg · SMB e-commerce ICP in India',
  tags: ['business', 'pricing', 'credits', 'unit-economics'],
  deps: [],

  overview: 'Vendors pay per WhatsApp message processed. Locked pricing: text 1, audio 5, image 3, document 4, video 10, location 2, sticker 1, contact 1, interactive 2, reaction 0.5 credits. Credits deducted on response send (`billingService.deductCredits`), wallet checked pre-send (fail-closed). Target unit cost <$0.0022 per AI message — achieved via gpt-4o-mini default, unified processor, and TOON encoding. ICP: SMB e-commerce sellers in India already running their shops over WhatsApp. Path: free trial credits → recurring credit packs → per-vendor billing history.',
});
