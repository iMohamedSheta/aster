import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = path.resolve('src')
const arFile = path.join(root, 'lib', 'i18n-ar.ts')

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) out.push(full)
  }
  return out
}

function normalize(text) {
  return String(text).replace(/\s+/g, ' ').trim()
}

// Existing Arabic keys.
const arSource = ts.createSourceFile(arFile, fs.readFileSync(arFile, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const arKeys = new Set()
let arObject = null
function findAr(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'AR' && ts.isObjectLiteralExpression(node.initializer)) {
    arObject = node.initializer
  }
  ts.forEachChild(node, findAr)
}
findAr(arSource)
if (arObject) {
  for (const prop of arObject.properties) {
    if (!ts.isPropertyAssignment(prop)) continue
    const n = prop.name
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) arKeys.add(normalize(n.text))
    else if (ts.isIdentifier(n)) arKeys.add(normalize(n.text))
  }
}

const TEXT_PROPS = new Set([
  'children', 'title', 'description', 'hint', 'label', 'placeholder', 'eyebrow',
  'subtitle', 'message', 'caption', 'summary', 'detail', 'emptyText', 'helper',
  'tooltip', 'note', 'text', 'confirmLabel', 'cancelLabel', 'okLabel', 'heading',
  'body', 'errorText', 'successText', 'actionLabel', 'primaryLabel',
  'secondaryLabel', 'aria-label', 'aria-description', 'alt',
])

const LABEL_KEYS = new Set([
  'label', 'title', 'description', 'hint', 'subtitle', 'message', 'caption',
  'summary', 'detail', 'emptyText', 'helper', 'tooltip', 'note', 'text',
  'confirmLabel', 'cancelLabel', 'okLabel', 'heading', 'body', 'errorText',
  'successText', 'actionLabel', 'primaryLabel', 'secondaryLabel', 'placeholder',
  'eyebrow', 'name', 'unit', 'empty', 'error',
])

const IGNORE = /^(?:[a-z0-9-]+:)?(?:flex|grid|block|inline|hidden|absolute|relative|sticky|fixed|w-|h-|min-|max-|p-|px-|py-|pt-|pb-|ps-|pe-|m-|mx-|my-|mt-|mb-|ms-|me-|gap-|space-|text-|bg-|border|rounded|shadow|ring|font-|leading-|tracking-|items-|justify-|content-|self-|overflow-|z-|opacity-|transition|duration-|ease-|animate-|origin-|scale-|translate-|rotate-|cursor-|select-|pointer-|fill-|stroke-|from-|via-|to-|backdrop-|sr-only|no-print|wails-)/

