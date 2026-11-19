/**
 * Per-device appearance preferences. These are deliberately local: two
 * computers in the same clinic may use different themes and accents, just as
 * they may use different interface languages.
 */
export type AccentId = 'copper' | 'cobalt' | 'plum' | 'rose' | 'amber' | 'slate'
export type RadiusId = 'sharp' | 'balanced' | 'round'
export type ElevationId = 'flat' | 'soft'
export type SidebarId = 'expanded' | 'compact'

export interface Accent {
  id: AccentId
  label: string
  swatch: string
}

export const ACCENTS: Accent[] = [
  { id: 'copper', label: 'Copper', swatch: '#a85833' },
  { id: 'cobalt', label: 'Cobalt', swatch: '#456487' },
  { id: 'plum', label: 'Plum', swatch: '#824684' },
  { id: 'rose', label: 'Rose', swatch: '#c42a54' },
  { id: 'amber', label: 'Amber', swatch: '#a26522' },
  { id: 'slate', label: 'Slate', swatch: '#4f6175' },
]

export const RADII: { id: RadiusId; label: string }[] = [
  { id: 'sharp', label: 'Crisp' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'round', label: 'Rounded' },
]

export const ELEVATIONS: { id: ElevationId; label: string; hint: string }[] = [
  { id: 'flat', label: 'Flat', hint: 'Rules only' },
  { id: 'soft', label: 'Soft', hint: 'Gentle lift' },
]

export const SIDEBARS: { id: SidebarId; label: string; hint: string }[] = [
  { id: 'expanded', label: 'Expanded', hint: 'Names and groups' },
  { id: 'compact', label: 'Compact', hint: 'Icons only' },
]

export interface Appearance {
  accent: AccentId
  grid: boolean
  radius: RadiusId
  elevation: ElevationId
  sidebar: SidebarId
}

const STORAGE_KEY = 'aster.appearance'

export const DEFAULT_APPEARANCE: Appearance = {
  accent: 'copper',
  grid: true,
  radius: 'balanced',
  elevation: 'soft',
  sidebar: 'expanded',
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback
}

export function readAppearance(): Appearance {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_APPEARANCE }
    const parsed = JSON.parse(raw)
    return {
      accent: oneOf(parsed?.accent, ACCENTS.map((a) => a.id), DEFAULT_APPEARANCE.accent),
      grid: typeof parsed?.grid === 'boolean' ? parsed.grid : DEFAULT_APPEARANCE.grid,
      radius: oneOf(parsed?.radius, RADII.map((r) => r.id), DEFAULT_APPEARANCE.radius),
      elevation: oneOf(parsed?.elevation, ELEVATIONS.map((e) => e.id), DEFAULT_APPEARANCE.elevation),
      sidebar: oneOf(parsed?.sidebar, SIDEBARS.map((s) => s.id), DEFAULT_APPEARANCE.sidebar),
    }
  } catch {
    return { ...DEFAULT_APPEARANCE }
  }
}

export function applyAppearance(value: Appearance) {
  const root = document.documentElement
  root.dataset.accent = value.accent
  root.dataset.grid = value.grid ? 'on' : 'off'
  root.dataset.radius = value.radius
  root.dataset.elevation = value.elevation
  root.dataset.sidebar = value.sidebar
}

export function persistAppearance(value: Appearance) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // A locked-down webview may refuse storage; the session still keeps the choice.
  }
}

export function accentSwatch(id: AccentId) {
  return ACCENTS.find((a) => a.id === id)?.swatch ?? ACCENTS[0].swatch
}
