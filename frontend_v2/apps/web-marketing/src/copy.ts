export const homeMeta = {
  title: 'Stop typing WhatsApp replies | ChatLogix',
  description:
    'ChatLogix answers product questions, quotes from your catalog, and turns chats into orders on WhatsApp — 24/7. Try with ₹50 free trial balance. No card needed.',
};

/** Shared by hero.trustWhatsApp and the pricing included list. TODO(owner B6): confirm. */
export const shopNumberClaim = 'Customers use the same shop number as before';

export const hero = {
  eyebrow: 'Turn WhatsApp chats into sales',
  headlineLine1: 'Still typing the same WhatsApp replies?',
  headlineLine2: 'Let AI take the chats — and the orders.',
  subtext:
    'ChatLogix answers customer questions, helps them find the right products, and guides them through the order — right on WhatsApp.',
  bullets: [
    {
      id: 'instant' as const,
      title: 'Answer Instantly',
      body: 'Handle common questions automatically.',
    },
    {
      id: 'orders' as const,
      title: 'Turn Chats Into Orders',
      body: 'Guide customers from question to purchase.',
    },
    {
      id: 'time' as const,
      title: 'Save Time, Grow Your Business',
      body: 'Focus on your business, not repetitive replies.',
    },
  ],
  trustChip:
    'Try with your own products · ₹50 free trial balance · No card required',
  trustWhatsApp: `${shopNumberClaim}. ChatLogix replies through it after you connect.`,
  primaryCta: 'Try Free',
  secondaryCta: 'See how it works',
  previewLabel: 'Your inbox now vs With ChatLogix',
  previewTabs: {
    before: 'Your day now',
    after: 'With ChatLogix',
  },
  previewAnnotations: {
    before: {
      line1: 'Too many queries,',
      line2: 'all waiting for you…',
    },
    after: {
      line1: 'Instant replies.',
      line2: 'More order conversion.',
    },
  },
};

export const heroPreviewBefore = {
  unreadTotal: '99+',
  chats: [
    { id: 'priya', name: '98765 xxxxx', preview: 'Hello? Need this for tonight', time: '9:48', unread: 4 },
    { id: 'rahul', name: '91234 xxxxx', preview: 'Is the shampoo sulphate free?', time: '9:22', unread: 2 },
    { id: 'c3', name: '87654 xxxxx', preview: 'Delivery today possible?', time: '8:55', unread: 22 },
    { id: 'c4', name: '99887 xxxxx', preview: 'Price for 3 soaps?', time: '8:41', unread: 7 },
    { id: 'c5', name: '95432 xxxxx', preview: 'Hello? Anyone there?', time: '8:12', unread: 31 },
    { id: 'c6', name: '88776 xxxxx', preview: '0:12', time: '8:08', unread: 18, isVoice: true },
    { id: 'c7', name: '90123 xxxxx', preview: 'Bulk for my salon — 20 pcs?', time: '7:54', unread: 5 },
    { id: 'c8', name: '96543 xxxxx', preview: '100ml or 200ml?', time: '7:41', unread: 11 },
    { id: 'c9', name: '88221 xxxxx', preview: 'COD available in 560001?', time: '7:28', unread: 8 },
    { id: 'c10', name: '93456 xxxxx', preview: 'Need by tomorrow morning', time: '7:15', unread: 15 },
    { id: 'c11', name: '97890 xxxxx', preview: '0:06', time: '7:02', unread: 6, isVoice: true },
    { id: 'c12', name: '94567 xxxxx', preview: 'Any discount on 5 soaps?', time: '6:48', unread: 12 },
  ],
  threads: {
    priya: {
      name: '98765 xxxxx',
      messages: [
        { type: 'text' as const, from: 'customer' as const, text: 'Hi, is the coconut hair oil available in 200ml?', time: '8:12 am' },
        { type: 'text' as const, from: 'customer' as const, text: 'What’s the price for 2 bottles?', time: '8:34 am' },
        { type: 'voice' as const, from: 'customer' as const, duration: '0:06', time: '9:05 am' },
        { type: 'text' as const, from: 'customer' as const, text: 'Hello? Need this for tonight', time: '9:48 am' },
      ],
      manualReply: 'Yes 200ml is available, ₹349 each',
    },
    rahul: {
      name: '91234 xxxxx',
      messages: [
        { type: 'voice' as const, from: 'customer' as const, duration: '0:08', time: '8:28 am' },
        { type: 'text' as const, from: 'customer' as const, text: 'Is the shampoo sulphate free?', time: '9:22 am' },
      ],
      manualReply: 'Yes, it is sulphate free',
    },
  },
  typingCharsPerTick: 1,
  lateApology: 'Sorry for the late response!',
  followUpMessage: 'Also need delivery by 6 pm!',
  vendorReplyTimes: {
    apology: '8:46 pm',
    answer: '8:47 pm',
    followUp: '8:47 pm',
  },
  backlogScroll: {
    count: '99+',
    headline: 'messages still waiting',
    body: 'You replied to one customer. Dozens more are still waiting in your inbox.',
    ctaHint: 'See With ChatLogix next →',
  },
  statPopup: {
    headline: '99+ still waiting',
    body: 'You answered one. The rest are still unread.',
  },
  timing: {
    listHoldMs: 3000,
    slideMs: 550,
    messageGapMs: 1100,
    voiceExtraMs: 500,
    beforeTypingMs: 900,
    typingMsPerChar: 115,
    afterSentHoldMs: 1600,
    followUpDelayMs: 1200,
    backlogScrollHoldMs: 3200,
    backToListHoldMs: 2200,
  },
};

