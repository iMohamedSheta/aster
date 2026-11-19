import { useId } from 'react'
import { cn } from '../lib/format'

/**
 * The Aster mark: an eight-point star cut into a deep ink tile, with a
 * copper centre. Deliberately simple so it stays crisp at 20px in the title
 * bar and reads clearly on printed prescriptions. The inverse tile is used
 * on the ink spine.
 */
export function AsterMark({
  size = 26, className, inverse = false,
}: { size?: number; className?: string; inverse?: boolean }) {
  // SVG ids are document-global. A unique id keeps the inverse tile light when
  // normal marks are on the same page, as they are in the title bar and About.
  const tileID = `aster-tile-${useId().replace(/:/g, '')}`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <rect width="28" height="28" rx="7" fill={`url(#${tileID})`} />
      <rect x="0.5" y="0.5" width="27" height="27" rx="6.5" stroke={inverse ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.10)'} />
      <g stroke={inverse ? '#101820' : '#f7f4ef'} strokeWidth="2.05" strokeLinecap="round">
        <path d="M14 6.1v15.8" />
        <path d="M6.1 14h15.8" />
        <path d="m8.4 8.4 11.2 11.2" />
        <path d="m19.6 8.4-11.2 11.2" />
      </g>
      <circle cx="14" cy="14" r="1.75" fill={inverse ? '#a85833' : '#d9a06f'} />
      <defs>
        <linearGradient id={tileID} x1="2" y1="1" x2="26" y2="28" gradientUnits="userSpaceOnUse">
          {inverse ? (
            <>
              <stop stopColor="#fbf8f2" />
              <stop offset="1" stopColor="#e9e2d6" />
            </>
          ) : (
            <>
              <stop stopColor="#303d4e" />
              <stop offset="1" stopColor="#161e28" />
            </>
          )}
        </linearGradient>
      </defs>
    </svg>
  )
}

export function Wordmark({ compact = false, light = false }: { compact?: boolean; light?: boolean }) {
  return (
    <span className="flex items-baseline gap-1.5 leading-none">
      <span className={cn('text-[15px] font-semibold tracking-[-0.02em]', light ? 'text-white' : 'text-ink')}>Aster</span>
      {!compact && (
        <span className={cn('text-[9px] font-semibold uppercase tracking-[0.2em]', light ? 'text-accent-300' : 'text-faint')}>Clinic</span>
      )}
    </span>
  )
}

export function LogoLockup({ compact = false, size = 27, light = false }: { compact?: boolean; size?: number; light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <AsterMark size={size} inverse={light} />
      <Wordmark compact={compact} light={light} />
    </span>
  )
}
