import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { computed, ref, type ComputedRef } from 'vue'
import { parse } from 'vue/compiler-sfc'
import ts from 'typescript'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as apiErrors from '@/utils/apiError'
import { localizeQuotaDiagnostic } from '@/utils/quotaDiagnostics'

const language = vi.hoisted(() => ({ current: 'ru' }))
vi.mock('@/i18n', () => ({ getLocale: () => language.current }))
beforeEach(() => { language.current = 'ru' })
const locales = ['ru', 'ru-RU', 'en', 'zh'] as const
const isRussian = () => language.current.toLowerCase().startsWith('ru')
const t = (key: string, params?: Record<string, unknown>) =>
  `translated:${language.current}:${key}${params ? `:${JSON.stringify(params)}` : ''}`

// Like consumerMessageContractsV0219: execute actual SFC declarations, including
// their local selector helpers and computed chains, never copied catch logic.
// Only APIs, translator and surrounding state are supplied by the fixture.
function consumer<T>(path: string, name: string, scope: Record<string, unknown>, support: string[] = []): T {
  const { descriptor } = parse(readFileSync(resolve(process.cwd(), 'src', path), 'utf8'))
  const file = ts.createSourceFile(path, descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const statements = [...support, name].map(identifier => {
    const statement = file.statements.find(node =>
      (ts.isFunctionDeclaration(node) && node.name?.text === identifier) ||
      (ts.isVariableStatement(node) && node.declarationList.declarations.some(decl => ts.isIdentifier(decl.name) && decl.name.text === identifier)),
    )
    if (!statement) {
      if (identifier === name) throw new Error(`Missing actual consumer: ${path}:${identifier}`)
      // Older consumers can call an imported extractor instead of a local one.
      // Keep that actual handler executable when replaying the regression.
      return ''
    }
    return statement.getText(file)
  })
  const code = ts.transpileModule(statements.join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText
  return new Function(...Object.keys(scope), `${code}\nreturn ${name}`)(...Object.values(scope)) as T
}
function baseScope() {
  return { ...apiErrors, localizeQuotaDiagnostic, computed, t, locale: ref(language.current) }
}
const cnCases = [
  ['components/account/CNProviderBalanceCell.vue', 'queryBalance'],
  ['components/account/CNProviderQuotaCell.vue', 'queryQuota'],
] as const
const catchCases = [
  ...cnCases.map(([path, api]) => [path, 'handleProbe', api] as const),
  ['components/account/GrokQuotaProbeCell.vue', 'handleProbe', 'grokQuery'],
  ['components/account/OpenAIQuotaResetCell.vue', 'handleQuery', 'refreshOpenAIQuota'],
  ['components/account/OpenAIQuotaResetCell.vue', 'confirmReset', 'resetOpenAIQuota'],
] as const
// All official selector positions, plus deliberately unsupported fields and
// empty/null inputs. Fields contradict one another so precedence is observable.
const quotaFailures: [unknown, string | undefined][] = [
  [{ message: '  exact envelope message  ', reason: 'REASON', error: 'Wrong top-level error', response: { data: { detail: 'Wrong detail', message: 'Nested message', error: 'Nested error', code: 'WRONG_CODE' } } }, '  exact envelope message  '],
  [{ message: '', reason: 'REASON', response: { data: { detail: 'Wrong detail', message: 'Nested message', error: 'Nested error' } } }, 'REASON'],
  [{ reason: '', response: { data: { detail: 'Wrong detail', message: 'Nested message', error: 'Nested error', code: 'WRONG_CODE' } } }, 'Nested message'],
  [{ response: { data: { detail: 'Wrong detail', message: '', error: 'Nested error', code: 'WRONG_CODE' } } }, 'Nested error'],
  [{ error: 'Wrong top-level error', response: { data: { detail: 'Wrong detail', code: 'WRONG_CODE' } } }, undefined],
  [{ message: '', reason: '', response: { data: { message: '', error: '' } } }, undefined],
  [null, undefined],
  [undefined, undefined],
]

function quotaScope(failure: unknown) {
  const reject = vi.fn((): Promise<unknown> => Promise.reject(failure))
  const snapshot = { success: true, tiers: [{ window: 'weekly', used_percent: 27 }], credits: { balance: '3.25' } }
  return {
    ...baseScope(), props: { account: { id: 73, platform: 'openai', type: 'oauth' } },
    adminAPI: { cnProviders: { queryBalance: reject, queryQuota: reject }, grok: { queryQuota: reject } },
    refreshOpenAIQuota: reject, resetOpenAIQuota: reject, reject,
    loading: ref(false), resetting: ref(false), error: ref<string | null>(null), data: ref(snapshot), cachedData: ref(snapshot),
    canReset: ref(true), showResetConfirm: ref(true), showResetCreditDetails: ref(true), creditsCacheWarning: ref(false),
    resetMessage: ref<string | null>(null), resetWarning: ref<string | null>(null), updateCredits: vi.fn(), emit: vi.fn(),
  }
}

describe('REG-063/064/069/070/071: actual quota catches retain the official selector', () => {
  for (const [path, name] of catchCases) {
    it.each(locales)(`${path}:${name} message → reason → response.message → response.error (%s)`, async locale => {
      language.current = locale
      for (const [failure, raw] of quotaFailures) {
        const before = structuredClone(failure)
        const scope = quotaScope(failure)
        const snapshot = scope.data.value
        await consumer<() => Promise<void>>(path, name, scope, ['extractErrorMessage'])()
        expect(scope.error.value).toBe(isRussian() ? t('common.error') : raw || t('common.error'))
        expect(scope.reject).toHaveBeenCalledTimes(1)
        expect(scope.reject).toHaveBeenCalledWith(73)
        expect(scope.data.value).toBe(snapshot)
        expect(scope.cachedData.value).toBe(snapshot)
        expect(scope.updateCredits).not.toHaveBeenCalled()
        expect(scope.emit).not.toHaveBeenCalled()
        expect(scope.loading.value).toBe(false)
        expect(scope.resetting.value).toBe(false)
        expect(failure).toEqual(before)
      }
    })
  }
})

describe('REG-065/066: both CN extraction and displayed computed preserve EN/ZH', () => {
  for (const [path, api] of cnCases) {
    it.each(locales)(`${path} catch and failed-result display chain (%s)`, async locale => {
      language.current = locale
      const raw = `  Provider diagnostic ${'x'.repeat(95)}  `
      for (const caught of [true, false]) {
        const failure = { message: raw, reason: 'UNMODIFIED_REASON', response: { data: { detail: 'Wrong detail', code: 'UNMODIFIED_CODE' } } }
        const result = { success: false, error: raw, code: 'UNMODIFIED_CODE' }
        const before = structuredClone({ failure, result })
        const scope = quotaScope(failure)
        if (!caught) scope.reject.mockImplementation(() => Promise.resolve(result))
        await consumer<() => Promise<void>>(path, 'handleProbe', scope, ['extractErrorMessage'])()
        const displayed = consumer<ComputedRef<string>>(path, 'localizedError', scope)
        const truncated = consumer<ComputedRef<string>>(path, 'truncatedError', { ...scope, localizedError: displayed })
        expect(scope.error.value).toBe(isRussian() ? t('common.error') : raw)
        expect(displayed.value).toBe(isRussian() ? t('monitorCommon.quota.errors.generic') : raw)
        expect(truncated.value).toBe(displayed.value.length > 80 ? `${displayed.value.slice(0, 80)}...` : displayed.value)
        expect(scope.adminAPI.cnProviders[api]).toHaveBeenCalledTimes(1)
        expect(scope.adminAPI.cnProviders[api]).toHaveBeenCalledWith(73)
        expect({ failure, result }).toEqual(before)
      }
    })
    it.each(locales)(`${path} raw display is not trimmed or summarized, including known patterns (%s)`, locale => {
      language.current = locale
      for (const raw of ['  custom upstream failure  ', 'Authentication failed (HTTP 401): preserve request-id=abc suffix', '', null]) {
        const error = ref(raw)
        const displayed = consumer<ComputedRef<string>>(path, 'localizedError', { ...baseScope(), error })
        expect(displayed.value).toBe(isRussian() ? localizeQuotaDiagnostic(raw, t) : raw || localizeQuotaDiagnostic(raw, t))
        expect(error.value).toBe(raw)
      }
    })
  }
})

describe('REG-067/068: actual shared monitor display boundaries', () => {
  it.each(locales)('preserves complete snapshot and run-result diagnostics (%s)', locale => {
    language.current = locale
    for (const raw of ['  unknown provider error  ', 'Authentication failed (HTTP 403): request-id=unchanged', '', undefined]) {
      const snapshot = { success: false, error: raw, tiers: [{ window: 'custom_window', label: 'custom_label', used_percent: 17 }], balance: 3.5, currency: 'CNY' }
      const before = structuredClone(snapshot)
      const scope = { ...baseScope(), props: { snapshot } }
      const displayed = consumer<ComputedRef<string>>('components/common/MonitorQuotaView.vue', 'localizedError', scope)
      const truncated = consumer<ComputedRef<string>>('components/common/MonitorQuotaView.vue', 'truncatedError', { ...scope, localizedError: displayed })
      const fallback = localizeQuotaDiagnostic(raw, t) || t('monitorCommon.quota.unavailable')
      expect(displayed.value).toBe(isRussian() ? fallback : raw || fallback)
      expect(truncated.value).toBe(displayed.value.length > 48 ? `${displayed.value.slice(0, 48)}…` : displayed.value)
      const displayMessage = consumer<(message: string) => string>('components/admin/monitor/MonitorRunResultDialog.vue', 'displayMessage', baseScope())
      const runFallback = localizeQuotaDiagnostic(raw, t) || t('monitorCommon.quota.errors.generic')
      expect(displayMessage(raw || '')).toBe(isRussian() ? runFallback : raw || runFallback)
      expect(snapshot).toEqual(before)
    }
  })
  it.each(locales)('keeps quota machine window/label tokens, values and row references intact (%s)', locale => {
    language.current = locale
    const tier = { window: 'custom_window', label: 'custom_label', used_percent: 17, reset_at: '2026-12-01T00:00:00Z' }
    const snapshot = { success: true, tiers: [tier], balances: [{ balance: 3.5, currency: 'CNY' }] }
    const before = structuredClone(snapshot)
    const scope = { ...baseScope(), te: () => false, props: { snapshot } }
    const path = 'components/common/MonitorQuotaView.vue'
    const rows = consumer<ComputedRef<{ key: string; label: string; tier: typeof tier }[]>>(path, 'tierRows', scope,
      ['windowI18nKeys', 'labelI18nKeys', 'windowLabel', 'tierLabel', 'tierColors'])
    expect(rows.value[0]).toMatchObject({ key: 'custom_window-custom_label-0', label: 'custom_label/custom_window' })
    expect(rows.value[0]!.tier).toBe(tier)
    const balances = consumer<ComputedRef<typeof snapshot.balances>>(path, 'balanceRows', scope)
    expect(balances.value).toBe(snapshot.balances)
    expect(snapshot).toEqual(before)
  })
})

describe('REG-030: actual compliance submit error is message-only', () => {
  it.each(locales)('retains original message, not contradictory nested detail, without changing acknowledgement (%s)', async locale => {
    language.current = locale
    for (const message of ['  exact acceptance failure  ', '', undefined]) {
      const failure = { message, code: 'COMPLIANCE_REJECTED', response: { data: { detail: 'Wrong detail', message: 'Wrong nested message' } } }
      const before = structuredClone(failure)
      const scope = { ...baseScope(), attemptedSubmit: ref(false), canSubmit: ref(true), typedPhrase: ref('  exact acknowledgement  '),
        complianceStore: { accept: vi.fn(() => Promise.reject(failure)) },
        appStore: { showError: vi.fn(), showSuccess: vi.fn() },
      }
      await consumer<() => Promise<void>>('components/admin/AdminComplianceDialog.vue', 'submit', scope)()
      expect(scope.appStore.showError).toHaveBeenCalledTimes(1)
      expect(scope.appStore.showError).toHaveBeenCalledWith(isRussian() ? t('adminCompliance.acceptFailed') : message || t('adminCompliance.acceptFailed'))
      expect(scope.complianceStore.accept).toHaveBeenCalledTimes(1)
      expect(scope.complianceStore.accept).toHaveBeenCalledWith('exact acknowledgement')
      expect(scope.typedPhrase.value).toBe('  exact acknowledgement  ')
      expect(scope.appStore.showSuccess).not.toHaveBeenCalled()
      expect(failure).toEqual(before)
    }
  })
})

describe('REG-059..062: actual promo handlers remain detail-only', () => {
  const cases = [
    ['handleCreate', 'create', 'failedToCreate'], ['handleUpdate', 'update', 'failedToUpdate'],
    ['confirmDelete', 'delete', 'failedToDelete'], ['loadUsages', 'getUsages', 'failedToLoadUsages'],
  ] as const
  for (const [name, method, key] of cases) {
    it.each(locales)(`${name} does not adopt envelope or response.message when detail is empty (%s)`, async locale => {
      language.current = locale
      for (const detail of ['  exact promo detail  ', '', undefined]) {
        const failure = { message: 'Wrong envelope', reason: 'UNCHANGED_REASON', response: { data: { detail, message: 'Wrong nested message', code: 'UNCHANGED_CODE' } } }
        const before = structuredClone(failure)
        const reject = vi.fn(() => Promise.reject(failure))
        const scope = { ...baseScope(), adminAPI: { promo: { [method]: reject } },
          appStore: { showError: vi.fn(), showSuccess: vi.fn() },
          createForm: { code: 'RAW_PROMO', bonus_amount: 3.25, max_uses: 7, expires_at_str: '', notes: 'raw notes' },
          editForm: { code: 'RAW_PROMO', bonus_amount: 3.25, max_uses: 7, status: 'disabled', expires_at_str: '', notes: 'raw notes' },
          creating: ref(false), updating: ref(false), editingCode: ref({ id: 82 }), deletingCode: ref({ id: 82 }),
          currentViewingCode: ref({ id: 82 }), usagesLoading: ref(false), usages: ref([]), usagesPage: ref(2), usagesPageSize: ref(20), usagesTotal: ref(0),
        }
        await consumer<() => Promise<void>>('views/admin/PromoCodesView.vue', name, scope)()
        expect(scope.appStore.showError).toHaveBeenCalledTimes(1)
        expect(scope.appStore.showError).toHaveBeenCalledWith(isRussian() ? t(`admin.promo.${key}`) : detail || t(`admin.promo.${key}`))
        expect(scope.appStore.showSuccess).not.toHaveBeenCalled()
        expect(reject).toHaveBeenCalledTimes(1)
        if (method === 'create') expect(reject).toHaveBeenCalledWith({ code: 'RAW_PROMO', bonus_amount: 3.25, max_uses: 7, expires_at: undefined, notes: 'raw notes' })
        if (method === 'update') expect(reject).toHaveBeenCalledWith(82, { code: 'RAW_PROMO', bonus_amount: 3.25, max_uses: 7, status: 'disabled', expires_at: 0, notes: 'raw notes' })
        if (method === 'delete') expect(reject).toHaveBeenCalledWith(82)
        if (method === 'getUsages') expect(reject).toHaveBeenCalledWith(82, 2, 20)
        expect(scope.creating.value).toBe(false)
        expect(scope.updating.value).toBe(false)
        expect(scope.usagesLoading.value).toBe(false)
        expect(failure).toEqual(before)
      }
    })
  }
})

describe('REG-073: actual batch-image unknown item errors retain message then code', () => {
  it.each(locales)('keeps known code translations and unknown raw identifiers unchanged (%s)', locale => {
    language.current = locale
    const friendly = consumer<(error: { message?: string; code?: string } | null) => string>(
      'views/user/BatchImageGuideView.vue', 'friendlyItemError', baseScope(), ['batchImageText'])
    for (const [error, raw] of [
      [{ message: '  exact item message  ', code: 'FUTURE_ITEM_CODE' }, '  exact item message  '],
      [{ message: '', code: 'FUTURE_ITEM_CODE' }, 'FUTURE_ITEM_CODE'],
      [{ message: '', code: '' }, '-'], [{}, '-'],
    ] as const) {
      const before = structuredClone(error)
      expect(friendly(error)).toBe(isRussian() ? t('batchImage.messages.errorReference') : raw)
      expect(error).toEqual(before)
    }
    for (const [code, key] of [['EMPTY_IMAGE_OUTPUT', 'emptyImageOutput'], ['PROVIDER_ITEM_FAILED', 'providerItemFailed']] as const) {
      const error = { code, message: 'Must not override known translation' }
      expect(friendly(error)).toBe(t(`batchImage.itemResult.${key}`))
      expect(error.code).toBe(code)
    }
    expect(friendly(null)).toBe('-')
  })
})

describe('REG-074: actual plugin incompatible unknown diagnostics', () => {
  it.each(locales)('preserves unknown raw only after known mapping, without changing versions/status (%s)', locale => {
    language.current = locale
    const path = 'views/admin/PluginsView.vue'
    const display = consumer<(plugin: { compatibility: Record<string, unknown> }) => string>(path, 'localizedCompatibilityMessage', baseScope(),
      ['pluginBackendMessageKeys', 'localizedPluginBackendMessage'])
    for (const message of ['  custom ABI rejection; identifier=raw  ', '', undefined]) {
      const plugin = { compatibility: { status: 'incompatible', compatible: false, message, current_sub2api_version: '0.2.19-ru.1', required_sub2api_version: '>=0.3.0' } }
      const before = structuredClone(plugin)
      const fallback = t('admin.plugins.messages.incompatibleVersion', { current: '0.2.19-ru.1', required: '>=0.3.0' })
      expect(display(plugin)).toBe(isRussian() ? fallback : message || fallback)
      expect(plugin).toEqual(before)
    }
    const keys = consumer<Record<string, string>>(path, 'pluginBackendMessageKeys', baseScope())
    for (const [message, key] of Object.entries(keys)) {
      const plugin = { compatibility: { status: 'incompatible', message } }
      const before = structuredClone(plugin)
      expect(display(plugin)).toBe(t(key))
      expect(plugin).toEqual(before)
    }
    for (const [status, key] of [['compatible', 'compatibleTested'], ['untested', 'compatibleUntested']] as const) {
      expect(display({ compatibility: { status, message: 'Wrong raw' } })).toBe(t(`admin.plugins.messages.${key}`))
    }
    expect(display({ compatibility: { status: 'incompatible', message: '' } })).toBe(t('admin.plugins.messages.incompatibleVersion', { current: '-', required: '-' }))
  })
})