export const heroPreviewAfter = {
  replyBadge: 'ChatLogix · Live',
  statPopup: {
    headline: 'All chats handled',
    body: 'Every chat replied. More orders coming in.',
  },
  parallelBanner: {
    waiting: 'Waiting for customers…',
    handling: (typing: number) =>
      typing === 1 ? 'ChatLogix replying to 1 chat…' : `ChatLogix replying to ${typing} chats…`,
    done: (customers: number, orders: number) =>
      `All ${customers} customers got a response · ${orders} orders placed`,
  },
  chats: [
    { id: 'priya', name: 'Priya K.', time: '10:22' },
    { id: 'rahul', name: 'Rahul M.', time: '10:21' },
    { id: 'ananya', name: 'Ananya S.', time: '10:19' },
    { id: 'vikram', name: 'Vikram D.', time: '10:18' },
    { id: 'meera', name: 'Meera R.', time: '10:17' },
    { id: 'karan', name: 'Karan S.', time: '10:16' },
    { id: 'divya', name: 'Divya N.', time: '10:15' },
    { id: 'arjun', name: 'Arjun P.', time: '10:14' },
  ],
  simScript: [
    { atMs: 400, action: 'appear', chatId: 'rahul', preview: '0:08', time: '10:21', unread: 1, isVoice: true },
    { atMs: 1000, action: 'appear', chatId: 'priya', preview: 'Hair oil 200ml — need 2', time: '10:22', unread: 1 },
    { atMs: 1400, action: 'appear', chatId: 'meera', preview: 'Hello? Anyone there?', time: '10:17', unread: 1 },
    { atMs: 3200, action: 'reply', chatId: 'rahul', preview: 'Sulphate free, ₹449 for 250ml. Delivery tomorrow.' },
    { atMs: 2100, action: 'appear', chatId: 'karan', preview: 'Aloe face cream in stock?', time: '10:16', unread: 1 },
    { atMs: 2400, action: 'appear', chatId: 'vikram', preview: 'Price for 3 soaps?', time: '10:18', unread: 1 },
    { atMs: 3800, action: 'reply', chatId: 'priya', preview: 'Yes! Coconut Hair Oil 200ml — ₹349. Add to order?' },
    { atMs: 2900, action: 'appear', chatId: 'ananya', preview: 'Need the neem soap today?', time: '10:19', unread: 1 },
    { atMs: 4200, action: 'reply', chatId: 'meera', preview: 'Hi! Yes, we’re here. What are you looking for?' },
    { atMs: 3400, action: 'appear', chatId: 'divya', preview: '0:05', time: '10:15', unread: 1, isVoice: true },
    { atMs: 3700, action: 'appear', chatId: 'arjun', preview: 'Bulk for my salon — 20 pcs', time: '10:14', unread: 1 },
    { atMs: 5100, action: 'reply', chatId: 'karan', preview: 'Aloe Face Cream 50g in stock — ₹299.' },
    { atMs: 5300, action: 'reply', chatId: 'vikram', preview: '3 neem soaps — ₹267 with 10% bundle off.' },
    { atMs: 4200, action: 'customer', chatId: 'rahul', preview: 'Can I pay on delivery?', unread: 1 },
    { atMs: 5700, action: 'reply', chatId: 'ananya', preview: 'Handmade batches go out Tuesdays — earliest is Tuesday.' },
    { atMs: 6200, action: 'reply', chatId: 'divya', preview: 'Got your voice note — hair oil 100ml ₹249, 200ml ₹349.' },
    { atMs: 6500, action: 'reply', chatId: 'arjun', preview: '20 × Rosemary Shampoo — ₹8,531 with 5% off. Confirm?' },
    { atMs: 6800, action: 'reply', chatId: 'rahul', preview: 'Yes, COD available in your pin code.' },
    { atMs: 5000, action: 'customer', chatId: 'priya', preview: 'Yes, add 2 please', unread: 1 },
    { atMs: 5300, action: 'customer', chatId: 'vikram', preview: 'Book it for me', unread: 1 },
    { atMs: 5400, action: 'customer', chatId: 'meera', preview: 'Need 1 rosemary shampoo', unread: 1 },
    { atMs: 7800, action: 'reply', chatId: 'priya', preview: 'Done — 2× Coconut Hair Oil (200ml), ₹698.', countsAsOrder: true },
    { atMs: 8000, action: 'reply', chatId: 'vikram', preview: 'Order noted! Share delivery address.', countsAsOrder: true },
    { atMs: 8100, action: 'reply', chatId: 'meera', preview: 'Rosemary Shampoo 250ml — ₹449. Adding to your order?' },
    { atMs: 6200, action: 'customer', chatId: 'karan', preview: 'Add 1 face cream', unread: 1 },
    { atMs: 6300, action: 'customer', chatId: 'ananya', preview: 'Perfect, sending address', unread: 1 },
    { atMs: 6600, action: 'customer', chatId: 'divya', preview: '200ml please', unread: 1 },
    { atMs: 8600, action: 'reply', chatId: 'karan', preview: 'Added 1× Aloe Face Cream (50g) — ₹299.', countsAsOrder: true },
    { atMs: 8700, action: 'reply', chatId: 'ananya', preview: 'Tuesday dispatch noted — share address when ready.' },
    { atMs: 7000, action: 'customer', chatId: 'arjun', preview: 'Confirm bulk order', unread: 1 },
    { atMs: 9000, action: 'reply', chatId: 'divya', preview: '200ml noted — ₹349. Ready to checkout?', countsAsOrder: true },
    { atMs: 9200, action: 'reply', chatId: 'arjun', preview: 'Bulk order confirmed — invoice on the way.', countsAsOrder: true },
  ],
  timing: {
    typingDelayAfterMessageMs: 2000,
    loopHoldMs: 4000,
    loopGapMs: 1000,
  },
};

