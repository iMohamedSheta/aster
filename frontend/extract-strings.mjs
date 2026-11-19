import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2] || '.'
const files = []
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.tsx?$/.test(e.name) && !e.name.endsWith('.d.ts')) files.push(p)
  }
}
walk(path.join(root, 'src'))

const textAttrs = new Set([
  'title', 'placeholder', 'aria-label', 'aria-description', 'alt', 'label',
  'description', 'hint', 'eyebrow', 'subtitle', 'message', 'summary', 'caption',
  'confirmLabel', 'cancelLabel', 'emptyText', 'helper', 'tooltip', 'note', 'text',
])
const textKeys = new Set([...textAttrs, 'detail', 'heading', 'body', 'empty', 'action', 'sub', 'help', 'okLabel', 'errorText', 'successText'])

const out = new Map()
function add(s, file, node) {
  s = s.replace(/\s+/g, ' ').trim()
  if (!s || !/[A-Za-z]/.test(s)) return
  if (!out.has(s)) out.set(s, [])
  const { line } = ts.getLineAndCharacterOfPosition(node.getSourceFile(), node.getStart())
  const entry = `${path.relative(root, file)}:${line + 1}`
  const arr = out.get(s)
  if (!arr.includes(entry) && arr.length < 4) arr.push(entry)
}

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  function visit(node) {
    if (ts.isJsxText(node)) {
      add(node.text, file, node)
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sf)
      const init = node.initializer
      if (init && ts.isStringLiteral(init) && textAttrs.has(name)) add(init.text, file, init)
    } else if (ts.isStringLiteral(node)) {
      const parent = node.parent
      const isTextProp = ts.isPropertyAssignment(parent) && textKeys.has(parent.name.getText(sf).replace(/['"]/g, ''))
      const isToast = ts.isCallExpression(parent) && /toast\.(success|error|info|warning|push)$/.test(parent.expression.getText(sf))
      const isDialog = ts.isCallExpression(parent) && /^(confirm|alert)$/.test(parent.expression.getText(sf))
      if (isTextProp || isToast || isDialog) add(node.text, file, node)
    } else if (ts.isTemplateExpression(node)) {
      // only capture when used in JSX or in a text prop
      let p = node.parent
      let interesting = false
      while (p && !ts.isStatement(p)) {
        if (ts.isJsxExpression(p)) { interesting = true; break }
        if (ts.isPropertyAssignment(p) && textKeys.has(p.name.getText(sf).replace(/['"]/g, ''))) { interesting = true; break }
        if (ts.isCallExpression(p) && /toast\./.test(p.expression.getText(sf))) { interesting = true; break }
        p = p.parent
      }
      if (interesting) {
        let text = node.head.text
        for (const span of node.templateSpans) text += '${…}' + span.literal.text
        add(text, file, node)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
}

const sorted = [...out.entries()].sort((a, b) => a[0].localeCompare(b[0]))
console.log(JSON.stringify(Object.fromEntries(sorted), null, 2))
console.error(`${sorted.length} strings`)
