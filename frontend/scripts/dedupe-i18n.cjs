const fs = require('fs')
const ts = require('typescript')

const file = 'src/lib/i18n-ar.ts'
const source = fs.readFileSync(file, 'utf8')
const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

let obj = null
function find(node) {
  if (
    ts.isVariableDeclaration(node) &&
    ts.isIdentifier(node.name) &&
    node.name.text === 'AR' &&
    ts.isObjectLiteralExpression(node.initializer)
  ) {
    obj = node.initializer
  }
  ts.forEachChild(node, find)
}
find(sf)
if (!obj) throw new Error('AR object not found')

const seen = new Set()
const removals = []
for (const prop of obj.properties) {
  const name = ts.isPropertyAssignment(prop)
    ? ts.isStringLiteral(prop.name) || ts.isNoSubstitutionTemplateLiteral(prop.name)
      ? prop.name.text
      : prop.name.getText(sf)
    : prop.getText(sf)
  if (seen.has(name)) {
    removals.push(prop)
    console.log('duplicate:', name)
  } else {
    seen.add(name)
  }
}

let out = source
for (const prop of removals.sort((a, b) => b.getStart(sf) - a.getStart(sf))) {
  let start = prop.getFullStart()
  let end = prop.getEnd()
  // remove the whole line when the property occupies it alone
  const before = out.lastIndexOf('\n', start - 1)
  const lineStart = before + 1
  const after = out.indexOf('\n', end)
  const lineEnd = after === -1 ? out.length : after + 1
  if (out.slice(lineStart, start).trim() === '' && out.slice(end, lineEnd).trim() === '') {
    start = lineStart
    end = lineEnd
  }
  out = out.slice(0, start) + out.slice(end)
}

fs.writeFileSync(file, out)
console.log('removed', removals.length)