export const problem = {
  eyebrow: 'The reality today',
  headlineLine1: 'WhatsApp is full of buyers.',
  headlineLine2: 'You are still typing one chat at a time.',
  intro:
    'Price, size, stock, delivery — the same questions every day. New messages keep coming while you are busy with the next order. And important order details can get buried in the chat.',
  calloutLine1: 'That’s every',
  calloutLine2: 'busy day.',
  items: [
    {
      id: 'repeat' as const,
      tone: 'rose' as const,
      title: 'The same questions, all day',
      body: 'Price for 200ml? In stock? Delivery today? You already know the answer. You still type it again.',
      tags: ['200ml?', 'Price?', 'Delivery?', 'Stock?'] as const,
      chat: {
        name: '+91 98765 43210',
        messages: [
          { from: 'customer' as const, text: 'Hi, do you have this in 200ml?' },
          { from: 'shop' as const, text: 'Yes, available!' },
          { from: 'customer' as const, text: 'How much is it?' },
          { from: 'customer' as const, text: 'Do you deliver today?' },
          { from: 'customer' as const, text: 'Can I get 2 bottles?' },
        ],
      },
    },
    {
      id: 'missed' as const,
      tone: 'amber' as const,
      title: 'Unread chats do not wait',
      body: 'New inquiries keep coming. While you answer one customer, another one is already waiting.',
      tags: [
        'New inquiries keep coming',
        '99+ unread chats',
        'Hard to track',
        'Important customers get missed',
      ] as const,
      chats: [
        { name: '98765 43210', preview: 'Hello? Need this today?', time: '9:48', unread: '4' },
        { name: '91234 56789', preview: 'Price for 3 soaps?', time: '9:22', unread: '12' },
        { name: '87654 32109', preview: 'Delivery possible?', time: '8:55', unread: '7' },
        { name: '99887 66554', preview: 'Is the 200ml in stock?', time: '8:30', unread: '5' },
      ],
    },
    {
      id: 'lost' as const,
      tone: 'blue' as const,
      title: 'The order is in the chat — somewhere',
      body: '2 bottles, 200ml, the pin code, “so total is…?” — split across messages. Easy to miss. Hard to pack.',
      note: 'Order details spread across multiple messages',
      fragments: [
        'Address here…',
        'Product there…',
        'Quantity somewhere…',
        'Total in another message…',
      ] as const,
      chat: {
        name: '+91 98765 43210',
        messages: [
          { text: 'Need 2 × hair oil 200ml' },
          { text: 'MG Road, pin 560001' },
          { text: 'So total is…?' },
        ],
      },
    },
  ],
};

