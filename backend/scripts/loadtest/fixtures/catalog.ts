/**
 * Multilingual product catalog for the load test (docs/LOAD_TESTING.md §4.5).
 *
 * `searchCandidateProducts` enables AI product matching ONLY for non-English
 * queries (cart/candidateSearch.ts:39). If test catalogs carried English-only
 * names while customers write in Tamil, every lookup would miss,
 * `ProductMatchMiss` would fire on essentially every turn, and the AI matcher
 * would run constantly — measuring a pathological case rather than a realistic
 * one.
 *
 * So each product keeps an English canonical `name` (as a real vendor's catalog
 * would) and carries regional-language names in `keywords`, which is exactly
 * what `findBestProductMatch` consumes.
 *
 * ⚠ Same translation-review caveat as fixtures/languages.ts: these strings are
 * LLM-authored and unreviewed by native speakers.
 *
 * `Chocolate Brownie` and `Vanilla Cake` are load-bearing — every conversation
 * script in fixtures/languages.ts asks about cakes (turn 2) and orders a
 * brownie (turn 3). If those two stop matching, the run measures the
 * product-miss path instead of the order path.
 */

export interface SeedProduct {
  name: string;
  category: string;
  /** Paise, per the repo-wide integer-money convention. */
  basePrice: number;
  baseUnit: string;
  baseQuantity: number;
  /** Regional-language names + Latin transliterations, flattened into keywords. */
  translations: Partial<Record<'ta' | 'hi' | 'te' | 'ml' | 'kn' | 'bn' | 'gu' | 'pa', string[]>>;
  latinAliases: string[];
}

