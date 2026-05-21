import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import enAuth from './locales/en/auth.json'
import enCommon from './locales/en/common.json'
import enErrors from './locales/en/errors.json'
import enExport from './locales/en/export.json'
import enSettings from './locales/en/settings.json'
import enSpaces from './locales/en/spaces.json'
import zhAuth from './locales/zh-CN/auth.json'
import zhCommon from './locales/zh-CN/common.json'
import zhErrors from './locales/zh-CN/errors.json'
import zhExport from './locales/zh-CN/export.json'
import zhSettings from './locales/zh-CN/settings.json'
import zhSpaces from './locales/zh-CN/spaces.json'

export type AppLocale = 'en' | 'zh-CN'

export const defaultLocale: AppLocale = 'en'

const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    spaces: enSpaces,
    export: enExport,
    settings: enSettings,
    errors: enErrors,
  },
  'zh-CN': {
    common: zhCommon,
    auth: zhAuth,
    spaces: zhSpaces,
    export: zhExport,
    settings: zhSettings,
    errors: zhErrors,
  },
} as const

void i18n.use(initReactI18next).init({
  resources,
  lng: defaultLocale,
  fallbackLng: 'en',
  supportedLngs: ['en', 'zh-CN'],
  defaultNS: 'common',
  ns: ['common', 'auth', 'spaces', 'export', 'settings', 'errors'],
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
})

export default i18n

export async function setAppLocale(locale: AppLocale): Promise<void> {
  await i18n.changeLanguage(locale)
}

export function normalizeLocale(value: string | undefined | null): AppLocale {
  return value === 'zh-CN' ? 'zh-CN' : 'en'
}