export const solution = {
  eyebrow: 'With ChatLogix',
  headlineBefore: 'Reply from your catalog ',
  headlineHighlight: 'in seconds',
  headlineAfter: ' — while you run the shop.',
  body: 'ChatLogix understands all of your products — ready-made or custom. It answers customer questions from your catalog, remembers the conversation, and helps customers move toward an order — automatically, on WhatsApp.',
  bullets: [
    {
      id: 'catalog' as const,
      title: 'Instant answers from your catalog',
      body: 'Product info, price, stock, size — straight from your product list.',
    },
    {
      id: 'memory' as const,
      title: 'Remembers the conversation',
      body: 'Understands follow-ups so customers don’t repeat themselves.',
    },
    {
      id: 'orders' as const,
      title: 'Helps turn chats into orders',
      body: 'Guides customers with quantities, address and confirmation.',
    },
  ],
  trustLine: 'AI assists. Your business rules stay in control.',
  trustSubline: 'All responses are based on your products and settings.',
  callouts: {
    instantLine1: 'Instant product',
    instantLine2: 'answers',
    ordersLine1: 'Helps turn chats',
    ordersLine2: 'into orders',
    stockLine1: 'Real-time',
    stockLine2: 'stock & pricing',
    resultLine1: 'Happy customers.',
    resultLine2: 'More orders.',
  },
};

export const solutionDemo = {
  tabs: {
    readyMade: 'Ready-made',
    custom: 'Custom order',
  },
  readyMade: {
    shopName: 'Glow Naturals',
    subtitle: 'Online',
    avatar: 'G',
    messages: [
      {
        from: 'customer' as const,
        time: '10:21 AM',
        text: 'Hi, is the coconut hair oil available in 200ml?',
      },
      {
        from: 'shop' as const,
        time: '10:21 AM',
        text: 'Yes! Coconut Hair Oil 200ml is available for ₹349. Would you like me to add it to your order?',
      },
      {
        from: 'customer' as const,
        time: '10:22 AM',
        text: 'Great! Add 2 bottles. Also, can you deliver to MG Road today?',
      },
      {
        from: 'shop' as const,
        time: '10:22 AM',
        lines: [
          { text: 'Sure! ✅' },
          { text: '2 × Coconut Hair Oil (200ml)', bold: true },
          { text: 'Delivery to MG Road today.' },
          { text: 'Shall I confirm the order?' },
        ],
      },
    ],
  },
  custom: {
    shopName: 'Sweet Crumb',
    subtitle: 'Online',
    avatar: 'S',
    messages: [
      {
        from: 'customer' as const,
        time: '10:21 AM',
        text: '1 kg chocolate cake for 25 Sep, please.',
      },
      {
        from: 'shop' as const,
        time: '10:21 AM',
        text: '₹850. What should we write on it?',
      },
      {
        from: 'customer' as const,
        time: '10:22 AM',
        text: 'Happy Birthday Aanya',
      },
      {
        from: 'shop' as const,
        time: '10:22 AM',
        text: 'Noted. Cakes need 1 day advance notice.',
      },
    ],
  },
};

export type SolutionDemoThread = (typeof solutionDemo)['readyMade'] | (typeof solutionDemo)['custom'];
export type SolutionDemoTab = keyof typeof solutionDemo.tabs;

