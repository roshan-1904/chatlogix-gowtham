/**
 * Language profiles and conversation scripts for the load test
 * (docs/LOAD_TESTING.md §4.1).
 *
 * ⚠ TRANSLATION REVIEW NEEDED
 * The regional-language strings below were authored by an LLM and have NOT been
 * reviewed by native speakers. They are grammatical enough to exercise the
 * pipeline (script detection, tokenization, translation, product matching), but
 * before quoting any customer-facing quality conclusion from a run, have a
 * speaker of each language check the `turns` arrays. Perf and cost findings are
 * unaffected by minor phrasing issues; naturalness scoring is not.
 *
 * Each conversation holds one language across all six turns, as a real customer
 * would. The arc is fixed so that turns 3-6 produce mutating cart ops, which
 * forces LLM-2 to run (llm2.ts:27-33), and turn 5 produces a `set_field`
 * address op, which triggers `normalizeSetFieldOps` translation on non-English
 * traffic (pipeline.ts:354).
 */

export interface LanguageProfile {
  /** Stable key used in the manifest and the report. */
  key: string;
  label: string;
  /**
   * What `detectLanguageFromText` (conversation/language.ts:19-34) should
   * classify these turns as. The report compares detection against this.
   * Note Marathi is expected to come back as `hi` — it shares the Devanagari
   * range and Devanagari is tested first.
   */
  expectedDetection: string;
  /** How many of the 200 conversations use this profile. Must total 200. */
  conversations: number;
  /**
   * True when the script is non-Latin, so `needsEnglish` (vendorEnglish.ts:44)
   * returns true and the translation paths engage. The two Latin profiles are
   * the control groups.
   */
  expectsTranslation: boolean;
  /** Six turns: greet, browse, add, modify qty, address, confirm. */
  turns: [string, string, string, string, string, string];
}

