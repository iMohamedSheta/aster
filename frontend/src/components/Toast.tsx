import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Info, X, AlertTriangle, XCircle } from 'lucide-react'
import { cn } from '../lib/format'
import { useLocale } from '../lib/LocaleContext'
import { translate } from '../lib/i18n'

type ToastTone = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: number
  tone: ToastTone
  title: string
  detail?: string
}

interface ToastApi {
  push: (tone: ToastTone, title: string, detail?: string) => void
  success: (title: string, detail?: string) => void
  error: (title: string, detail?: string) => void
  info: (title: string, detail?: string) => void
  warning: (title: string, detail?: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

let nextId = 1

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  // Re-render open toasts when the interface language changes.
  useLocale()

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((tone: ToastTone, title: string, detail?: string) => {
    const id = nextId++
    setItems((prev) => [...prev.slice(-3), { id, tone, title, detail }])
    window.setTimeout(() => remove(id), tone === 'error' ? 6500 : 4200)
  }, [remove])

  const api = useMemo<ToastApi>(() => ({
    push,
    success: (title, detail) => push('success', title, detail),
    error: (title, detail) => push('error', title, detail),
    info: (title, detail) => push('info', title, detail),
    warning: (title, detail) => push('warning', title, detail),
  }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="no-print pointer-events-none fixed bottom-5 end-5 z-[80] flex w-[min(380px,calc(100vw-40px))] flex-col gap-2">
          {items.map((t) => {
            const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? XCircle : t.tone === 'warning' ? AlertTriangle : Info
            return (
              <div
                key={t.id}
                className="pointer-events-auto animate-slide-up rounded-xl border border-line bg-surface p-3.5 shadow-lift"
              >
                <div className="flex items-start gap-2.5">
                  <Icon
                    size={17}
                    className={cn(
                      'mt-0.5 shrink-0',
                      t.tone === 'success' && 'text-emerald-600',
                      t.tone === 'error' && 'text-rose-600',
                      t.tone === 'warning' && 'text-amber-600',
                      t.tone === 'info' && 'text-sky-600',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold leading-5 text-ink">{translate(t.title)}</div>
                    {t.detail && <div className="mt-0.5 whitespace-pre-wrap text-[11.5px] leading-4 text-muted">{translate(t.detail)}</div>}
                  </div>
                  <button
                    onClick={() => remove(t.id)}
                    className="-me-1 -mt-1 rounded-md p-1 text-faint transition hover:bg-elevated hover:text-ink"
                    aria-label="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