export const howItWorks = {
  eyebrow: 'How ChatLogix works',
  headlineBefore: 'You stay in control. ',
  headlineHighlight: 'ChatLogix handles the conversations.',
  body: 'You provide your catalog and business rules, review everything, and go live. ChatLogix understands all of your products, then handles 20 chats a day or 2,000 on WhatsApp — while you manage products, orders, payments, shipping and conversations from one dashboard.',
  steps: [
    {
      id: 'catalog' as const,
      title: 'Add your catalog',
      body: 'Upload product data. ChatLogix extracts product names, prices, variants and relevant details.',
    },
    {
      id: 'chatting' as const,
      title: 'Customers start chatting',
      body: 'Customers ask naturally on WhatsApp. ChatLogix understands questions using your approved catalog and business settings.',
    },
    {
      id: 'ai' as const,
      title: 'AI handles the work',
      body: 'Handles many conversations simultaneously, answers product questions carefully, helps with quantities, orders, payments and shipping.',
    },
    {
      id: 'control' as const,
      title: 'You control everything',
      body: 'See conversations and orders in one dashboard. Track progress and take over any conversation whenever needed.',
    },
  ],
  catalogCard: {
    title: 'Upload your catalog',
    badge: 'Extracted',
    products: [
      { name: 'Coconut Hair Oil', price: '200ml · ₹349', swatch: '#c9a227' },
      { name: 'Rosemary Shampoo', price: '250ml · ₹449', swatch: '#4f7942' },
      { name: 'Aloe Face Cream', price: '50g · ₹299', swatch: '#e3ded0' },
    ],
  },
  chatCard: {
    name: 'Ananya S.',
    subtitle: 'Online',
    customer: 'Diwali hamper — 3 soaps + hair oil, gift wrapped?',
    shop: 'Yes — ₹649 with gift wrap. Handmade batches dispatch Tuesday.',
  },
  inboxCard: {
    title: 'Live conversations',
    chats: [
      { name: 'Priya K.', preview: 'Hair oil 200ml — need 2', time: '10:22', unread: 2 },
      { name: 'Ananya S.', preview: 'Diwali hamper — 3 soaps + oil', time: '10:19', unread: 1 },
      { name: 'Karan S.', preview: 'Aloe face cream in stock?', time: '10:16', unread: 3 },
      { name: 'Sneha T.', preview: 'Delivery to MG Road today?', time: '10:14', unread: 1 },
    ],
  },
  dashboardCard: {
    nav: ['Dashboard', 'Conversations', 'Orders', 'Products'],
    active: 'Orders',
    heading: 'Orders',
    rows: [
      { id: 'GN-1042', product: 'Coconut Hair Oil', amount: '₹698', status: 'Confirmed' },
      { id: 'GN-1043', product: 'Diwali Gift Hamper', amount: '₹649', status: 'Packing' },
      { id: 'GN-1040', product: 'Rosemary Shampoo', amount: '₹449', status: 'Shipped' },
      { id: 'GN-1039', product: 'Aloe Face Cream', amount: '₹299', status: 'Delivered' },
    ],
  },
  trustLine: 'AI assists. Your business stays in control.',
  trustSubline:
    'ChatLogix responds from your approved product and business information — designed to avoid hallucinated product details and false promises.',
  highlights: [
    {
      id: 'scale' as const,
      title: '20 chats a day or 2,000',
      body: 'Handle more customers without hiring more people.',
    },
    {
      id: 'ops' as const,
      title: 'Orders, payments & shipping in one place',
      body: 'From chat to confirmed order, everything in your dashboard.',
    },
    {
      id: 'takeover' as const,
      title: 'Take control whenever you need',
      body: 'View, edit or take over any conversation — you’re always in control.',
    },
  ],
};

export const customerExperience = {
  eyebrow: 'Natural conversations',
  headlineBefore: 'Customers talk to you in their own way.',
  headlineHighlight: 'ChatLogix understands everything.',
  body: 'Text, voice notes, or messages in their preferred language — ChatLogix understands what they mean and responds in seconds. No forms. No button menus.',
  exampleLabel: 'Example WhatsApp conversation',
  shopName: 'Glow Naturals',
  shopSubtitle: 'online',
  benefits: [
    {
      id: 'language' as const,
      title: 'Any language, any way',
      body: 'Text, voice notes and conversations in English, Tamil, Kannada, Telugu, Malayalam and more.',
    },
    {
      id: 'instant' as const,
      title: 'Instant replies, 24/7',
      body: 'Your AI assistant never gets tired. Customers get answers day or night.',
    },
    {
      id: 'scale' as const,
      title: '20 chats a day or 2,000',
      body: 'Handle 20 chats a day or 2,000 without making customers wait for a manual reply.',
    },
    {
      id: 'reliable' as const,
      title: 'Reliable answers',
      body: 'Responses are grounded in your approved catalog and business information.',
    },
  ],
  trustLine: 'Your customers talk naturally. ChatLogix responds from your approved business information.',
  trustSubline: 'Product details and business rules remain under your control.',
  vendorTranslationLine: "Don't worry — you'll see an English translation in your conversation window.",
  vendorTranslationSubline:
    'Follow every chat in English, even when customers write in Tanglish, Hinglish, Telugu, Malayalam, or Kannada.',
  messages: [
    {
      role: 'customer' as const,
      lang: 'Tanglish',
      text: 'Hi, coconut hair oil irukka?',
      time: '10:24 am',
    },
    {
      role: 'assistant' as const,
      lang: 'Tanglish',
      text: 'Irukku! 100ml ₹249, 200ml ₹349 rendum stock la irukku. Options paaka venuma?',
      time: '10:24 am',
    },
    {
      role: 'customer' as const,
      lang: 'Hinglish',
      text: '200ml wala chahiye bhai.',
      time: '10:25 am',
    },
    {
      role: 'assistant' as const,
      lang: 'Hinglish',
      text: 'Great choice! Coconut Hair Oil 200ml ₹349 hai, cold-pressed. Order mein add karu?',
      time: '10:25 am',
    },
    {
      role: 'customer' as const,
      lang: 'Telugu',
      text: 'Add cheyyandi. Repu delivery avutunda?',
      time: '10:26 am',
    },
    {
      role: 'assistant' as const,
      lang: 'Telugu',
      text: 'Avunu, add chesaanu. Repu delivery chestamu. Address cheppandi.',
      time: '10:26 am',
    },
    {
      role: 'customer' as const,
      lang: 'Malayalam',
      text: 'നാളെ MG Road-ലേക്ക് deliver ചെയ്യാമോ?',
      time: '10:27 am',
    },
    {
      role: 'assistant' as const,
      lang: 'Malayalam',
      text: 'അതെ, നാളെ MG Road-ലേക്ക് deliver ചെയ്യാം. Confirm ചെയ്യട്ടെ?',
      time: '10:27 am',
    },
    {
      role: 'customer' as const,
      lang: 'Kannada',
      text: 'ಹೌದು, confirm ಮಾಡಿ.',
      time: '10:28 am',
    },
    {
      role: 'assistant' as const,
      lang: 'Kannada',
      text: 'ಸರಿ! Order confirm ಆಗಿದೆ. ನಾಳೆ MG Road ಗೆ hair oil deliver ಮಾಡುತ್ತೇವೆ.',
      time: '10:28 am',
    },
  ],
  languages: [
    { id: 'tanglish' as const, label: 'Tanglish' },
    { id: 'hinglish' as const, label: 'Hinglish' },
    { id: 'telugu' as const, label: 'Telugu' },
    { id: 'malayalam' as const, label: 'Malayalam' },
    { id: 'kannada' as const, label: 'Kannada' },
  ],
  stats: [
    { id: 'always' as const, value: '24/7', body: 'Always on for your customers.' },
    { id: 'volume' as const, value: '20–2,000', body: 'Chats a day — you set the pace.' },
    { id: 'speed' as const, value: 'Instant', body: 'Replies in seconds.' },
  ],
};

