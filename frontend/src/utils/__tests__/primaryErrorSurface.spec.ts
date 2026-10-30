import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { parse } from 'vue/compiler-sfc'
import { localizeApiErrorFallback } from '@/utils/apiError'

// Structural guard: discover every runtime file, not just the originally reported
// two toasts. Inspect expressions/aliases with TypeScript AST (including optional
// chains, casts, multiline expressions and local fallback helper returns).
export function unsafePrimaryErrors(text: string, name = 'fixture.ts'): string[] {
  const sf = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const failures = new Set<string>()
  function bindingSources(name: ts.BindingName, value: ts.Expression | undefined, target: string): ts.Expression[] | undefined {
    if (ts.isIdentifier(name)) return name.text === target ? (value ? [value] : []) : undefined
    for (const element of name.elements) {
      if (ts.isOmittedExpression(element)) continue
      const nested = bindingSources(element.name, element.initializer, target)
      // Defaults at every binding level are possible sources. Keep the complete
      // enclosing initializer conservatively tainted rather than trusting the
      // destructured identifier's spelling or losing default-object provenance.
      if (nested) return value ? [...nested, value] : nested
    }
  }
  function localSources(n: ts.Identifier): ts.Expression[] | undefined {
    for (let scope: ts.Node | undefined = n.parent; scope; scope = scope.parent) {
      if (ts.isBlock(scope) || ts.isSourceFile(scope)) {
        for (const statement of scope.statements) {
          if (ts.isFunctionDeclaration(statement) && statement.name?.text === n.text) return []
          if (!ts.isVariableStatement(statement)) continue
          for (const declaration of statement.declarationList.declarations) {
            const sources = bindingSources(declaration.name, declaration.initializer, n.text)
            if (sources) return sources
          }
        }
      }
      if (ts.isCatchClause(scope) && scope.variableDeclaration && bindingSources(scope.variableDeclaration.name, undefined, n.text)) return []
      if (ts.isFunctionLike(scope)) {
        for (const parameter of scope.parameters) {
          const sources = bindingSources(parameter.name, parameter.initializer, n.text)
          if (sources) return sources
        }
      }
    }
    return undefined
  }
  const aliases = (n: ts.Identifier) => localSources(n) || []
  const callee = (n: ts.CallExpression) => ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : n.expression.getText(sf)
  const sanitizers = new Set(['localizeApiErrorFallback', 'extractApiErrorMessage', 'extractI18nErrorMessage', 'buildAuthErrorMessage'])
  const compact = (n: ts.Node) => n.getText(sf).replace(/\s+/g, '')
  function unwrap(n: ts.Expression): ts.Expression {
    while (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)
      || ts.isNonNullExpression(n) || ts.isSatisfiesExpression(n)) n = n.expression
    return n
  }
  function canonical(n: ts.Expression): string {
    const transformed = ts.transform(n, [context => root => {
      const visit: ts.Visitor = node => {
        if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)
          || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) return ts.visitNode(node.expression, visit)
        return ts.visitEachChild(node, visit, context)
      }
      return ts.visitNode(root, visit, ts.isExpression)!
    }])
    try { return ts.createPrinter({ removeComments: true }).printNode(ts.EmitHint.Expression, transformed.transformed[0], sf).replace(/\s+/g, '') }
    finally { transformed.dispose() }
  }
  function russianCondition(n: ts.Expression): boolean {
    n = unwrap(n)
    return ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
      && ts.isStringLiteral(unwrap(n.right)) && (unwrap(n.right) as ts.StringLiteral).text === 'ru'
      && ['locale.value', 'getLocale()', 'locale.value.toLowerCase().split(/[-_]/)[0]'].includes(canonical(n.left))
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
    const declaration = aliases(n.expression)[0]
    return !!declaration && ts.isArrowFunction(declaration) && declaration.parameters.length === 1
      && ts.isIdentifier(declaration.parameters[0].name)
      && verifiedFallbackCall(declaration.body, declaration.parameters[0].name.text)
  }
  function verifiedEarlyRussianReturn(n: ts.Node): ts.IfStatement | undefined {
    if (!ts.isFunctionLike(n) || !('body' in n) || !n.body || !ts.isBlock(n.body)) return undefined
    let first = n.body.statements[0]
    let boundFallback = n.parameters.some(parameter => ts.isIdentifier(parameter.name) && parameter.name.text === 'fallback' && !parameter.initializer && !parameter.dotDotDotToken)
    // buildAuthErrorMessage binds only options.fallback before its RU return.
    // Permit that exact pure parameter destructuring, not arbitrary initializers,
    // calls, default values, or statements that may already expose a primary sink.
    if (first && ts.isVariableStatement(first) && first.declarationList.flags & ts.NodeFlags.Const) {
      const declarations = first.declarationList.declarations
      const declaration = declarations.length === 1 ? declarations[0] : undefined
      if (declaration && ts.isObjectBindingPattern(declaration.name) && declaration.name.elements.length === 1
        && declaration.initializer && ts.isIdentifier(declaration.initializer)
        && declaration.initializer.text === n.parameters[1]?.name.getText(sf)
        && !n.parameters[1]?.initializer && !n.parameters[1]?.dotDotDotToken) {
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
  let bindingChecker: ts.TypeChecker | undefined
  function bindingDeclarations(root: ts.Identifier): readonly ts.Declaration[] | undefined {
    // Bind only this in-memory file: no libraries, module resolution or I/O.
    // A spelling match cannot prove import or intermediate alias identity.
    bindingChecker ||= ts.createProgram([sf.fileName], { noLib: true, noResolve: true, types: [], allowNonTsExtensions: true }, {
      getSourceFile: file => file === sf.fileName ? sf : undefined,
      getDefaultLibFileName: () => '',
      writeFile: () => undefined,
      getCurrentDirectory: () => '',
      getDirectories: () => [],
      fileExists: file => file === sf.fileName,
      readFile: file => file === sf.fileName ? text : undefined,
      getCanonicalFileName: file => file,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
    }).getTypeChecker()
    return bindingChecker.getSymbolAtLocation(root)?.declarations
  }
  function importedArrayProducer(root: ts.Identifier): boolean {
    const declarations = bindingDeclarations(root)
    if (!declarations) return name === 'fixture.ts'
    if (declarations.length !== 1 || !ts.isImportSpecifier(declarations[0])) return false
    const binding = declarations[0]
    const declaration = binding.parent.parent.parent
    return (binding.propertyName || binding.name).text === 'adminAPI'
      && !binding.isTypeOnly && !binding.parent.parent.isTypeOnly
      && ts.isImportDeclaration(declaration) && ts.isStringLiteral(declaration.moduleSpecifier)
      && declaration.moduleSpecifier.text === '@/api/admin'
  }
  function knownArray(n: ts.Expression, seen = new Set<string>()): boolean {
    n = unwrap(n)
    if (ts.isAwaitExpression(n)) return knownArray(n.expression, seen)
    if (ts.isArrayLiteralExpression(n)) return true
    if (ts.isIdentifier(n) && !seen.has(n.text)) {
      // Every alias must belong to its actual lexical variable declaration.
      // Never inherit an outer array proof through a same-spelled local class,
      // enum, namespace, loop binding or a function-hoisted var declaration.
      const declarations = bindingDeclarations(n)
      if (declarations?.length !== 1) return false
      const declaration = declarations[0]
      return ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name)
        && !!declaration.initializer && knownArray(declaration.initializer, new Set([...seen, n.text]))
    }
    if (!ts.isCallExpression(n)) return false
    const method = unwrap(n.expression)
    if (ts.isPropertyAccessExpression(method) && method.name.text === 'filter') return knownArray(method.expression, seen)
    if (ts.isElementAccessExpression(method) && method.argumentExpression && ts.isStringLiteralLike(method.argumentExpression)
      && method.argumentExpression.text === 'filter') return knownArray(method.expression, seen)
    // This actual API consumer has an array response contract, not an arbitrary
    // same-named method. Reject local shadow/default bindings and tainted inputs.
    if (compact(method) !== 'adminAPI.accounts.probeUpstreamBillingBatch' || raw(n, seen)) return false
    let root: ts.Expression = method
    while (ts.isPropertyAccessExpression(root)) root = root.expression
    return ts.isIdentifier(root) && importedArrayProducer(root)
  }
  function raw(n: ts.Node, seen = new Set<string>()): boolean {
    if (ts.isCallExpression(n) && sanitizers.has(callee(n))) {
      // The primary fallback must not itself contain raw API copy.
      const fallback = n.arguments[callee(n) === 'extractI18nErrorMessage' ? 3 : 1]
      return !!fallback && raw(fallback, seen)
    }
    if (ts.isCallExpression(n)) {
      // Standalone helper returns are audited by inspect(); a method receiver
      // is also data and must retain a default object's provenance across calls.
      if (verifiedLocalWrapper(n)) return false
      if (callee(n) === 'localizeQuotaDiagnostic') return false
      const receiver = ts.isPropertyAccessExpression(n.expression) || ts.isElementAccessExpression(n.expression) ? n.expression.expression : undefined
      return n.arguments.some(argument => raw(argument, seen)) || !!receiver && raw(receiver, seen)
    }
    if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
      const key = ts.isPropertyAccessExpression(n) ? n.name.text
        : n.argumentExpression && ts.isStringLiteralLike(n.argumentExpression) ? n.argumentExpression.text : undefined
      // Member selection cannot erase a default object's provenance. Conservatively
      // carry the whole container, including nested/array/default/renamed aliases.
      // Length is numeric only with a positive array-origin proof. Unknown
      // methods/objects retain all argument and receiver provenance.
      if (key === 'length') return knownArray(n.expression, seen) ? false : raw(n.expression, seen)
      // Reactive state may have a property called error, but .value must never
      // erase explicit data arguments of an intervening method call.
      if (key === 'value') {
        let root = n.expression
        while (true) {
          if (ts.isPropertyAccessExpression(root) || ts.isElementAccessExpression(root)) root = root.expression
          else if (ts.isCallExpression(root) && (ts.isPropertyAccessExpression(root.expression) || ts.isElementAccessExpression(root.expression))) {
            if (root.arguments.some(argument => raw(argument, seen))) return true
            root = root.expression.expression
          }
          else break
        }
        return raw(root, seen)
      }
      return ['message', 'detail', 'error', 'error_description'].includes(key || '') || raw(n.expression, seen)
    }
    if (ts.isConditionalExpression(n) && russianCondition(n.condition)) return raw(n.whenTrue, seen)
    if (ts.isIdentifier(n) && !seen.has(n.text)) {
      return aliases(n).some(value => raw(value, new Set([...seen, n.text])))
    }
    let found = false
    ts.forEachChild(n, c => { if (raw(c, seen)) found = true })
    return found
  }
  function gated(n: ts.Node): boolean {
    for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
      if (ts.isCallExpression(p) && sanitizers.has(callee(p))) {
        const fallback = p.arguments[callee(p) === 'extractI18nErrorMessage' ? 3 : 1]
        // A sanitizer protects only its raw-input subtree, never its fallback.
        // In particular a bare returned sanitizer call is not itself a sink,
        // so do not suppress the analysis of raw fallback expressions inside it.
        if (fallback && !raw(fallback)
          && !(n.getStart(sf) >= fallback.getStart(sf) && n.end <= fallback.end)) return true
      }
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
      const unsafeSanitizer = ts.isCallExpression(n) && sanitizers.has(callee(n)) && raw(n)
      // A tainted RU return can leak without an OR expression or outer sink.
      // Refusing the early-return exemption alone does not diagnose that path.
      const returned = ts.isReturnStatement(n) ? n.expression
        : ts.isArrowFunction(n) && !ts.isBlock(n.body) ? n.body : undefined
      let unsafeRussianReturn = false
      if (returned && raw(returned)) {
        // The same RU result boundary can be an if/return or an expression,
        // including a parenthesized/nested conditional and an implicit return.
        const russianChoice = (value: ts.Node): boolean => {
          if (ts.isConditionalExpression(value) && russianCondition(value.condition)) return true
          let found = false
          ts.forEachChild(value, child => { if (!ts.isFunctionLike(child) && russianChoice(child)) found = true })
          return found
        }
        unsafeRussianReturn = russianChoice(returned)
        for (let p: ts.Node | undefined = n.parent; p && !ts.isFunctionLike(p); p = p.parent) {
          if (ts.isIfStatement(p) && russianCondition(p.expression)
            && n.getStart(sf) >= p.thenStatement.getStart(sf) && n.end <= p.thenStatement.end) unsafeRussianReturn = true
        }
      }
      if (fallbackChain || sink || state || unsafeSanitizer || unsafeRussianReturn) failures.add(`${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}: ${n.getText(sf)}`)
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
  it.each([
    "class results{static filter(fn){return {length:fn()}}}",
    "enum results{unused};results.filter=fn=>({length:fn()});",
    "const results={filter:fn=>({length:fn()})};",
  ])('rejects intermediate array-alias shadows with imported and literal origins: %s', async shadow => {
    for (const origin of ['await adminAPI.accounts.probeUpstreamBillingBatch([])', '[]']) {
      const source = `import {adminAPI} from '@/api/admin';async function f(err){const results=${origin};{${shadow}return localizeApiErrorFallback(err.message,results.filter(()=>err.message).length)}}`
      const compiled = ts.transpileModule(source.replace("import {adminAPI} from '@/api/admin';", ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
      const run = new Function('adminAPI', 'localizeApiErrorFallback', `${compiled}; return f({message:'RAW_API_MESSAGE'})`)
      for (const locale of ['ru', 'ru-RU', 'RU_ru', 'ru_RU', 'en', 'zh']) {
        expect(await run({ accounts: { probeUpstreamBillingBatch: async () => [] } }, (raw: string, fallback: string) => localizeApiErrorFallback(raw, fallback, locale))).toBe('RAW_API_MESSAGE')
      }
      expect(unsafePrimaryErrors(source, 'scoped-alias-fixture.ts')).not.toEqual([])
      expect(unsafePrimaryErrors(source)).not.toEqual([])
    }
  })
  it('rejects a valid namespace-scope intermediate alias shadow', () => {
    // Namespaces nested in function/block bodies are invalid TypeScript; use a
    // legal namespace scope so lexical symbol identity matches emitted runtime.
    const source = "const results=[];namespace outer{export namespace results{export const filter=(fn:()=>string)=>({length:fn()})}export function f(err:{message:string}){return localizeApiErrorFallback(err.message,results.filter(()=>err.message).length)}}"
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
    const run = new Function('localizeApiErrorFallback', `${compiled}; return outer.f({message:'RAW_API_MESSAGE'})`)
    for (const locale of ['ru', 'ru-RU', 'RU_ru', 'ru_RU', 'en', 'zh']) {
      expect(run((raw: string, fallback: string) => localizeApiErrorFallback(raw, fallback, locale))).toBe('RAW_API_MESSAGE')
    }
    expect(unsafePrimaryErrors(source, 'scoped-alias-fixture.ts')).not.toEqual([])
    expect(unsafePrimaryErrors(source)).not.toEqual([])
  })
  it.each([
    "import {adminAPI} from '@/api/admin';async function f(err){const results=await adminAPI.accounts.probeUpstreamBillingBatch([]);{class results{static filter(fn){return {length:fn()}}}return localizeApiErrorFallback(err.message,results['filter'](()=>err.message)['length'])}}",
    "function f(err){const results=[];{class results{static filter(fn){return {length:fn()}}}return localizeApiErrorFallback(err.message,((results.filter(()=>err.message)) as any).length)}}",
    "function f(err){const results=[];{for(const results of [{filter:fn=>({length:fn()})}])return localizeApiErrorFallback(err.message,results.filter(()=>err.message).length)}}",
    "function f(err){const results=[];{function nested(){if(true){var results={filter:fn=>({length:fn()})}}return localizeApiErrorFallback(err.message,results.filter(()=>err.message).length)}return nested()}}",
  ])('retains explicit taint under wrapped, computed, loop and hoisted alias shadows: %s', source => {
    expect(unsafePrimaryErrors(source, 'scoped-alias-fixture.ts')).not.toEqual([])
    expect(unsafePrimaryErrors(source)).not.toEqual([])
  })
  it.each([
    "import {adminAPI} from '@/api/admin';async function f(err){const results=await adminAPI.accounts.probeUpstreamBillingBatch([]);function unrelated(){class results{static filter(fn){return {length:fn()}}}return results}const alias=results;app.showError(t('partial',{failed:alias.filter(x=>x.error).length}))}",
    "function f(err){const results=[{error:err.message}];function unrelated(){class results{static filter(fn){return {length:fn()}}}return results}const alias=results;app.showError(t('partial',{failed:alias['filter'](x=>x.error)['length']}))}",
    "function f(err){const results=[];{const results=[{error:err.message}];const alias=results;app.showError(t('partial',{failed:alias.filter(x=>x.error).length}))}}",
  ])('preserves actual array aliases and unrelated-scope shadows: %s', source => {
    expect(unsafePrimaryErrors(source, 'scoped-alias-fixture.ts')).toEqual([])
    expect(unsafePrimaryErrors(source)).toEqual([])
  })
  it.each([
    "import {adminAPI} from '@/api/admin';async function f(err){class adminAPI{static accounts={probeUpstreamBillingBatch:()=>({filter:fn=>({length:fn()})})}}const results=await adminAPI.accounts.probeUpstreamBillingBatch([]);return localizeApiErrorFallback(err.message,results.filter(()=>err.message).length)}",
    "async function f(err){class adminAPI{static accounts={probeUpstreamBillingBatch:()=>({filter:fn=>({length:fn()})})}}const results=await adminAPI.accounts.probeUpstreamBillingBatch([]);return localizeApiErrorFallback(err.message,results.filter(()=>err.message).length)}",
    "import {adminAPI} from '@/api/admin';async function f(err){enum adminAPI{unused};adminAPI.accounts={probeUpstreamBillingBatch:()=>({filter:fn=>({length:fn()})})};const results=await adminAPI.accounts.probeUpstreamBillingBatch([]);return localizeApiErrorFallback(err.message,results.filter(()=>err.message).length)}",
    "import {adminAPI} from '@/api/admin';async function f(err){namespace adminAPI{export const accounts={probeUpstreamBillingBatch:()=>({filter:fn=>({length:fn()})})}}const results=await adminAPI.accounts.probeUpstreamBillingBatch([]);return localizeApiErrorFallback(err.message,results.filter(()=>err.message).length)}",
    "import {adminAPI} from '@/api/admin';async function f(err){for(const adminAPI of [{accounts:{probeUpstreamBillingBatch:()=>({filter:fn=>({length:fn()})})}}]){const results=await adminAPI.accounts.probeUpstreamBillingBatch([]);return localizeApiErrorFallback(err.message,results.filter(()=>err.message).length)}}",
    "import {adminAPI} from '@/api/admin';async function f(err){if(true){var adminAPI={accounts:{probeUpstreamBillingBatch:()=>({filter:fn=>({length:fn()})})}}}const results=await adminAPI.accounts.probeUpstreamBillingBatch([]);return localizeApiErrorFallback(err.message,results.filter(()=>err.message).length)}",
    "import {adminAPI} from '@/api/admin';async function f(err){const adminAPI={accounts:{probeUpstreamBillingBatch:()=>({filter:fn=>({length:fn()})})}};const results=await adminAPI.accounts.probeUpstreamBillingBatch([]);return localizeApiErrorFallback(err.message,results.filter(()=>err.message).length)}",
  ])('rejects lexical binding shadows in the numeric array-origin exemption: %s', async source => {
    // Imports are inert guard input; runtime uses only the fixture's local binding.
    const fixture = source.replace("import {adminAPI} from '@/api/admin';", '')
    const compiled = ts.transpileModule(fixture, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
    const run = new Function('localizeApiErrorFallback', `${compiled}; return f({message:'RAW_API_MESSAGE'})`)
    for (const locale of ['ru', 'ru-RU', 'RU_ru', 'ru_RU', 'en', 'zh']) {
      expect(await run((raw: string, fallback: string) => localizeApiErrorFallback(raw, fallback, locale))).toBe('RAW_API_MESSAGE')
    }
    expect(unsafePrimaryErrors(source, 'scoped-count-fixture.ts')).not.toEqual([])
    expect(unsafePrimaryErrors(source)).not.toEqual([])
  })
  it.each([
    "import {adminAPI} from '@/api/admin';async function f(err){const results=await adminAPI.accounts.probeUpstreamBillingBatch([]);app.showError(t('partial',{failed:results.filter(()=>err.message).length}))}",
    "import {adminAPI} from '@/api/admin';function unused(){class adminAPI{}}async function f(err){const results=await adminAPI.accounts.probeUpstreamBillingBatch([]);app.showError(t('partial',{failed:results.filter(()=>err.message).length}))}",
    "import {adminAPI} from '@/api/admin';async function f(err){class unused{static adminAPI={}}const results=await adminAPI.accounts.probeUpstreamBillingBatch([]);app.showError(t('partial',{failed:results.filter(()=>err.message).length}))}",
  ])('preserves the actual imported array producer without unrelated shadow false positives: %s', source => {
    expect(unsafePrimaryErrors(source, '/src/count-consumer.vue')).toEqual([])
  })
  it.each([
    "import {adminAPI} from 'untrusted';",
    "import {other as adminAPI} from '@/api/admin';",
    "import type {adminAPI} from '@/api/admin';",
    "import {type adminAPI} from '@/api/admin';",
  ])('refuses unsupported or type-only imported array producer identity: %s', declaration => {
    const source = `${declaration}async function f(err){const results=await adminAPI.accounts.probeUpstreamBillingBatch([]);return localizeApiErrorFallback(err.message,results.filter(()=>err.message).length)}`
    expect(unsafePrimaryErrors(source, 'scoped-count-fixture.ts')).not.toEqual([])
  })
  it.each([
    'function f(err,{fallback=err.message}={}){return (getLocale()==="ru")?fallback:err.message}',
    'const f=(err,{fallback=err.message}={})=>(getLocale()==="ru")?fallback:err.message',
    'function f(err,options={fallback:err.message}){if((getLocale()==="ru"))return options.fallback;return err.message}',
    'function f(err,options={read:value=>({value})}){return localizeApiErrorFallback(err.message,options.read(err.message).value)}',
    'function f(err,options={read:x=>({length:x})}){return localizeApiErrorFallback(err.message,options.read(err.message).length)}',
  ])('rejects executable S1-R1/R2 review counterexamples: %s', source => {
    const run = new Function('localizeApiErrorFallback', 'getLocale', `${source}; return f({message:'RAW_API_MESSAGE'})`)
    for (const locale of ['ru', 'ru-RU', 'RU_ru', 'ru_RU', 'en', 'zh']) {
      const root = locale.toLowerCase().split(/[-_]/)[0]
      expect(run((raw: string, fallback: string) => localizeApiErrorFallback(raw, fallback, locale), () => root)).toBe('RAW_API_MESSAGE')
    }
    expect(unsafePrimaryErrors(source)).not.toEqual([])
  })
  it.each([
    "function f(err,{fallback=err.message}={}){return (((getLocale())===('ru')))?fallback:err.message}",
    "function f(err,{fallback=err.message}={}){return (((getLocale)())==='ru')?fallback:err.message}",
    "function f(err,{fallback=err.message}={}){return ((((locale).value).toLowerCase)().split(/[-_]/)[0]==='ru')?fallback:err.message}",
    "function f(err,{fallback=err.message}={}){return ((getLocale()==='ru') as boolean)?fallback:err.message}",
    "const f=(err,{fallback=err.message}={})=>((getLocale()==='ru') satisfies boolean)?fallback:err.message",
    "function f(err,options={read:x=>({value:x})}){return localizeApiErrorFallback(err.message,options?.['read'](err.message)?.['value'])}",
    "function f(err,options={read:x=>({length:x})}){const text=err.message;return localizeApiErrorFallback(err.message,options['read'](text)['length'])}",
    "function f(err,options={read:x=>({nested:{value:x}})}){return localizeApiErrorFallback(err.message,options.read(err.message).nested.value)}",
    "function f(err,options={read:fn=>({value:fn()})}){return localizeApiErrorFallback(err.message,options.read(()=>err.message).value)}",
    "function f(err,options={filter:fn=>({length:fn()})}){return localizeApiErrorFallback(err.message,options.filter(()=>err.message).length)}",
    "function f(err,options={read:x=>({value:x})}){return localizeApiErrorFallback(err.message,((options.read(err.message)) as any).value)}",
    "function f(err,options={read:x=>({length:x})}){return localizeApiErrorFallback(err.message,options.read(...[err.message]).length)}",
    "async function f(err,adminAPI={accounts:{probeUpstreamBillingBatch:()=>({filter:()=>({length:err.message})})}}){const results=await adminAPI.accounts.probeUpstreamBillingBatch([]);return localizeApiErrorFallback(err.message,results.filter(x=>x.error).length)}",
    "async function f(err){const adminAPI={accounts:{probeUpstreamBillingBatch:()=>({filter:()=>({length:err.message})})}};const results=await adminAPI.accounts.probeUpstreamBillingBatch([]);return localizeApiErrorFallback(err.message,results.filter(x=>x.error).length)}",
  ])('retains S1-R1/R2 provenance through syntax wrappers, call arguments and fake count methods: %s', source => {
    expect(unsafePrimaryErrors(source)).not.toEqual([])
  })
  it.each([
    "function f(err,options={fallback:t('common.error')}){return ((getLocale())===('ru'))?options.fallback:err.message}",
    "function f(err){const rows=[{error:err.message}];const failed=rows.filter(row=>row.error).length;app.showError(t('partial',{failed}))}",
    "function f(err){const rows=[{error:err.message}];const failed=rows['filter'](row=>row.error)['length'];app.showError(t('partial',{failed}))}",
  ])('keeps wrapped safe locale choices and proven array counts accepted: %s', source => {
    expect(unsafePrimaryErrors(source)).toEqual([])
  })
  it.each([
    "function f(err,options={value:err.message}){return localizeApiErrorFallback(err.message,options.value)}",
    "function f(err,options={length:err.message}){return localizeApiErrorFallback(err.message,options.length)}",
    "function f(err,options={nested:{fallback:err.message}}){return localizeApiErrorFallback(err.message,options.nested.fallback)}",
    "function f(err,options={fallback:err.message}){const alias=options;return localizeApiErrorFallback(err.message,alias.fallback)}",
    "function f(err,{options:renamed={fallback:err.message}}={}){return localizeApiErrorFallback(err.message,renamed['fallback'])}",
    "function f(err){return localizeApiErrorFallback(err.message,err['message'])}",
    "function f(err,options={nested:{fallback:err.message}}){return localizeApiErrorFallback(err.message,options?.nested?.['fallback'])}",
    "function f(err,options={nested:{value:err.message}}){if(getLocale()==='ru')return options.nested.value;return err.message}",
    "const f=(err,{fallback=err.message}={})=>getLocale()==='ru'?fallback:err.message",
    "function f(err,options={fallback:err.message}){return true?(getLocale()==='ru'?options.fallback:err.message):'safe'}",
    "function f(err,options=[{fallback:err.message}]){return localizeApiErrorFallback(err.message,options[0].fallback)}",
    "function f(err,options={get:()=>({value:err.message})}){return localizeApiErrorFallback(err.message,options.get().value)}",
    "function f(err,options={get:()=>({fallback:err.message})}){return localizeApiErrorFallback(err.message,options.get().fallback)}",
  ])('carries the same provenance through every member projection: %s', source => {
    expect(unsafePrimaryErrors(source)).not.toEqual([])
  })
  it.each([
    "async function f(accountIDs){const results=await adminAPI.accounts.probeUpstreamBillingBatch(accountIDs);const failed=results.filter(result=>result.error).length;app.showError(t('admin.accounts.upstreamBilling.batchPartial',{success:results.length-failed,failed}))}",
    "const composable=useGeminiOAuth();app.showError(composable.error.value)",
    "function f(err,options={fallback:t('common.error')}){return getLocale()==='ru'?options.fallback:err.message}",
  ])('preserves translated counts, reactive state and safe member fallbacks: %s', source => {
    expect(unsafePrimaryErrors(source)).toEqual([])
  })
  it.each([
    "function f(err,options={fallback:err.message}){return localizeApiErrorFallback(err.message,options.fallback)}",
    "function f(err,{options={fallback:err.message}}={}){return localizeApiErrorFallback(err.message,options.fallback)}",
    "function f(err){const {options={fallback:err.message}}={};return localizeApiErrorFallback(err.message,options.fallback)}",
    "function f(err,[options={fallback:err.message}]=[]){if(getLocale()==='ru')return options.fallback;return err.message}",
    "function f(err,{fallback=err.message}={}){return getLocale()==='ru'?fallback:err.message}",
  ])('rejects executable default-object members and RU conditional returns: %s', source => {
    const run = new Function('localizeApiErrorFallback', 'getLocale', `${source}; return f({message:'RAW_API_MESSAGE'})`)
    for (const locale of ['ru', 'ru-RU', 'RU_ru', 'ru_RU', 'en', 'zh']) {
      const root = locale.toLowerCase().split(/[-_]/)[0]
      expect(run((raw: string, fallback: string) => localizeApiErrorFallback(raw, fallback, locale), () => root)).toBe('RAW_API_MESSAGE')
    }
    expect(unsafePrimaryErrors(source)).not.toEqual([])
  })
  it.each([
    "function f(err, {fallback=err.message}={}){return localizeApiErrorFallback(err.message,fallback)}",
    "function f(err, {fallback}={fallback:err.message}){return localizeApiErrorFallback(err.message,fallback)}",
    "function f(err, fallback=err.message){if(getLocale()==='ru')return fallback; return err.message}",
  ])('rejects executable raw default provenance without an outer sink: %s', source => {
    const run = new Function('localizeApiErrorFallback', 'getLocale', `${source}; return f({message:'RAW_API_MESSAGE'})`)
    expect(run((raw: string, fallback: string) => localizeApiErrorFallback(raw, fallback, 'ru'), () => 'ru')).toBe('RAW_API_MESSAGE')
    expect(unsafePrimaryErrors(source)).not.toEqual([])
  })
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
    "function f(err, {fallback=err.message}={}){return localizeApiErrorFallback(err.message,fallback)}",
    "function f(err, {fallback}={fallback:err.message}){return localizeApiErrorFallback(err.message,fallback)}",
    "function f(err, fallback=err.message){if(getLocale()==='ru')return fallback; return err.message}",
    "function f(err, {fallback: copy=err.message}={}){return localizeApiErrorFallback(err.message,copy)}",
    "function f(err, {options:{fallback=err.message}={}}={}){return localizeApiErrorFallback(err.message,fallback)}",
    "function f(err, [fallback=err.message]=[]){return localizeApiErrorFallback(err.message,fallback)}",
    "function f(err, options={fallback:err.message}){const {fallback}=options; return localizeApiErrorFallback(err.message,fallback)}",
    "function f(err){const {fallback=err.message}={}; return localizeApiErrorFallback(err.message,fallback)}",
    "function f(err, {fallback=err.message}={}){if(getLocale()==='ru')return fallback; return err.message}",
    "function f(err:any, fallback=err.message){if(getLocale()==='ru')return fallback; return err.message||fallback}",
    "function f(err:any){return localizeApiErrorFallback(err.message,err.message||t('common.error'))}",
    "function f(err:any, options={fallback:err.message}){const {fallback}=options; if(getLocale()==='ru')return fallback; return err.message||fallback}",
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
