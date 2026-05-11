import { BASE_EXTRACTION_PROMPT } from './base.js';
import { RESTAURANT_APPENDIX } from './restaurant.js';
import { GROCERY_APPENDIX } from './grocery.js';
import { BAKERY_APPENDIX } from './bakery.js';
import { GARMENT_APPENDIX } from './garment.js';
import { ELECTRONICS_APPENDIX } from './electronics.js';
import { DEFAULT_APPENDIX } from './default.js';

const REGISTRY: Record<string, string> = {
  restaurant: RESTAURANT_APPENDIX,
  grocery: GROCERY_APPENDIX,
  bakery: BAKERY_APPENDIX,
  garment: GARMENT_APPENDIX,
  apparel: GARMENT_APPENDIX,
  electronics: ELECTRONICS_APPENDIX,
  appliance: ELECTRONICS_APPENDIX
};

export function getExtractionPrompt(category?: string, languageHint?: 'ta' | 'hi' | 'en'): string {
  const key = (category ?? '').trim().toLowerCase();
  const appendix = REGISTRY[key] ?? DEFAULT_APPENDIX;
  const langNote = languageHint
    ? `\nMERCHANT LANGUAGE HINT: Expect printed text primarily in "${languageHint}". Translate only when asked.`
    : '';
  return `${BASE_EXTRACTION_PROMPT}${appendix}${langNote}`;
}
