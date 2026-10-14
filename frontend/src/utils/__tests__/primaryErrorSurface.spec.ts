import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { parse } from 'vue/compiler-sfc'

// Structural guard: discover every runtime file, not just the originally reported
// two toasts. Inspect expressions/aliases with TypeScript AST (including optional
// chains, casts, multiline expressions and local fallback helper returns).
export function unsafePrimaryErrors(text: string, name = 'fixture.ts'): string[] {
  const sf = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const failures = new Set<string>()
  function alias(n: ts.Identifier): ts.Expression | undefined {
    for (let scope: ts.Node | undefined = n.parent; scope; scope = scope.parent) {
      if (ts.isBlock(scope) || ts.isSourceFile(scope)) {
        for (const statement of scope.statements) {
          if (!ts.isVariableStatement(statement)) continue
          for (const declaration of statement.declarationList.declarations) {
            if (ts.isIdentifier(declaration.name) && declaration.name.text === n.text) return declaration.initializer
          }
        }
      }
      if (ts.isCatchClause(scope) && scope.variableDeclaration?.name.getText(sf) === n.text) return undefined
      if (ts.isFunctionLike(scope) && scope.parameters.some(p => p.name.getText(sf) === n.text)) return undefined
    }
  }
  const callee = (n: ts.CallExpression) => ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : n.expression.getText(sf)
  const sanitizers = new Set(['localizeApiErrorFallback', 'extractApiErrorMessage', 'extractI18nErrorMessage', 'buildAuthErrorMessage'])
  function raw(n: ts.Node, seen = new Set<string>()): boolean {
    if (ts.isCallExpression(n) && sanitizers.has(callee(n))) {
      // The primary fallback must not itself contain raw API copy.
      const fallback = n.arguments[callee(n) === 'extractI18nErrorMessage' ? 3 : 1]
      return !!fallback && raw(fallback, seen)
    }
    if (ts.isCallExpression(n)) {
      // Inspect data arguments, not a referenced function's declaration/name.
      // Local helper return fallbacks are audited separately by inspect().
      if (callee(n) === 'localizeQuotaDiagnostic') return false
      return n.arguments.some(argument => raw(argument, seen))
    }
    if (ts.isPropertyAccessExpression(n)) {
      // Reactive UI error state has already been assigned primary copy; do not
      // confuse composable.error.value with a backend error.error string.
      if (n.name.text === 'value') return false
      if (['message', 'detail', 'error', 'error_description'].includes(n.name.text)) return true
      return false
    }
    if (ts.isConditionalExpression(n) && n.condition.getText(sf).includes("=== 'ru'")) return raw(n.whenTrue, seen)
    if (ts.isIdentifier(n) && !seen.has(n.text)) {
      const value = alias(n)
      if (value) return raw(value, new Set([...seen, n.text]))
    }
    let found = false
    ts.forEachChild(n, c => { if (raw(c, seen)) found = true })
    return found
  }
  function gated(n: ts.Node): boolean {
    for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
      if (ts.isCallExpression(p) && sanitizers.has(callee(p))) return true
      if (ts.isConditionalExpression(p) && p.condition.getText(sf).includes("=== 'ru'")) return true
      if (ts.isFunctionLike(p) && 'body' in p && p.body) {
        const body = (p.body as ts.Node).getText(sf)
        if (body.includes("if (getLocale() === 'ru') return fallback")) return true
        if (body.includes("if (locale.value === 'ru')") && body.includes('return extractApiErrorMessage(error, fallback, undefined, locale.value)')) return true
      }
    }
    return false
  }
  function localized(n: ts.Node): boolean {
    if (ts.isCallExpression(n) && callee(n) === 't') return true
    if (ts.isIdentifier(n) && ['fallback', 'msg'].includes(n.text)) return true
    let yes = false
    ts.forEachChild(n, c => { if (localized(c)) yes = true })
    return yes
  }
  function hasSuccessSink(n: ts.Node): boolean {
    for (let p: ts.Node | undefined = n.parent; p && !ts.isStatement(p); p = p.parent) {
      if (ts.isCallExpression(p) && callee(p) === 'showSuccess') return true
    }
    return false
  }
  function hasRejectSink(n: ts.Node): boolean {
    for (let p: ts.Node | undefined = n.parent; p && !ts.isStatement(p); p = p.parent) {
      if (ts.isCallExpression(p) && callee(p) === 'reject') return true
    }
    return false
  }
  function verifiedException(n: ts.Node): boolean {
    // Plugin-authored notification content is not an API-error fallback. Only
    // the explicit ui.notify bridge case may preserve plugin-provided copy.
    for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
      if (ts.isCaseClause(p) && ts.isStringLiteral(p.expression) && p.expression.text === 'ui.notify') return true
      // A known account-test formatter's result is primary only on the branch
      // where it differs from the raw event. Unknown text uses primaryTestError.
      if (ts.isIfStatement(p) && p.elseStatement && n.getStart(sf) >= p.elseStatement.getStart(sf)) {
        if (ts.isBinaryExpression(p.expression) && p.expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
          && p.expression.right.getText(sf) === 'event.error'
          && ['localizedError', 'localizedEventError'].includes(p.expression.left.getText(sf))) return true
      }
    }
    return false
  }
  function inspect(n: ts.Node) {
    if (!gated(n) && !verifiedException(n)) {
      const fallbackChain = !hasSuccessSink(n) && !hasRejectSink(n) && ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.BarBarToken && raw(n) && localized(n.right)
      const sink = ts.isCallExpression(n) && callee(n) === 'showError' && n.arguments[0] && raw(n.arguments[0])
      const state = ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && /\w*(?:error|failure)\w*\.value$/i.test(n.left.getText(sf)) && raw(n.right)
      if (fallbackChain || sink || state) failures.add(`${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}: ${n.getText(sf)}`)
    }
    ts.forEachChild(n, inspect)
  }
  inspect(sf)
  return [...failures]
}

function runtimeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = join(dir, entry.name)
    if (entry.isDirectory()) return ['__tests__', 'locales', 'api', 'types'].includes(entry.name) ? [] : runtimeFiles(file)
    return /\.(vue|ts)$/.test(file) && !/\.(test|spec)\.ts$/.test(file) ? [file] : []
  })
}

describe('complete primary error fallback surface', () => {
  it('finds aliases, optional chains, casts, multiline fallbacks and transitive returns', () => {
    for (const source of [
      "app.showError(err?.message || t('common.error'))",
      "const text = (err as any).response?.data?.detail; app.showError(text || t('common.error'))",
      "function errorText(e: any, fallback: string) { return e.message\n || fallback }",
      "failure.value = result.error || t('common.error')",
      "app.showError(localizeApiErrorFallback(err.message, err.response.data.detail || t('common.error')))",
    ]) expect(unsafePrimaryErrors(source), source).not.toEqual([])
    expect(unsafePrimaryErrors("app.showError(localizeApiErrorFallback(err?.message, t('common.error')))" )).toEqual([])
  })
  it('has no ungated raw prose in runtime primary error chains', () => {
    const issues: string[] = []
    for (const file of runtimeFiles(join(process.cwd(), 'src'))) {
      const full = readFileSync(file, 'utf8')
      const descriptor = file.endsWith('.vue') ? parse(full).descriptor : undefined
      const text = descriptor ? (descriptor.scriptSetup || descriptor.script)?.content || '' : full
      for (const issue of unsafePrimaryErrors(text, file)) issues.push(`${relative(process.cwd(), file)}:${issue}`)
    }
    expect(issues).toEqual([])
  })
})