export const LANGUAGE_PROFILES: LanguageProfile[] = [
  {
    key: 'ta',
    label: 'Tamil',
    expectedDetection: 'ta',
    conversations: 40,
    expectsTranslation: true,
    turns: [
      'வணக்கம்',
      'என்ன கேக் இருக்கு?',
      'ஒரு சாக்லேட் பிரௌனி வேணும்',
      'ரெண்டு ஆக்கிடுங்க',
      'முகவரி: 12, காந்தி தெரு, கோயம்புத்தூர் 641001',
      'சரி, ஆர்டர் கன்ஃபார்ம் பண்ணுங்க'
    ]
  },
  {
    key: 'hi',
    label: 'Hindi',
    expectedDetection: 'hi',
    conversations: 40,
    expectsTranslation: true,
    turns: [
      'नमस्ते',
      'कौन से केक उपलब्ध हैं?',
      'मुझे एक चॉकलेट ब्राउनी चाहिए',
      'दो कर दीजिए',
      'पता: 12, गांधी रोड, पुणे 411001',
      'ठीक है, ऑर्डर कन्फर्म कर दीजिए'
    ]
  },
  {
    key: 'te',
    label: 'Telugu',
    expectedDetection: 'te',
    conversations: 24,
    expectsTranslation: true,
    turns: [
      'నమస్కారం',
      'ఏ కేకులు ఉన్నాయి?',
      'నాకు ఒక చాక్లెట్ బ్రౌనీ కావాలి',
      'రెండు చేయండి',
      'చిరునామా: 12, గాంధీ రోడ్, హైదరాబాద్ 500001',
      'సరే, ఆర్డర్ కన్ఫర్మ్ చేయండి'
    ]
  },
  {
    key: 'ml',
    label: 'Malayalam',
    expectedDetection: 'ml',
    conversations: 24,
    expectsTranslation: true,
    turns: [
      'നമസ്കാരം',
      'എന്ത് കേക്കുകൾ ഉണ്ട്?',
      'എനിക്ക് ഒരു ചോക്ലേറ്റ് ബ്രൗണി വേണം',
      'രണ്ട് ആക്കൂ',
      'വിലാസം: 12, ഗാന്ധി റോഡ്, കൊച്ചി 682001',
      'ശരി, ഓർഡർ കൺഫേം ചെയ്യൂ'
    ]
  },
  {
    key: 'kn',
    label: 'Kannada',
    expectedDetection: 'kn',
    conversations: 24,
    expectsTranslation: true,
    turns: [
      'ನಮಸ್ಕಾರ',
      'ಯಾವ ಕೇಕ್ ಇದೆ?',
      'ನನಗೆ ಒಂದು ಚಾಕೊಲೇಟ್ ಬ್ರೌನಿ ಬೇಕು',
      'ಎರಡು ಮಾಡಿ',
      'ವಿಳಾಸ: 12, ಗಾಂಧಿ ರಸ್ತೆ, ಬೆಂಗಳೂರು 560001',
      'ಸರಿ, ಆರ್ಡರ್ ಕನ್ಫರ್ಮ್ ಮಾಡಿ'
    ]
  },
  {
    key: 'bn',
    label: 'Bengali',
    expectedDetection: 'bn',
    conversations: 12,
    expectsTranslation: true,
    turns: [
      'নমস্কার',
      'কী কী কেক আছে?',
      'আমি একটা চকোলেট ব্রাউনি চাই',
      'দুটো করে দিন',
      'ঠিকানা: 12, গান্ধী রোড, কলকাতা 700001',
      'ঠিক আছে, অর্ডার কনফার্ম করুন'
    ]
  },
  {
    key: 'mr',
    label: 'Marathi (Devanagari — expected to detect as hi)',
    expectedDetection: 'hi',
    conversations: 8,
    expectsTranslation: true,
    turns: [
      'नमस्कार',
      'कोणते केक आहेत?',
      'मला एक चॉकलेट ब्राउनी हवी',
      'दोन करा',
      'पत्ता: 12, गांधी रोड, नागपूर 440001',
      'ठीक आहे, ऑर्डर कन्फर्म करा'
    ]
  },
  {
    key: 'gu',
    label: 'Gujarati',
    expectedDetection: 'gu',
    conversations: 6,
    expectsTranslation: true,
    turns: [
      'નમસ્તે',
      'કઈ કેક છે?',
      'મને એક ચોકલેટ બ્રાઉની જોઈએ',
      'બે કરી દો',
      'સરનામું: 12, ગાંધી રોડ, અમદાવાદ 380001',
      'બરાબર, ઓર્ડર કન્ફર્મ કરો'
    ]
  },
  {
    key: 'pa',
    label: 'Punjabi (Gurmukhi)',
    expectedDetection: 'pa',
    conversations: 6,
    expectsTranslation: true,
    turns: [
      'ਸਤ ਸ੍ਰੀ ਅਕਾਲ',
      'ਕਿਹੜੇ ਕੇਕ ਹਨ?',
      'ਮੈਨੂੰ ਇੱਕ ਚਾਕਲੇਟ ਬਰਾਊਨੀ ਚਾਹੀਦੀ ਹੈ',
      'ਦੋ ਕਰ ਦਿਓ',
      'ਪਤਾ: 12, ਗਾਂਧੀ ਰੋਡ, ਲੁਧਿਆਣਾ 141001',
      'ਠੀਕ ਹੈ, ਆਰਡਰ ਕਨਫਰਮ ਕਰੋ'
    ]
  },
  {
    // Control group 1: the cheap path everything else is measured against.
    key: 'en',
    label: 'English (control)',
    expectedDetection: 'en',
    conversations: 10,
    expectsTranslation: false,
    turns: [
      'Hi',
      'What cakes do you have?',
      'I want one chocolate brownie',
      'Make it two',
      'Address: 12 Gandhi Road, Chennai 600001',
      'Ok, please confirm the order'
    ]
  },
  {
    // Control group 2: Tamil/Hindi *language* in Latin *script*.
    // `needsEnglish` returns false (no non-Latin characters), so this skips
    // every translation call and `contentEn` stays null — confirmed in the
    // 2026-09-11 preflight.
    //
    // Detection was originally expected to be 'en', because the regex in
    // detectLanguageFromText only looks at script. The preflight showed 'ta'
    // instead: the persisted CustomerInsights.preferredLanguage comes from
    // LLM-1, which correctly recognises Tanglish as Tamil. That is better
    // behaviour than the regex, so the expectation is corrected here rather
    // than filed as a bug.
    key: 'latin_mixed',
    label: 'Hinglish / Tanglish (Latin script, control)',
    expectedDetection: 'ta',
    conversations: 6,
    expectsTranslation: false,
    turns: [
      'Hi anna',
      'Enna cake irukku?',
      'Oru chocolate brownie venum',
      'Rendu pannunga',
      'Address: 12 Gandhi Road, Coimbatore 641001',
      'Ok, order confirm pannunga'
    ]
  }
];

export const TURNS_PER_CONVERSATION = 6;

export const TOTAL_CONVERSATIONS = LANGUAGE_PROFILES.reduce((sum, p) => sum + p.conversations, 0);

export const TOTAL_MESSAGES = TOTAL_CONVERSATIONS * TURNS_PER_CONVERSATION;

/** Fail fast at import if the distribution drifts away from the documented 200. */
if (TOTAL_CONVERSATIONS !== 200) {
  throw new Error(
    `Language distribution must total 200 conversations (docs/LOAD_TESTING.md §4.1), got ${TOTAL_CONVERSATIONS}`
  );
}

for (const profile of LANGUAGE_PROFILES) {
  if (profile.turns.length !== TURNS_PER_CONVERSATION) {
    throw new Error(`Language profile '${profile.key}' must have exactly ${TURNS_PER_CONVERSATION} turns`);
  }
}