function isLikelyUi(core) {
  if (!core || core.length > 240) return false
  if (!/[A-Za-z]/.test(core)) return false
  if (core === 'true' || core === 'false' || core === 'null' || core === 'undefined') return false
  if (/^(?:https?:|data:|mailto:|rgb|hsl|var\(|#|\/|\.\/|\\)/.test(core)) return false
  if (/[{};]|=>|<\/?[a-z]|\\n|\\t/.test(core)) return false
  if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(core)) return false // kebab tokens
  if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(core)) return false // snake_case
  if (/^[a-z]+[A-Z][A-Za-z0-9]*$/.test(core)) return false // camelCase
  if (/^[A-Z0-9_]+$/.test(core) && !/[ ]/.test(core)) return false // CONSTANTS
  if (IGNORE.test(core)) return false
  if (core.includes('${')) return false
  // A single lowercase technical word is usually a key, status or field name.
  if (/^[a-z][a-z0-9]*$/.test(core)) {
    const keep = new Set([
      'all', 'active', 'inactive', 'present', 'absent', 'mild', 'moderate', 'severe',
      'signed', 'draft', 'paid', 'pending', 'void', 'none', 'other', 'unknown',
      'male', 'female', 'today', 'week', 'month', 'agenda', 'overview', 'timeline',
      'search', 'cancel', 'save', 'close', 'delete', 'edit', 'print', 'export',
    ])
    if (!keep.has(core.toLowerCase())) return false
  }
  if (/\b(?:className|href|onClick|useState|useQuery|useMutation|api\.)\b/.test(core)) return false
  if (core.startsWith('.') || core.endsWith('.') && core.length < 4) return false
  return true
}

const found = new Map()

function add(text, file, line, kind) {
  const core = normalize(text)
  if (!isLikelyUi(core)) return
  if (!found.has(core)) found.set(core, { files: new Set(), kinds: new Set(), count: 0 })
  const row = found.get(core)
  row.files.add(`${path.relative(process.cwd(), file)}:${line}`)
  row.kinds.add(kind)
  row.count++
}

function lineOf(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
}

for (const file of walk(root)) {
  if (file.endsWith('i18n-ar.ts')) continue
  const source = fs.readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)

  function visit(node, inJsxExpression = false, inFunctionCall = null) {
    if (ts.isJsxText(node)) {
      add(node.getText(sf), file, lineOf(sf, node), 'jsx-text')
    }
    if (ts.isJsxAttribute(node) && node.initializer) {
      const name = node.name.getText(sf)
      if (TEXT_PROPS.has(name)) {
        if (ts.isStringLiteral(node.initializer)) add(node.initializer.text, file, lineOf(sf, node.initializer), `prop:${name}`)
      }
    }
    if (ts.isPropertyAssignment(node)) {
      const name = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : ''
      if (LABEL_KEYS.has(name)) {
        if (ts.isStringLiteral(node.initializer)) add(node.initializer.text, file, lineOf(sf, node.initializer), `key:${name}`)
        if (ts.isNoSubstitutionTemplateLiteral(node.initializer)) add(node.initializer.text, file, lineOf(sf, node.initializer), `key:${name}`)
      }
    }
    if (ts.isStringLiteral(node) && inJsxExpression) {
      add(node.text, file, lineOf(sf, node), 'jsx-expression')
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf)
      if (/(?:^|\.)(?:success|error|info|warning|warn|message|alert)$/.test(callee) || /^setError$/.test(callee) || /(?:^|\.)translate$/.test(callee) || /(?:^|\.)t$/.test(callee)) {
        for (const arg of node.arguments) {
          if (ts.isStringLiteral(arg)) add(arg.text, file, lineOf(sf, arg), `call:${callee}`)
        }
      }
    }
    const nextInJsx = inJsxExpression || ts.isJsxExpression(node)
    ts.forEachChild(node, (child) => visit(child, nextInJsx, node))
  }
  visit(sf)
}

const missing = [...found.entries()]
  .filter(([key]) => !arKeys.has(key))
  .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))

const used = [...found.entries()]
  .filter(([key]) => arKeys.has(key))
  .sort((a, b) => a[0].localeCompare(b[0]))

let output = `# Missing Arabic keys\n\n`
output += `Total extracted UI strings: ${found.size}\n`
output += `Already translated: ${used.length}\n`
output += `Missing: ${missing.length}\n\n`
for (const [key, meta] of missing) {
  output += `- ${JSON.stringify(key)}  \n  ${[...meta.kinds].join(', ')} · ${[...meta.files].slice(0, 4).join(' · ')}\n`
}
output += `\n\n# Unused catalog keys\n\n`
const unused = [...arKeys].filter((key) => !found.has(key)).sort()
for (const key of unused) output += `- ${JSON.stringify(key)}\n`

fs.writeFileSync(path.resolve('scripts/i18n-report.md'), output)
fs.writeFileSync(path.resolve('scripts/i18n-missing.json'), JSON.stringify(missing.map(([k]) => k), null, 2))
console.log(`extracted ${found.size} · translated ${used.length} · missing ${missing.length} · unused ${unused.length}`)
console.log('wrote scripts/i18n-report.md')
