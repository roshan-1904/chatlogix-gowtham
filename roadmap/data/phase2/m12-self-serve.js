window.CL_DATA.modules.push({
  id: 'm12', ph: 2, icon: '✨', status: 'planned',
  title: 'Self-Serve Vendor Signup',
  desc: 'Meta embedded signup · WABA registration · trial credits · catalog import flow · live <15 min',
  tags: ['onboarding', 'self-serve', 'signup', 'growth'],
  deps: ['m07'],

  overview: 'Today vendor onboarding is admin-mediated. This unlocks scale: vendor signs up → connects their WhatsApp Business number via Meta embedded signup (or BSP fallback) → bulk-imports starter catalog using the existing smart catalog engine (photos / CSV / template) → gets trial credits → live conversation walkthrough so they see the AI work before paying. Target: usable bot in under 15 minutes from cold start. Includes recaptcha (already wired), email verification, and WABA template auto-submission.',
});
