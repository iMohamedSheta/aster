import React from 'react'
import { translate } from './i18n'

/**
 * A thin JSX runtime that translates rendered UI strings before React sees
 * them. Keeping this at the runtime boundary means pages stay readable and
 * every label, placeholder, tooltip and table cell is covered, while values
 * used for logic (`value`, `status`, `name`, `className`, …) are untouched.
 */
const TEXT_PROPS = new Set([
  'children', 'title', 'description', 'hint', 'label', 'placeholder', 'eyebrow',
  'subtitle', 'message', 'caption', 'summary', 'detail', 'emptyText', 'helper',
  'tooltip', 'note', 'text', 'confirmLabel', 'cancelLabel', 'okLabel', 'heading',
  'body', 'errorText', 'successText', 'actionLabel', 'primaryLabel',
  'secondaryLabel', 'aria-label', 'aria-description', 'alt',
])

function translateChild(value: unknown): unknown {
  if (typeof value === 'string') return translate(value)
  if (Array.isArray(value)) return value.map(translateChild)
  return value
}

function translateProps(props: any): any {
  if (!props || typeof props !== 'object') return props
  let next: any = null
  for (const key of TEXT_PROPS) {
    const value = props[key]
    if (typeof value === 'string') {
      const out = translate(value)
      if (out !== value) {
        next ??= { ...props }
        next[key] = out
      }
    } else if (key === 'children' && Array.isArray(value)) {
      const out = translateChild(value)
      next ??= { ...props }
      next[key] = out
    }
  }
  return next ?? props
}

export const Fragment = React.Fragment

export function jsx(type: any, props: any, key?: any) {
  const next = translateProps(props)
  return key === undefined
    ? React.createElement(type, next)
    : React.createElement(type, { ...next, key })
}

export const jsxs = jsx

export function jsxDEV(type: any, props: any, key?: any, _isStatic?: boolean, _source?: any, _self?: any) {
  return key === undefined
    ? React.createElement(type, translateProps(props))
    : React.createElement(type, { ...translateProps(props), key })
}
