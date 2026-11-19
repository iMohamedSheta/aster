import type { UpdateStatus } from './types'

export function updateStatusLabel(status: UpdateStatus): string {
  switch (status) {
    case 'checking': return 'Checking'
    case 'available': return 'Update available'
    case 'downloading': return 'Downloading'
    case 'ready': return 'Ready to install'
    case 'installing': return 'Restarting'
    case 'up-to-date': return 'Up to date'
    case 'error': return 'Check failed'
    case 'unsupported': return 'Not available'
    default: return 'Not checked'
  }
}

export function updateStatusTone(status: UpdateStatus): 'neutral' | 'info' | 'success' | 'warning' | 'error' {
  switch (status) {
    case 'available':
    case 'downloading':
    case 'installing':
      return 'info'
    case 'ready':
    case 'up-to-date':
      return 'success'
    case 'error':
      return 'error'
    case 'unsupported':
      return 'warning'
    default:
      return 'neutral'
  }
}