export const trust = {
  eyebrow: 'Built for trust',
  headlineBefore: 'Every reply is carefully checked.',
  headlineHighlight: 'So you can reply with confidence.',
  body: 'We collect every available information from your catalog and business data, analyse it in depth, validate the response twice, and only then reply to your customer. Nothing is made up. Every conversation and response is stored for your visibility.',
  steps: [
    {
      id: 'collect' as const,
      number: '01',
      title: 'Collect & Understand',
      body: 'We gather every relevant information from your catalog and business data.',
      note: 'We look at everything relevant,\nnot just a single match.',
    },
    {
      id: 'analyse' as const,
      number: '02',
      title: 'Analyse Deeply',
      body: 'Our AI understands the intent, compares multiple pieces of information and finds the best answer based on your rules.',
      note: 'We analyse deeper to give\nthe right answer.',
    },
    {
      id: 'validate' as const,
      number: '03',
      title: 'Validate Twice',
      body: 'Every response is validated in two steps to ensure accuracy, consistency and compliance with your rules.',
      note: null,
    },
    {
      id: 'reply' as const,
      number: '04',
      title: 'Reply & Store',
      body: 'Only after both validations, we reply to your customer in their language and store the conversation for your visibility.',
      note: 'Accurate, helpful replies\nfrom your data.',
    },
  ],
  collectItems: [
    { id: 'catalog' as const, label: 'Product catalog' },
    { id: 'pricing' as const, label: 'Pricing, stock & offers' },
    { id: 'delivery' as const, label: 'Delivery & service rules' },
    { id: 'policies' as const, label: 'Policies (returns, etc.)' },
  ],
  analyseItems: [
    { id: 'match' as const, label: 'Matches products' },
    { id: 'availability' as const, label: 'Checks availability' },
    { id: 'rules' as const, label: 'Applies business rules' },
    { id: 'delivery' as const, label: 'Considers delivery & offers' },
  ],
  checks: [
    { title: 'Validation 1', body: 'Checks against your catalog and business rules.' },
    { title: 'Validation 2', body: 'Re-checks for accuracy, compliance and safe response.' },
  ],
  validateFooter: 'No invented product details, prices, stock or promises.',
  replyChat: {
    customer: 'Will this oil stop hair fall?',
    customerTime: '10:21 AM',
    assistant:
      'I can’t promise that — it isn’t claimed in our product details. What we list: Coconut Hair Oil, cold-pressed, 200ml, ₹349. I’ve passed your question to the owner.',
    assistantTime: '10:22 AM',
  },
  storeLine: 'Conversation and response are stored in your dashboard for your reference.',
  dontKnowPaths: [
    {
      id: 'queries' as const,
      title: 'Queries',
      body: 'Unknown facts go to the owner. The chat stays open. Nothing is invented.',
    },
    {
      id: 'pause' as const,
      title: 'Pause AI',
      body: 'Pause any chat and reply yourself. You stay in control.',
    },
  ],
};

