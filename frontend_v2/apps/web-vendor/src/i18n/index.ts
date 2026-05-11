import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enConversations from './locales/en/conversations.json';
import enCommon from './locales/en/common.json';
import taConversations from './locales/ta/conversations.json';
import taCommon from './locales/ta/common.json';
import hiConversations from './locales/hi/conversations.json';
import hiCommon from './locales/hi/common.json';

export const SUPPORTED_LANGUAGES = ['en', 'ta', 'hi'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES as readonly string[] as string[],
    ns: ['common', 'conversations'],
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'chatlogix.lang'
    },
    resources: {
      en: { common: enCommon, conversations: enConversations },
      ta: { common: taCommon, conversations: taConversations },
      hi: { common: hiCommon, conversations: hiConversations }
    }
  });

export default i18n;
