import { createI18n } from 'vue-i18n'
import type { BridgeAppLanguage } from '@/bridge/app'
import enUS from './locales/en-US'
import zhCN from './locales/zh-CN'

export const fallbackLocale = 'zh-CN'
export const supportedLocales = ['zh-CN', 'en-US'] as const

export type AppLocale = (typeof supportedLocales)[number]

export const i18n = createI18n({
  legacy: false,
  locale: resolveConfiguredLocale('system'),
  fallbackLocale,
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS,
  },
})

export function resolveConfiguredLocale(language: BridgeAppLanguage): AppLocale {
  if (isAppLocale(language)) {
    return language
  }

  const browserLanguage =
    typeof navigator === 'undefined' ? '' : navigator.language || navigator.languages?.[0] || ''
  const normalized = browserLanguage.toLowerCase()
  if (normalized.startsWith('zh')) {
    return 'zh-CN'
  }
  if (normalized.startsWith('en')) {
    return 'en-US'
  }
  return fallbackLocale
}

export function setI18nLocale(locale: AppLocale): void {
  i18n.global.locale.value = locale
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
  }
}

function isAppLocale(value: string): value is AppLocale {
  return supportedLocales.includes(value as AppLocale)
}
