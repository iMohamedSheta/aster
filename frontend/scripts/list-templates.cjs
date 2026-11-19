const fs = require('fs')
const path = require('path')
const ts = require('typescript')

const root = path.resolve('src')
function walk(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(e.name)) out.push(full)
  }
  return out
}

const noise = /(?:^|[\s"])(?:flex|grid|block|inline|hidden|absolute|relative|shrink|truncate|min-w|max-w|w-|h-|p-|px-|py-|pt-|pb-|ps-|pe-|m-|mx-|my-|mt-|mb-|ms-|me-|gap-|space-|text-|bg-|border|rounded|shadow|ring|font-|leading-|tracking-|items-|justify-|self-|overflow-|z-|opacity-|transition|duration-|animate-|cursor-|select-|fill-|stroke-|card|no-print)/

for (const file of walk(root)) {
  if (file.endsWith('i18n-ar.ts')) continue
  const source = fs.readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  function visit(node, inJsx) {
    if (ts.isTemplateExpression(node) && inJsx) {
      const text = node.getText(sf)
      if (/[A-Za-z]{2}/.test(text) && /\s/.test(text) && !noise.test(text) && !/^(?:https?|data):/.test(text)) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
        console.log(`${path.relative(process.cwd(), file)}:${line}  ${text.replace(/\s+/g, ' ')}`)
      }
    }
    const nextJsx = inJsx || ts.isJsxExpression(node) || ts.isJsxAttribute(node)
    ts.forEachChild(node, (c) => visit(c, nextJsx))
  }
  visit(sf, false)
}
