const fs = require('fs')
const missing = JSON.parse(fs.readFileSync('scripts/i18n-missing.json', 'utf8'))
const noise = /(?:^|[\s"])(?:flex|grid|block|inline|hidden|absolute|relative|shrink|truncate|min-w|max-w|w-|h-|p-|px-|py-|pt-|pb-|ps-|pe-|m-|mx-|my-|mt-|mb-|ms-|me-|gap-|space-|text-|bg-|border|rounded|shadow|ring|font-|leading-|tracking-|items-|justify-|self-|overflow-|z-|opacity-|transition|duration-|animate-|cursor-|select-|fill-|stroke-|table-head|quiet-label|field-label|card|btn|no-print|wails-)/
const datefmt = /^(?:[dMyHhmsSEZa:/.,\-\s]+)$/
const clean = missing.filter((k) => {
  if (!k || k.length < 3) return false
  if (datefmt.test(k)) return false
  if (noise.test(k)) return false
  if (/^[a-z0-9]+(?:[-_][a-z0-9]+)+$/.test(k)) return false
  if (/^[a-z][a-zA-Z0-9]*$/.test(k) && k.length < 12) return false
  if (/^\d/.test(k)) return false
  if (k === 'Aster' || k === 'Clinic') return false
  return true
})
console.log('clean total:', clean.length)
fs.writeFileSync('scripts/i18n-clean.json', JSON.stringify(clean, null, 2))
for (const k of clean) console.log(JSON.stringify(k))
