window.CL_DATA.modules.push({
  id: 'm01', ph: 1, icon: '💳', status: 'planned',
  title: 'Payment Integration',
  desc: 'Razorpay primary (India) + Stripe (intl) — link generation, webhook reconciliation, refunds',
  tags: ['payments', 'razorpay', 'stripe', 'webhooks'],
  deps: [],

  overview: '`paymentLinkService.ts` is currently a stub (`generatePaymentLink`, `getStatus`, `webhook` all throw "Not implemented" — 7 TODOs in `routes/payments.ts` + service). Wires Razorpay (primary for INR) and Stripe (intl) end-to-end: AI generates per-order link from inside the conversation, customer pays, gateway webhook marks order paid, vendor sees update in dashboard. Includes refund flow on top of existing `refundService.ts`. Blocks real-money vendor onboarding until shipped.',
});
