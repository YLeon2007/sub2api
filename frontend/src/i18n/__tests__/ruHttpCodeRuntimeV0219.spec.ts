import { readFileSync } from 'node:fs'

import { computed, unref } from 'vue'
import { parse } from 'vue/compiler-sfc'
import { createI18n } from 'vue-i18n'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import * as modelWhitelist from '@/composables/useModelWhitelist'
import en from '../locales/en'
import ru from '../locales/ru'
import zh from '../locales/zh'

const values = [401, 403, 429, 500, 502, 503, 529]
const keys = ['errors.unauthorized', 'errors.forbidden', 'admin.accounts.rateLimited',
  'errors.serverError', 'runtimeUi.badGateway', 'runtimeUi.serviceUnavailable', 'admin.accounts.status.overloaded']
const paths = ['components/account/CreateAccountModal.vue', 'components/account/EditAccountModal.vue',
  'components/account/BulkEditAccountModal.vue']

// Execute the actual display binding, including its imported helper, not a copied selector.
function displayBinding(path: string, t: (key: string) => string) {
  const source = readFileSync(`src/${path}`, 'utf8')
  const { descriptor } = parse(source)
  const script = descriptor.scriptSetup!.content
  const ast = ts.createSourceFile(path, script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'commonErrorCodes') continue
      const code = ts.transpileModule(`const ${declaration.getText(ast)}; return commonErrorCodes`, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
      }).outputText
      const scope = { ...Object.fromEntries(Object.entries(modelWhitelist).filter(([name]) => name !== 'commonErrorCodes')), computed, t }
      return new Function(...Object.keys(scope), code)(...Object.values(scope))
    }
  }
  const importsCodes = ast.statements.some(statement => ts.isImportDeclaration(statement)
    && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)
    && statement.importClause.namedBindings.elements.some(element => element.name.text === 'commonErrorCodes'))
  expect(importsCodes, `${path}: missing actual commonErrorCodes binding`).toBe(true)
  return modelWhitelist.commonErrorCodes
}

describe('actual account HTTP status display bindings', () => {
  for (const path of paths) {
    it.each(['ru', 'en', 'zh'] as const)(`${path} localizes all seven labels and preserves numeric values (%s)`, locale => {
      const i18n = createI18n({ legacy: false, locale, fallbackLocale: false, messages: { en, ru, zh } })
      const options = unref(displayBinding(path, i18n.global.t)) as Array<{ value: number; label: string }>
      expect(options.map(item => item.value)).toEqual(values)
      expect(options.map(item => item.label)).toEqual(keys.map(key => i18n.global.t(key)))
      expect(new Set(options.map(item => item.value)).size).toBe(values.length)
    })
    it(`${path} updates translated labels after a locale change`, () => {
      const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: false, messages: { en, ru, zh } })
      const binding = displayBinding(path, i18n.global.t)
      i18n.global.locale.value = 'ru'
      const options = unref(binding) as Array<{ value: number; label: string }>
      expect(options.map(item => item.value)).toEqual(values)
      expect(options.map(item => item.label)).toEqual(keys.map(key => i18n.global.t(key)))
    })
  }
})