export const tryWithProducts = {
  eyebrow: 'Try before you commit',
  headlineBefore: 'Do not take our word for it.',
  headlineHighlight: 'Try it with your own products.',
  body: 'Create a demo account and get ₹50 of free trial balance. Add your products, set up your store, and experience how ChatLogix handles real customer conversations.',
  journey: [
    { title: 'Create account', body: 'Sign up in minutes.' },
    { title: 'Add products', body: 'Upload your catalog and set up your store.' },
    { title: 'Test conversations', body: 'Try real customer questions and see AI replies.' },
    { title: 'Decide with confidence', body: 'Finish setup and you are in. No review queue.' },
  ],
  note: 'Real conversations. Real confidence.',
  card: {
    badge: 'Get ₹50 free trial balance',
    // TODO(owner B4): "about 250 test chats" (~₹0.20) vs the calculator ~₹0.40–₹0.70
    // per message on ChatLogix's share. Do not edit this try-box until the owner explains
    // (sandbox chats vs a "chat" = one exchange) or aligns the two.
    body: 'Finish setup and you are in — no review queue. ₹50 covers catalog upload and about 250 test chats. Then pay as you go; leftover trial stays in your wallet.',
    checklist: ['Full feature access (limited)', 'Test with your own products', 'No commitment'],
    cta: 'Start my free demo',
    fineprint: 'Pay-as-you-go wallet after the trial. No monthly plan. Unused trial balance stays.',
  },
  trustRow: ['Secure & private', 'No card required'],
};

export const pricingCalculator = {
  eyebrow: 'What it costs',
  headlineBefore: 'See what a typical month costs.',
  headlineHighlight: 'No monthly plan.',
  body: "Top up a prepaid wallet and pay only for what you use. Slide to match your shop. It's an estimate, not a fixed price.",
  included: {
    label: "What's included",
    items: [
      { id: 'instant' as const, text: 'Customers get replies in seconds, 24 hours a day' },
      { id: 'orders' as const, text: 'See all your orders in one place' },
      { id: 'control' as const, text: 'See every chat, and reply yourself any time' },
      { id: 'catalog' as const, text: 'Change a price or product, and chats use it right away' },
      { id: 'whatsapp' as const, text: shopNumberClaim },
    ],
  },
  period: {
    label: 'Show volume as',
    daily: 'Daily',
    monthly: 'Monthly',
  },
  presets: {
    label: 'Typical shops',
    'home-seller': { label: 'Home seller', sublabel: 'about 30 messages a day' },
    'small-shop': { label: 'Small shop', sublabel: 'about 100 messages a day' },
    'busy-store': { label: 'Busy store', sublabel: 'about 500 messages a day' },
  },
  sliders: {
    incoming: 'Customer messages',
    voice: 'Voice notes (share of customer messages)',
    voiceHelper: 'Voice notes cost a bit more to process.',
  },
  sliderValue: {
    incomingDaily: (value: string) => `${value} / day`,
    incomingMonthly: (value: string) => `${value} / month`,
    voice: (value: string) => `${value}%`,
  },
  /** Spoken value for screen readers — `aria-valuetext` on each slider. */
  sliderValueText: {
    incomingDaily: (value: string) => `${value} customer messages a day`,
    incomingMonthly: (value: string) => `${value} customer messages a month`,
    voice: (value: string) => `${value} percent of messages are voice notes`,
  },
  result: {
    label: 'Typical month',
    amount: (low: string, high: string) => `₹${low}-₹${high}`,
    suffix: '/ month',
    perDay: (low: string, high: string) => `≈ ₹${low}–₹${high} a day`,
  },
  stripOverAllowance: (messages: string, allowance: string) =>
    `${messages} messages a month. WhatsApp's fee applies after the first ${allowance} replies each month.`,
  stripWithinAllowance: (messages: string, allowance: string) =>
    `${messages} messages a month. That's within the first ${allowance} replies each month, which carry no WhatsApp fee.`,
  cta: (rupees: number) => `Try free with ₹${rupees}`,
  footnote: (effectiveLabel: string, allowance: string) =>
    `Estimate based on WhatsApp's rates from ${effectiveLabel}, which WhatsApp can change each quarter. The first ${allowance} replies to customers each month have no WhatsApp fee. Pay as you go. No monthly plan.`,
};

