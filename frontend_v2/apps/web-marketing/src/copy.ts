export const homeMeta = {
  title: 'Stop typing WhatsApp replies | ChatLogix',
  description:
    'ChatLogix answers product questions, quotes from your catalog, and turns chats into orders on WhatsApp — 24/7. Try with ₹100 free credits. No card needed.',
};

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
    'Try with your own products · ₹100 free credits · No card required · Experience ChatLogix before you pay',
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
    { id: 'rahul', name: '91234 xxxxx', preview: 'Can you confirm cotton or blend?', time: '9:22', unread: 2 },
    { id: 'c3', name: '87654 xxxxx', preview: 'Delivery today possible?', time: '8:55', unread: 22 },
    { id: 'c4', name: '99887 xxxxx', preview: 'Price for 3 pieces?', time: '8:41', unread: 7 },
    { id: 'c5', name: '95432 xxxxx', preview: 'Hello? Anyone there?', time: '8:12', unread: 31 },
    { id: 'c6', name: '88776 xxxxx', preview: '0:12', time: '8:08', unread: 18, isVoice: true },
    { id: 'c7', name: '90123 xxxxx', preview: 'Bulk order for 20 pcs?', time: '7:54', unread: 5 },
    { id: 'c8', name: '96543 xxxxx', preview: 'Size chart please', time: '7:41', unread: 11 },
    { id: 'c9', name: '88221 xxxxx', preview: 'COD available in 560001?', time: '7:28', unread: 8 },
    { id: 'c10', name: '93456 xxxxx', preview: 'Need by tomorrow morning', time: '7:15', unread: 15 },
    { id: 'c11', name: '97890 xxxxx', preview: '0:06', time: '7:02', unread: 6, isVoice: true },
    { id: 'c12', name: '94567 xxxxx', preview: 'Any discount on 5 pieces?', time: '6:48', unread: 12 },
  ],
  threads: {
    priya: {
      name: '98765 xxxxx',
      messages: [
        { type: 'text' as const, from: 'customer' as const, text: 'Hi, do you have the black shirt in XL?', time: '8:12 am' },
        { type: 'text' as const, from: 'customer' as const, text: 'What’s the price for 2 pieces?', time: '8:34 am' },
        { type: 'voice' as const, from: 'customer' as const, duration: '0:06', time: '9:05 am' },
        { type: 'text' as const, from: 'customer' as const, text: 'Hello? Need this for tonight', time: '9:48 am' },
      ],
      manualReply: 'Yes XL is available, ₹1,499 each',
    },
    rahul: {
      name: '91234 xxxxx',
      messages: [
        { type: 'voice' as const, from: 'customer' as const, duration: '0:08', time: '8:28 am' },
        { type: 'text' as const, from: 'customer' as const, text: 'Can you confirm cotton or blend?', time: '9:22 am' },
      ],
      manualReply: 'It is 100% cotton',
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
    { atMs: 1000, action: 'appear', chatId: 'priya', preview: 'Black shirt XL — need 2 pcs', time: '10:22', unread: 1 },
    { atMs: 1400, action: 'appear', chatId: 'meera', preview: 'Hello? Anyone there?', time: '10:17', unread: 1 },
    { atMs: 3200, action: 'reply', chatId: 'rahul', preview: '100% cotton, ₹1,499/pc. Delivery tomorrow.' },
    { atMs: 2100, action: 'appear', chatId: 'karan', preview: 'Do you have blue in L?', time: '10:16', unread: 1 },
    { atMs: 2400, action: 'appear', chatId: 'vikram', preview: 'Price for 3 pieces?', time: '10:18', unread: 1 },
    { atMs: 3800, action: 'reply', chatId: 'priya', preview: 'Yes! Classic Black Shirt XL — ₹1,499. Add to order?' },
    { atMs: 2900, action: 'appear', chatId: 'ananya', preview: 'Delivery today possible?', time: '10:19', unread: 1 },
    { atMs: 4200, action: 'reply', chatId: 'meera', preview: 'Hi! Yes, we’re here. What are you looking for?' },
    { atMs: 3400, action: 'appear', chatId: 'divya', preview: '0:05', time: '10:15', unread: 1, isVoice: true },
    { atMs: 3700, action: 'appear', chatId: 'arjun', preview: 'Bulk order for office — 20 pcs', time: '10:14', unread: 1 },
    { atMs: 5100, action: 'reply', chatId: 'karan', preview: 'Blue in L is in stock — ₹1,499.' },
    { atMs: 5300, action: 'reply', chatId: 'vikram', preview: '3 pieces — ₹4,047 with 10% bundle off.' },
    { atMs: 4200, action: 'customer', chatId: 'rahul', preview: 'Can I pay on delivery?', unread: 1 },
    { atMs: 5700, action: 'reply', chatId: 'ananya', preview: 'Same-day delivery available in your area.' },
    { atMs: 6200, action: 'reply', chatId: 'divya', preview: 'Got your voice note — cotton kurta ₹899, all sizes.' },
    { atMs: 6500, action: 'reply', chatId: 'arjun', preview: '20 pcs bulk — ₹28,480 with 5% off. Confirm?' },
    { atMs: 6800, action: 'reply', chatId: 'rahul', preview: 'Yes, COD available in your pin code.' },
    { atMs: 5000, action: 'customer', chatId: 'priya', preview: 'Yes, add 2 please', unread: 1 },
    { atMs: 5300, action: 'customer', chatId: 'vikram', preview: 'Book it for me', unread: 1 },
    { atMs: 5400, action: 'customer', chatId: 'meera', preview: 'Need 1 white shirt M', unread: 1 },
    { atMs: 7800, action: 'reply', chatId: 'priya', preview: 'Done — 2× Classic Black Shirt (XL), ₹2,998.', countsAsOrder: true },
    { atMs: 8000, action: 'reply', chatId: 'vikram', preview: 'Order noted! Share delivery address.', countsAsOrder: true },
    { atMs: 8100, action: 'reply', chatId: 'meera', preview: 'White shirt M — ₹1,299. Adding to your order?' },
    { atMs: 6200, action: 'customer', chatId: 'karan', preview: 'Add 1 blue L', unread: 1 },
    { atMs: 6300, action: 'customer', chatId: 'ananya', preview: 'Perfect, sending address', unread: 1 },
    { atMs: 6600, action: 'customer', chatId: 'divya', preview: 'Size M please', unread: 1 },
    { atMs: 8600, action: 'reply', chatId: 'karan', preview: 'Added 1× Blue Shirt (L) — ₹1,499.', countsAsOrder: true },
    { atMs: 8700, action: 'reply', chatId: 'ananya', preview: 'Great — share when ready, we’ll confirm slot.' },
    { atMs: 7000, action: 'customer', chatId: 'arjun', preview: 'Confirm bulk order', unread: 1 },
    { atMs: 9000, action: 'reply', chatId: 'divya', preview: 'Size M noted — ₹899. Ready to checkout?', countsAsOrder: true },
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
      body: 'Price for XL? In stock? Delivery today? You already know the answer. You still type it again.',
      tags: ['Size?', 'Price?', 'Delivery?', 'Stock?'] as const,
      chat: {
        name: '+91 98765 43210',
        messages: [
          { from: 'customer' as const, text: 'Hi, do you have this in XL?' },
          { from: 'shop' as const, text: 'Yes, available!' },
          { from: 'customer' as const, text: 'How much is it?' },
          { from: 'customer' as const, text: 'Do you deliver today?' },
          { from: 'customer' as const, text: 'Can I get 2 pieces?' },
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
        { name: '91234 56789', preview: 'Price for 3 pieces?', time: '9:22', unread: '12' },
        { name: '87654 32109', preview: 'Delivery possible?', time: '8:55', unread: '7' },
        { name: '99887 66554', preview: 'Is it available in L?', time: '8:30', unread: '5' },
      ],
    },
    {
      id: 'lost' as const,
      tone: 'blue' as const,
      title: 'The order is in the chat — somewhere',
      body: '2 pcs, black XL, the pin code, “so total is…?” — split across messages. Easy to miss. Hard to pack.',
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
          { text: 'Need 2 pcs black XL' },
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
  body: 'ChatLogix understands customer questions, finds the right products from your catalog, remembers the conversation, and helps customers move toward an order — automatically, on WhatsApp.',
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
  shopName: 'Classic Wear',
  subtitle: 'Online',
  avatar: 'C',
  messages: [
    {
      from: 'customer' as const,
      time: '10:21 AM',
      text: 'Hi, do you have the black shirt in XL?',
    },
    {
      from: 'shop' as const,
      time: '10:21 AM',
      text: 'Yes! Classic Black Shirt in XL is available for ₹1,499. Would you like me to add it to your order?',
    },
    {
      from: 'customer' as const,
      time: '10:22 AM',
      text: 'Great! Add 2 pieces. Also, can you deliver to MG Road today?',
    },
    {
      from: 'shop' as const,
      time: '10:22 AM',
      lines: [
        { text: 'Sure! ✅' },
        { text: '2 × Classic Black Shirt (XL)', bold: true },
        { text: 'Delivery to MG Road today.' },
        { text: 'Shall I confirm the order?' },
      ],
    },
  ],
};

export const howItWorks = {
  eyebrow: 'How ChatLogix works',
  headlineBefore: 'You stay in control. ',
  headlineHighlight: 'ChatLogix handles the conversations.',
  body: 'You provide your catalog and business rules, review everything, and go live. ChatLogix then handles thousands of customer conversations on WhatsApp — while you manage products, orders, payments, shipping and conversations from one dashboard.',
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
      { name: 'Classic Black Shirt', price: '₹1,499', swatch: '#1a1a1a' },
      { name: 'Blue Shirt', price: '₹1,299', swatch: '#3b6ea8' },
      { name: 'White T-Shirt', price: '₹899', swatch: '#e8e8e8' },
    ],
  },
  chatCard: {
    name: 'Rahul M.',
    subtitle: 'Online',
    customer: 'Do you have the black shirt in XL?',
    shop: 'Yes! Classic Black Shirt in XL is available for ₹1,499. Would you like me to add it to your order?',
  },
  inboxCard: {
    title: 'Live conversations (1,247)',
    chats: [
      { name: 'Priya K.', preview: 'Black shirt XL — need 2 pcs', time: '10:22', unread: 2 },
      { name: 'Meera R.', preview: 'Hello? Anyone there?', time: '10:17', unread: 1 },
      { name: 'Karan S.', preview: 'Do you have blue in L?', time: '10:16', unread: 3 },
      { name: 'Sneha T.', preview: 'Delivery to MG Road today?', time: '10:14', unread: 1 },
    ],
  },
  dashboardCard: {
    nav: ['Dashboard', 'Conversations', 'Orders', 'Products'],
    active: 'Orders',
    heading: 'Orders',
    rows: [
      { id: 'CW-1042', product: 'Classic Black Shirt', amount: '₹2,998', status: 'Confirmed' },
      { id: 'CW-1041', product: 'Blue Shirt', amount: '₹1,299', status: 'Packing' },
      { id: 'CW-1040', product: 'White T-Shirt', amount: '₹899', status: 'Shipped' },
      { id: 'CW-1039', product: 'Classic Black Shirt', amount: '₹1,499', status: 'Delivered' },
    ],
  },
  trustLine: 'AI assists. Your business stays in control.',
  trustSubline:
    'ChatLogix responds from your approved product and business information — designed to avoid hallucinated product details and false promises.',
  highlights: [
    {
      id: 'scale' as const,
      title: '1000s of conversations at once',
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
  shopName: 'Sweet Crumb Bakery',
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
      title: 'Thousands of customers at once',
      body: 'Handle thousands of conversations simultaneously without making customers wait for a manual reply.',
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
      text: 'Hi, 10 perukku birthday cake venum.',
      time: '10:24 am',
    },
    {
      role: 'assistant' as const,
      lang: 'Tanglish',
      text: 'Sure! Chocolate, red velvet, black forest cakes irukku. Options paaka venuma?',
      time: '10:24 am',
    },
    {
      role: 'customer' as const,
      lang: 'Hinglish',
      text: 'Chocolate wala chahiye bhai.',
      time: '10:25 am',
    },
    {
      role: 'assistant' as const,
      lang: 'Hinglish',
      text: 'Great choice! 1 kg chocolate cake ₹850 hai, 8–10 logon ke liye. Order mein add karu?',
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
      text: 'ಸರಿ! Order confirm ಆಗಿದೆ. ನಾಳೆ MG Road ಗೆ chocolate cake deliver ಮಾಡುತ್ತೇವೆ.',
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
    { id: 'volume' as const, value: '1000s', body: 'Conversations at the same time.' },
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
    customer: '2 kg cake price enna?',
    customerTime: '10:21 AM',
    assistant:
      'Our 2 kg chocolate cake is ₹1,450 and serves 15–20 people. Same day delivery is available in your area. Would you like to add it to your order?',
    assistantTime: '10:22 AM',
  },
  storeLine: 'Conversation and response are stored in your dashboard for your reference.',
};

export const tryWithProducts = {
  eyebrow: 'Try before you commit',
  headlineBefore: 'Do not take our word for it.',
  headlineHighlight: 'Try it with your own products.',
  body: 'Create a demo account and get ₹100 in free credits. Add your products, set up your store, and experience how ChatLogix handles real customer conversations.',
  journey: [
    { title: 'Create account', body: 'Sign up in minutes.' },
    { title: 'Add products', body: 'Upload your catalog and set up your store.' },
    { title: 'Test conversations', body: 'Try real customer questions and see AI replies.' },
    { title: 'Decide with confidence', body: 'Explore, test and see the value before you upgrade.' },
  ],
  note: 'Real conversations. Real confidence.',
  card: {
    badge: 'Get ₹100 free credits',
    body: 'Use your trial credit to upload your catalog and test the assistant. After approval, add a prepaid balance to serve live customers. Plan pricing will be shared when available.',
    checklist: ['Full feature access (limited)', 'Test with your own products', 'No commitment'],
    cta: 'Start my free demo',
    fineprint:
      'When trial credit is used up, you can still submit for approval. Trial balance does not carry over after approval.',
  },
  trustRow: ['Secure & private', 'No credit card required', 'Trusted by businesses'],
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
            'Yes. Sign up with your mobile number. No credit card. You get ₹100 in free credits to test with your own products.',
        },
        {
          question: 'What do the ₹100 free credits include?',
          answer:
            'Trial balance for catalog reading and demo conversations, including text and voice in the private demo. You see usage in rupees as you test.',
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
            'Yes. Customers can write in Tamil, Hindi, or English, or send a voice note — ChatLogix transcribes it and replies in the same language.',
        },
        {
          question: 'How does ChatLogix know about my products?',
          answer:
            'From the catalog you add during onboarding or later in the dashboard, including names, prices, variants, and descriptions.',
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
      ],
    },
  ],
  cta: {
    eyebrow: 'Ready to see it yourself?',
    headline: 'Get ₹100 free credits and try ChatLogix today.',
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