export const SEED_PRODUCTS: SeedProduct[] = [
  {
    name: 'Chocolate Brownie',
    category: 'Bakery',
    basePrice: 8000,
    baseUnit: 'piece',
    baseQuantity: 1,
    translations: {
      ta: ['சாக்லேட் பிரௌனி', 'பிரௌனி'],
      hi: ['चॉकलेट ब्राउनी', 'ब्राउनी'],
      te: ['చాక్లెట్ బ్రౌనీ', 'బ్రౌనీ'],
      ml: ['ചോക്ലേറ്റ് ബ്രൗണി', 'ബ്രൗണി'],
      kn: ['ಚಾಕೊಲೇಟ್ ಬ್ರೌನಿ', 'ಬ್ರೌನಿ'],
      bn: ['চকোলেট ব্রাউনি', 'ব্রাউনি'],
      gu: ['ચોકલેટ બ્રાઉની', 'બ્રાઉની'],
      pa: ['ਚਾਕਲੇਟ ਬਰਾਊਨੀ', 'ਬਰਾਊਨੀ']
    },
    latinAliases: ['brownie', 'choco brownie', 'chocolate brownie']
  },
  {
    name: 'Vanilla Cake',
    category: 'Bakery',
    basePrice: 45000,
    baseUnit: 'kg',
    baseQuantity: 1,
    translations: {
      ta: ['வெண்ணிலா கேக்', 'கேக்'],
      hi: ['वनीला केक', 'केक'],
      te: ['వెనిలా కేక్', 'కేక్'],
      ml: ['വാനില കേക്ക്', 'കേക്ക്'],
      kn: ['ವೆನಿಲಾ ಕೇಕ್', 'ಕೇಕ್'],
      bn: ['ভ্যানিলা কেক', 'কেক'],
      gu: ['વેનીલા કેક', 'કેક'],
      pa: ['ਵਨੀਲਾ ਕੇਕ', 'ਕੇਕ']
    },
    latinAliases: ['cake', 'vanilla cake']
  },
  {
    name: 'Chocolate Cake',
    category: 'Bakery',
    basePrice: 55000,
    baseUnit: 'kg',
    baseQuantity: 1,
    translations: {
      ta: ['சாக்லேட் கேக்'],
      hi: ['चॉकलेट केक'],
      te: ['చాక్లెట్ కేక్'],
      ml: ['ചോക്ലേറ്റ് കേക്ക്'],
      kn: ['ಚಾಕೊಲೇಟ್ ಕೇಕ್'],
      bn: ['চকোলেট কেক'],
      gu: ['ચોકલેટ કેક'],
      pa: ['ਚਾਕਲੇਟ ਕੇਕ']
    },
    latinAliases: ['choco cake', 'chocolate cake']
  },
  {
    name: 'Butter Cookies',
    category: 'Bakery',
    basePrice: 12000,
    baseUnit: 'packet',
    baseQuantity: 1,
    translations: {
      ta: ['பட்டர் குக்கீஸ்', 'பிஸ்கட்'],
      hi: ['बटर कुकीज़', 'बिस्कुट'],
      te: ['బటర్ కుకీస్', 'బిస్కెట్'],
      ml: ['ബട്ടർ കുക്കീസ്', 'ബിസ്കറ്റ്'],
      kn: ['ಬಟರ್ ಕುಕೀಸ್', 'ಬಿಸ್ಕೆಟ್'],
      bn: ['বাটার কুকিজ', 'বিস্কুট'],
      gu: ['બટર કૂકીઝ', 'બિસ્કિટ'],
      pa: ['ਬਟਰ ਕੂਕੀਜ਼', 'ਬਿਸਕੁਟ']
    },
    latinAliases: ['cookies', 'biscuit', 'butter cookies']
  },
  {
    name: 'Fresh Milk',
    category: 'Dairy',
    basePrice: 3000,
    baseUnit: 'litre',
    baseQuantity: 1,
    translations: {
      ta: ['பால்'],
      hi: ['दूध'],
      te: ['పాలు'],
      ml: ['പാൽ'],
      kn: ['ಹಾಲು'],
      bn: ['দুধ'],
      gu: ['દૂધ'],
      pa: ['ਦੁੱਧ']
    },
    latinAliases: ['milk', 'paal', 'doodh']
  },
  {
    name: 'Paneer',
    category: 'Dairy',
    basePrice: 9000,
    baseUnit: 'g',
    baseQuantity: 200,
    translations: {
      ta: ['பன்னீர்'],
      hi: ['पनीर'],
      te: ['పనీర్'],
      ml: ['പനീർ'],
      kn: ['ಪನೀರ್'],
      bn: ['পনির'],
      gu: ['પનીર'],
      pa: ['ਪਨੀਰ']
    },
    latinAliases: ['paneer', 'cottage cheese']
  },
  {
    name: 'Ghee',
    category: 'Dairy',
    basePrice: 65000,
    baseUnit: 'litre',
    baseQuantity: 1,
    translations: {
      ta: ['நெய்'],
      hi: ['घी'],
      te: ['నెయ్యి'],
      ml: ['നെയ്യ്'],
      kn: ['ತುಪ್ಪ'],
      bn: ['ঘি'],
      gu: ['ઘી'],
      pa: ['ਘਿਓ']
    },
    latinAliases: ['ghee', 'nei', 'tuppa']
  },
  {
    name: 'Basmati Rice',
    category: 'Grocery',
    basePrice: 14000,
    baseUnit: 'kg',
    baseQuantity: 1,
    translations: {
      ta: ['பாசுமதி அரிசி', 'அரிசி'],
      hi: ['बासमती चावल', 'चावल'],
      te: ['బాస్మతి బియ్యం', 'బియ్యం'],
      ml: ['ബസ്മതി അരി', 'അരി'],
      kn: ['ಬಾಸ್ಮತಿ ಅಕ್ಕಿ', 'ಅಕ್ಕಿ'],
      bn: ['বাসমতি চাল', 'চাল'],
      gu: ['બાસમતી ચોખા', 'ચોખા'],
      pa: ['ਬਾਸਮਤੀ ਚੌਲ', 'ਚੌਲ']
    },
    latinAliases: ['rice', 'basmati', 'arisi', 'chawal']
  },
  {
    name: 'Sugar',
    category: 'Grocery',
    basePrice: 5000,
    baseUnit: 'kg',
    baseQuantity: 1,
    translations: {
      ta: ['சர்க்கரை'],
      hi: ['चीनी'],
      te: ['చక్కెర'],
      ml: ['പഞ്ചസാര'],
      kn: ['ಸಕ್ಕರೆ'],
      bn: ['চিনি'],
      gu: ['ખાંડ'],
      pa: ['ਖੰਡ']
    },
    latinAliases: ['sugar', 'chini', 'sarkarai']
  },
  {
    name: 'Wheat Flour',
    category: 'Grocery',
    basePrice: 6000,
    baseUnit: 'kg',
    baseQuantity: 1,
    translations: {
      ta: ['கோதுமை மாவு', 'மாவு'],
      hi: ['गेहूं का आटा', 'आटा'],
      te: ['గోధుమ పిండి', 'పిండి'],
      ml: ['ഗോതമ്പ് പൊടി', 'മാവ്'],
      kn: ['ಗೋಧಿ ಹಿಟ್ಟು', 'ಹಿಟ್ಟು'],
      bn: ['গমের আটা', 'আটা'],
      gu: ['ઘઉંનો લોટ', 'લોટ'],
      pa: ['ਕਣਕ ਦਾ ਆਟਾ', 'ਆਟਾ']
    },
    latinAliases: ['atta', 'flour', 'wheat flour', 'maavu']
  },
  {
    name: 'Filter Coffee Powder',
    category: 'Beverages',
    basePrice: 22000,
    baseUnit: 'g',
    baseQuantity: 500,
    translations: {
      ta: ['காபி பொடி', 'காபி'],
      hi: ['कॉफ़ी पाउडर', 'कॉफ़ी'],
      te: ['కాఫీ పొడి', 'కాఫీ'],
      ml: ['കാപ്പിപ്പൊടി', 'കാപ്പി'],
      kn: ['ಕಾಫಿ ಪುಡಿ', 'ಕಾಫಿ'],
      bn: ['কফি পাউডার', 'কফি'],
      gu: ['કોફી પાવડર', 'કોફી'],
      pa: ['ਕੌਫੀ ਪਾਊਡਰ', 'ਕੌਫੀ']
    },
    latinAliases: ['coffee', 'filter coffee', 'kaapi']
  },
  {
    name: 'Tea Powder',
    category: 'Beverages',
    basePrice: 18000,
    baseUnit: 'g',
    baseQuantity: 500,
    translations: {
      ta: ['தேயிலை', 'டீ'],
      hi: ['चाय पत्ती', 'चाय'],
      te: ['టీ పొడి', 'టీ'],
      ml: ['ചായപ്പൊടി', 'ചായ'],
      kn: ['ಚಹಾ ಪುಡಿ', 'ಟೀ'],
      bn: ['চা পাতা', 'চা'],
      gu: ['ચા પાવડર', 'ચા'],
      pa: ['ਚਾਹ ਪੱਤੀ', 'ਚਾਹ']
    },
    latinAliases: ['tea', 'chai', 'theyilai']
  }
];

/** Flattens a product's regional names + Latin aliases into Product.keywords. */
export function keywordsFor(product: SeedProduct): string[] {
  const regional = Object.values(product.translations).flat();
  return [...new Set([...regional, ...product.latinAliases])];
}
