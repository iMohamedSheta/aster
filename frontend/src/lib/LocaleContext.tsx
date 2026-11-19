import {
  createContext, useCallback, useContext, useMemo, useState, type ReactNode,
} from 'react'
import {
  applyLocale, directionFor, initialLocale, translate, type Locale,
} from './i18n'

interface LocaleValue {
  locale: Locale
  dir: 'ltr' | 'rtl'
  isRTL: boolean
  setLocale: (locale: Locale) => void
  t: (text: string) => string
}

const LocaleContext = createContext<LocaleValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale())

  const setLocale = useCallback((next: Locale) => {
    applyLocale(next)
    setLocaleState(next)
  }, [])

  const value = useMemo<LocaleValue>(() => ({
    locale,
    dir: directionFor(locale),
    isRTL: locale === 'ar',
    setLocale,
    t: translate,
  }), [locale, setLocale])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider')
  return ctx
}
