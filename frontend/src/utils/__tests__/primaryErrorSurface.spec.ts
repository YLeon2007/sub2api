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
  const compact = (n: ts.Node) => n.getText(sf).replace(/\s+/g, '')
  function russianCondition(n: ts.Expression): boolean {
    return ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
      && ts.isStringLiteral(n.right) && n.right.text === 'ru'
      && ['locale.value', 'getLocale()', 'locale.value.toLowerCase().split(/[-_]/)[0]'].includes(compact(n.left))
  }
  function verifiedFallbackCall(n: ts.Node, source: string): boolean {
    if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression) || n.expression.text !== 'localizeApiErrorFallback' || n.arguments.length !== 3) return false
    const [input, fallback, locale] = n.arguments
    return compact(input) === source && compact(locale) === 'locale.value'
      && ts.isCallExpression(fallback) && ts.isIdentifier(fallback.expression) && fallback.expression.text === 't'
      && fallback.arguments.length === 1 && ts.isStringLiteral(fallback.arguments[0]) && !!fallback.arguments[0].text
  }
  function verifiedLocalWrapper(n: ts.CallExpression): boolean {
    if (!ts.isIdentifier(n.expression)) return false
    const declaration = alias(n.expression)
    return !!declaration && ts.isArrowFunction(declaration) && declaration.parameters.length === 1
      && ts.isIdentifier(declaration.parameters[0].name)
      && verifiedFallbackCall(declaration.body, declaration.parameters[0].name.text)
  }
  function verifiedEarlyRussianReturn(n: ts.Node): ts.IfStatement | undefined {
    if (!ts.isFunctionLike(n) || !('body' in n) || !n.body || !ts.isBlock(n.body)) return undefined
    let first = n.body.statements[0]
    let boundFallback = n.parameters.some(parameter => ts.isIdentifier(parameter.name) && parameter.name.text === 'fallback')
    // buildAuthErrorMessage binds only options.fallback before its RU return.
    // Permit that exact pure parameter destructuring, not arbitrary initializers,
    // calls, default values, or statements that may already expose a primary sink.
    if (first && ts.isVariableStatement(first) && first.declarationList.flags & ts.NodeFlags.Const) {
      const declarations = first.declarationList.declarations
      const declaration = declarations.length === 1 ? declarations[0] : undefined
      if (declaration && ts.isObjectBindingPattern(declaration.name) && declaration.name.elements.length === 1
        && declaration.initializer && ts.isIdentifier(declaration.initializer)
        && declaration.initializer.text === n.parameters[1]?.name.getText(sf)) {
        const binding = declaration.name.elements[0]
        if (ts.isIdentifier(binding.name) && binding.name.text === 'fallback' && !binding.propertyName && !binding.initializer && !binding.dotDotDotToken) {
          boundFallback = true
          first = n.body.statements[1]
        }
      }
    }
    if (!first || !ts.isIfStatement(first) || first.elseStatement || !russianCondition(first.expression)) return undefined
    const branch = first.thenStatement
    const statement = ts.isBlock(branch) && branch.statements.length === 1 ? branch.statements[0] : branch
    if (!ts.isReturnStatement(statement) || !statement.expression) return undefined
    if (ts.isIdentifier(statement.expression) && statement.expression.text === 'fallback' && boundFallback) return first
    if (!ts.isCallExpression(statement.expression)) return undefined
    const call = statement.expression
    const verified = ts.isIdentifier(call.expression) && call.expression.text === 'extractApiErrorMessage' && call.arguments.length === 4
      && call.arguments[0].getText(sf) === n.parameters[0]?.name.getText(sf)
      && call.arguments[1].getText(sf) === n.parameters[1]?.name.getText(sf)
      && call.arguments[2].getText(sf) === 'undefined' && compact(call.arguments[3]) === 'locale.value'
    return verified ? first : undefined
  }
  function verifiedThrowIntermediate(n: ts.Node): boolean {
    // Raw parsing is not a primary sink when the immediately following throw
    // passes this exact binding through a literal, active-locale fallback.
    for (let p: ts.Node | undefined = n; p && !ts.isStatement(p); p = p.parent) {
      if (!ts.isVariableDeclaration(p) || !ts.isIdentifier(p.name)) continue
      const list = p.parent
      const statement = list.parent
      if (!ts.isVariableDeclarationList(list) || list.declarations.length !== 1 || !ts.isVariableStatement(statement) || !ts.isBlock(statement.parent)) return false
      const next = statement.parent.statements[statement.parent.statements.indexOf(statement) + 1]
      if (!next || !ts.isThrowStatement(next) || !next.expression || !ts.isNewExpression(next.expression)) return false
      const expression = next.expression
      return ts.isIdentifier(expression.expression) && expression.expression.text === 'Error'
        && expression.arguments?.length === 1 && verifiedFallbackCall(expression.arguments[0], p.name.text)
    }
    return false
  }
  function raw(n: ts.Node, seen = new Set<string>()): boolean {
    if (ts.isCallExpression(n) && sanitizers.has(callee(n))) {
      // The primary fallback must not itself contain raw API copy.
      const fallback = n.arguments[callee(n) === 'extractI18nErrorMessage' ? 3 : 1]
      return !!fallback && raw(fallback, seen)
    }
    if (ts.isCallExpression(n)) {
      // Inspect data arguments, not a referenced function's declaration/name.
      // Local helper return fallbacks are audited separately by inspect().
      if (verifiedLocalWrapper(n)) return false
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
    if (ts.isConditionalExpression(n) && russianCondition(n.condition)) return raw(n.whenTrue, seen)
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
      if (ts.isConditionalExpression(p) && russianCondition(p.condition) && n.getStart(sf) >= p.whenFalse.getStart(sf)) return true
      if (ts.isFunctionLike(p) && 'body' in p && p.body) {
        const earlyReturn = verifiedEarlyRussianReturn(p)
        if (earlyReturn && n.getStart(sf) >= earlyReturn.end) return true
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
      const fallbackChain = !hasSuccessSink(n) && !hasRejectSink(n) && !verifiedThrowIntermediate(n) && ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.BarBarToken && raw(n) && localized(n.right)
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
  it.each([
    "function f(err: any, fallback: string) { if (getLocale() === 'ru') return fallback; return err.message || fallback }",
    "function f(err: any, options: { fallback: string }) { const { fallback } = options; if (getLocale() === 'ru') return fallback; return err.message || fallback }",
    "const primaryTestError = (message: string) => localizeApiErrorFallback(message, t('admin.accounts.testFailed'), locale.value); errorMessage.value = primaryTestError(event.error)",
    "const reauthErrorText = (error: any, fallback: string) => { if (locale.value.toLowerCase().split(/[-_]/)[0] === 'ru') { return extractApiErrorMessage(error, fallback, undefined, locale.value) } return error.response?.data?.detail || fallback }",
    "async function fetchUsage() { const msg = body?.error?.message || body?.message || `${t('keyUsage.queryFailed')} (${res.status})`; throw new Error(localizeApiErrorFallback(msg, t('keyUsage.queryFailedRetry'), locale.value)) }",
    "errorMessage.value = locale.value.toLowerCase().split(/[-_]/)[0] === 'ru' ? t('common.error') : event.error",
  ])('accepts structurally verified active-locale boundaries: %s', source => {
    expect(unsafePrimaryErrors(source)).toEqual([])
  })
  it.each([
    "const primaryTestError = (message: string) => message; errorMessage.value = primaryTestError(event.error)",
    "const primaryTestError = (message: string) => arbitrary(message, t('admin.accounts.testFailed'), locale.value); errorMessage.value = primaryTestError(event.error)",
    "const primaryTestError = (message: string) => localizeApiErrorFallback(message, t('admin.accounts.testFailed'), 'en'); errorMessage.value = primaryTestError(event.error)",
    "const primaryTestError = (message: string) => localizeApiErrorFallback(message, event.error || t('admin.accounts.testFailed'), locale.value); errorMessage.value = primaryTestError(event.error)",
    "const reauthErrorText = (error: any, fallback: string) => { if (locale.value.toLowerCase().split(/[-_]/)[0] === 'en') { return extractApiErrorMessage(error, fallback, undefined, locale.value) } return error.message || fallback }",
    "const reauthErrorText = (error: any, fallback: string) => { if (locale.value.toLowerCase().split(/[-_]/)[0] === 'ru') { extractApiErrorMessage(error, fallback, undefined, locale.value) } return error.message || fallback }",
    "const reauthErrorText = (error: any, fallback: string) => { if (locale.value.toLowerCase().split(/[-_]/)[0] === 'ru') { return extractApiErrorMessage(error, fallback, undefined, 'en') } return error.message || fallback }",
    "const msg = body?.error?.message || t('keyUsage.queryFailed'); throw new Error(arbitrary(msg, t('keyUsage.queryFailedRetry'), locale.value))",
    "const msg = body?.error?.message || t('keyUsage.queryFailed'); throw new Error(localizeApiErrorFallback(msg, t('keyUsage.queryFailedRetry'), 'en'))",
    "const msg = body?.error?.message || t('keyUsage.queryFailed'); throw new Error(localizeApiErrorFallback(msg, t('keyUsage.queryFailedRetry'), locale.value)); app.showError(msg)",
    "function f(err: any) { /* if (getLocale() === 'ru') return fallback */ app.showError(err.message || t('common.error')) }",
    "function f(err: any) { /* if (locale.value === 'ru') return extractApiErrorMessage(error, fallback, undefined, locale.value) */ app.showError(err.message || t('common.error')) }",
    "function f(err: any) { if (false) { if (getLocale() === 'ru') return fallback } app.showError(err.message || t('common.error')) }",
    "function f(err: any) { if (false) { if (locale.value === 'ru') return extractApiErrorMessage(error, fallback, undefined, locale.value) } app.showError(err.message || t('common.error')) }",
    "function f(err: any) { const unused = () => { if (getLocale() === 'ru') return fallback }; app.showError(err.message || t('common.error')) }",
    "function f(err: any) { const unused = () => { if (locale.value === 'ru') return extractApiErrorMessage(error, fallback, undefined, locale.value) }; app.showError(err.message || t('common.error')) }",
    "function f(err: any) { const text = \"if (getLocale() === 'ru') return fallback\"; app.showError(err.message || t('common.error')) }",
    "function f(err: any) { app.showError(err.message || t('common.error')); if (getLocale() === 'ru') return fallback }",
    "function f(err: any) { const fallback = err.message; if (getLocale() === 'ru') return fallback; app.showError(err.message || t('common.error')) }",
    "function f(err: any, fallback: string) { if (getLocale() === 'ru') { app.showError(err.message || t('common.error')); return fallback } return err.message || fallback }",
    "errorMessage.value = false && locale.value === 'ru' ? t('common.error') : event.error",
    "errorMessage.value = locale.value.toLowerCase().split(/[-_]/)[0] === 'ru' ? event.error || t('common.error') : t('common.error')",
  ])('rejects same-name bypasses and ungated primary paths: %s', source => {
    expect(unsafePrimaryErrors(source)).not.toEqual([])
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
