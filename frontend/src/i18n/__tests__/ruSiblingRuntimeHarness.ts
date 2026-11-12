import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import * as Vue from 'vue'
import { compileTemplate, parse } from 'vue/compiler-sfc'
import ts from 'typescript'

// SFC parse already supplies the untransformed Vue template AST. Reuse it
// rather than depending on a non-hoisted @vue/compiler-dom package.
type TemplateAst = NonNullable<NonNullable<ReturnType<typeof parse>['descriptor']['template']>['ast']>
type TemplateChildNode = TemplateAst['children'][number]
export type ElementNode = Extract<TemplateChildNode, { type: 1 }>
export const NodeTypes = { ELEMENT: 1, SIMPLE_EXPRESSION: 4, INTERPOLATION: 5, DIRECTIVE: 7 } as const

const descriptors = new Map<string, ReturnType<typeof parse>['descriptor']>()
function descriptor(path: string) {
  if (!descriptors.has(path)) {
    descriptors.set(path, parse(readFileSync(resolve(process.cwd(), 'src', path), 'utf8')).descriptor)
  }
  return descriptors.get(path)!
}

export function actualScript(path: string) {
  return ts.createSourceFile(path, descriptor(path).scriptSetup!.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function evaluate(code: string, scope: Record<string, unknown>, result: string): unknown {
  const output = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  return new Function(...Object.keys(scope), `${output}\nreturn ${result}`)(...Object.values(scope))
}

export function actualHandler(path: string, name: string, scope: Record<string, unknown>) {
  const file = actualScript(path)
  const node = file.statements.find(statement =>
    (ts.isFunctionDeclaration(statement) && statement.name?.text === name) ||
    (ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration =>
      ts.isIdentifier(declaration.name) && declaration.name.text === name)),
  )
  if (!node) throw new Error(`Missing handler ${path}:${name}`)
  return evaluate(node.getText(file), scope, name) as () => Promise<void>
}

// Project only the owned fields from the real form initializer / save payload.
// No initializer, fallback, binding or payload expressions are copied into tests.
export function actualObjectFields(path: string, variable: string, fields: string[], scope: Record<string, unknown>, inside?: string) {
  const file = actualScript(path)
  let root: ts.Node = file
  if (inside) {
    const fn = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === inside)
    if (!fn) throw new Error(`Missing function ${inside}`)
    root = fn
  }
  let object: ts.ObjectLiteralExpression | undefined
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === variable && node.initializer) {
      const initializer = node.initializer
      const candidate = ts.isCallExpression(initializer) ? initializer.arguments[0] : initializer
      if (candidate && ts.isObjectLiteralExpression(candidate)) object = candidate
    }
    ts.forEachChild(node, visit)
  }
  visit(root)
  if (!object) throw new Error(`Missing object ${path}:${variable}`)
  const properties = object.properties.filter(property => property.name && fields.includes(property.name.getText(file)))
  if (properties.length !== fields.length) throw new Error(`Missing fields ${fields.join(', ')}`)
  return evaluate(`const selected = {${properties.map(property => property.getText(file)).join(',')}}`, scope, 'selected') as Record<string, string>
}

export function actualElements(path: string, predicate: (node: ElementNode) => boolean) {
  const nodes: ElementNode[] = []
  function visit(node: TemplateChildNode) {
    if (node.type !== NodeTypes.ELEMENT) return
    if (predicate(node)) nodes.push(node)
    node.children.forEach(visit)
  }
  descriptor(path).template!.ast!.children.forEach(visit)
  return nodes
}

export function hasBinding(node: ElementNode, directive: string, expression: string) {
  return node.props.some(property => property.type === NodeTypes.DIRECTIVE && property.name === directive &&
    property.exp?.type === NodeTypes.SIMPLE_EXPRESSION && property.exp.content === expression)
}

// Render compiler-selected actual template nodes, with Vue's real compiler and
// DOM renderer, without starting unrelated page APIs, timers or payment SDKs.
export function renderActual(nodes: ElementNode[], scope: Record<string, unknown>) {
  const compiled = compileTemplate({ source: `<div>${nodes.map(node => node.loc.source).join('')}</div>`, filename: 'actual-sibling-template.vue', id: 'ru-sibling-runtime' })
  if (compiled.errors.length) throw new Error(String(compiled.errors))
  const module = { exports: {} as { render?: Vue.RenderFunction } }
  const code = ts.transpileModule(compiled.code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
  new Function('require', 'module', 'exports', code)((name: string) => {
    if (name !== 'vue') throw new Error(`Unexpected template import: ${name}`)
    return Vue
  }, module, module.exports)
  return mount(Vue.defineComponent({ setup: () => scope, render: module.exports.render }))
}
