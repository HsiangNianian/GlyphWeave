import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// Translation resources — each locale imports its own JSON file
import enTranslation from '../mui/en/translation.json'
import zhCNTranslation from '../mui/zh_CN/translation.json'

const resources = {
  en: { translation: enTranslation },
  zh: { translation: zhCNTranslation },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    detection: {
      order: ['navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
    load: 'languageOnly',
    interpolation: {
      escapeValue: false, // React already escapes
    },
  })

export default i18n