export const faq = {
  eyebrow: 'FAQ',
  headlineBefore: 'Everything you need to know',
  headlineHighlight: 'before you start.',
  subtext: 'Quick answers to the most common questions from businesses like yours.',
  categories: [
    {
      id: 'getting-started' as const,
      title: 'Getting started',
      subtitle: 'Set up, explore and try with confidence.',
      items: [
        {
          question: 'What is ChatLogix?',
          answer:
            'ChatLogix is a WhatsApp commerce platform that helps businesses answer customer questions, share product information, and guide orders through natural chat.',
        },
        {
          question: 'How long does setup take?',
          answer:
            'Many shops create an account and upload a catalog in minutes. You can test the demo chat before connecting live WhatsApp.',
        },
        {
          question: 'Can I try ChatLogix before paying?',
          answer:
            'Yes. Sign up with your mobile number. No card needed. You get ₹50 of free trial balance to test with your own products.',
        },
        {
          question: 'What does the ₹50 free trial balance include?',
          answer:
            '₹50 covers catalog upload and about 250 test chats. You see usage in rupees as you test.',
        },
        {
          question: 'Do I need a new WhatsApp number?',
          answer:
            'No. Customers keep messaging your existing shop WhatsApp. ChatLogix replies through that number after you connect.',
        },
      ],
    },
    {
      id: 'ai-conversations' as const,
      title: 'AI & conversations',
      subtitle: 'Natural, accurate and on your terms.',
      items: [
        {
          question: 'Does ChatLogix answer customers automatically?',
          answer:
            'Yes, for live WhatsApp conversations after you go live. You can pause auto-reply on any conversation and respond yourself.',
        },
        {
          question: 'Can customers ask questions naturally?',
          answer:
            'Yes. Customers write the way they already use WhatsApp. They do not need to follow rigid menu buttons.',
        },
        {
          question: 'Can customers use different languages or voice notes?',
          answer:
            'Yes. Customers can write in English, Tamil, Tanglish, Hindi, Hinglish, Malayalam, Kannada, or Telugu, or send a voice note — ChatLogix transcribes it and replies in the same language.',
        },
        {
          question: 'How does ChatLogix know about my products?',
          answer:
            'From the catalog you add during onboarding or later in the dashboard, including names, prices, variants, and descriptions.',
        },
        {
          question: 'What happens when the AI does not know something?',
          answer:
            'Unknown facts go to Queries for the owner. The chat stays open and nothing is invented. You can also pause AI on any chat and reply yourself.',
        },
      ],
    },
    {
      id: 'orders-control' as const,
      title: 'Orders & control',
      subtitle: 'You stay in control, always.',
      items: [
        {
          question: 'Can customers place orders through WhatsApp?',
          answer:
            'Customers can build and confirm orders in chat. Orders are recorded for you to review and fulfill in the dashboard.',
        },
        {
          question: 'How are orders managed?',
          answer:
            'Every order lands in your dashboard, where you can track its status, update fulfillment, and review the full order history.',
        },
        {
          question: 'Can I take over a conversation myself?',
          answer:
            'Yes. Pause auto-reply on any conversation and reply directly when you want to handle it personally.',
        },
        {
          question: 'Does AI make decisions on its own?',
          answer:
            'AI understands and responds, but product facts come from your catalog and orders follow validation. Important actions stay under your control.',
        },
        {
          question: 'How does pricing work?',
          answer:
            'There is no monthly plan. You add money to a prepaid wallet and pay as you go. Typically ₹A–₹B from the calculator. After the first 1,000 customer replies, a text reply is about ₹0.38–₹0.50 (AI + WhatsApp). See /#pricing.',
        },
        {
          question: 'What is advance payment?',
          answer:
            'Advance payment means you prepaid your ChatLogix wallet. There is no monthly invoice.',
        },
      ],
    },
  ],
  cta: {
    eyebrow: 'Ready to see it yourself?',
    headline: 'Get ₹50 free trial balance and try ChatLogix today.',
    body: 'No commitment. Experience it with your own products.',
    button: 'Start my free demo',
  },
};

export const aboutMeta = {
  title: 'The WhatsApp assistant built for real shops | ChatLogix',
  description:
    'ChatLogix helps shops answer WhatsApp questions, share prices from the catalog, and take orders with AI — while you stay in control of the business.',
};

export const about = {
  headline: 'The WhatsApp assistant built for real shops',
  body: 'ChatLogix is a conversational commerce platform for businesses that sell and support customers through WhatsApp. We help shop owners answer product questions, guide orders, and cut repetitive chat work — without giving up control of catalog, prices, or orders.',
};

export const privacyMeta = {
  title: 'Privacy Policy | ChatLogix',
  description:
    'How ChatLogix collects, uses, and protects shop, customer, and WhatsApp conversation data on our commerce platform.',
};

export const privacyLastUpdated = 'September 6, 2026';
