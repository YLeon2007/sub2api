import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { computed, ref } from 'vue'
import { parse } from 'vue/compiler-sfc'
import ts from 'typescript'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as apiErrors from '@/utils/apiError'
import { localizeQuotaDiagnostic } from '@/utils/quotaDiagnostics'

const language = vi.hoisted(() => ({ current: 'ru' }))
vi.mock('@/i18n', () => ({ getLocale: () => language.current }))
beforeEach(() => { language.current = 'ru' })

// Only transport and surrounding state are fixtures. Execute the actual SFC
// declarations together, including their helper, computed and event paths.
function consumers(path: string, names: string[], scope: Record<string, unknown>) {
  const { descriptor } = parse(readFileSync(resolve(process.cwd(), 'src', path), 'utf8'))
  const file = ts.createSourceFile(path, descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const statements = names.map(name => {
    const statement = file.statements.find(node =>
      (ts.isFunctionDeclaration(node) && node.name?.text === name) ||
      (ts.isVariableStatement(node) && node.declarationList.declarations.some(decl => ts.isIdentifier(decl.name) && decl.name.text === name)),
    )
    if (!statement) throw new Error(`Missing actual consumer: ${path}:${name}`)
    return statement.getText(file)
  })
  const code = ts.transpileModule(statements.join('\n'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText
  return new Function(...Object.keys(scope), `${code}\nreturn { ${names.join(', ')} }`)(...Object.values(scope))
}
const locales = ['ru', 'ru-RU', 'en', 'zh']
const t = (key: string, params?: Record<string, unknown>) =>
  `translated:${language.current}:${key}${params ? `:${JSON.stringify(params)}` : ''}`
const isRu = () => language.current === 'ru' || language.current === 'ru-RU'
const failure = (message?: string) => ({ message, error: 'Other error field', reason: 'UNKNOWN_REASON',
  response: { data: { detail: 'Other detail', message: 'Other response message' } } })
function baseScope() {
  return { ...apiErrors, ref, computed, t, locale: ref(language.current),
    appStore: { showSuccess: vi.fn(), showError: vi.fn() }, console: { error: vi.fn() },
  }
}
const bulkPath = 'components/account/BulkEditAccountModal.vue'
const editPath = 'components/account/EditAccountModal.vue'

function bulkScope(transport: () => Promise<unknown>) {
  return { ...baseScope(), canPreCheck: () => true, mixedChannelConfirmed: ref(false),
    targetSelectedPlatforms: ref(['antigravity']), groupIds: ref([7]),
    pendingUpdatesForConfirm: ref<Record<string, unknown> | null>(null),
    mixedChannelWarningMessage: ref(''), showMixedChannelWarning: ref(false), submitting: ref(false),
    targetMode: ref('selected'), props: { accountIds: [31, 32] }, emit: vi.fn(), handleClose: vi.fn(),
    adminAPI: { accounts: { checkMixedChannelRisk: vi.fn(transport), bulkUpdate: vi.fn(transport) } },
  }
}
function editScope(transport: () => Promise<unknown>) {
  return { ...baseScope(), props: { account: { id: 31, platform: 'antigravity', type: 'oauth' } },
    form: { status: 'active', group_ids: [7], proxy_id: null, expires_at: null, load_factor: 1 },
    needsMixedChannelCheck: () => true, antigravityMixedChannelConfirmed: ref(false),
    mixedChannelWarningDetails: ref(null), mixedChannelWarningRawMessage: ref(''),
    mixedChannelWarningAction: ref(null), showMixedChannelWarning: ref(false),
    buildMixedChannelDetails: () => null, submitting: ref(false),
    persistGrokMediaEligibility: vi.fn(async (_id: number, account: unknown) => account),
    emit: vi.fn(), handleClose: vi.fn(),
    adminAPI: { accounts: { checkMixedChannelRisk: vi.fn(transport), update: vi.fn(transport) } },
  }
}

describe('additional account edit/bulk message-only contracts', () => {
  it.each(locales)('bulk precheck never expands message-only selection (%s)', async locale => {
    language.current = locale
    for (const message of ['Original primary', '', undefined]) {
      const error = failure(message)
      const original = structuredClone(error)
      const scope = bulkScope(() => Promise.reject(error))
      const { preCheckMixedChannelRisk } = consumers(bulkPath, ['preCheckMixedChannelRisk'], scope)
      expect(await preCheckMixedChannelRisk({ priority: 4 })).toBe(false)
      expect(scope.appStore.showError).toHaveBeenCalledWith(isRu() || !message ? t('admin.accounts.bulkEdit.failed') : message)
      expect(scope.pendingUpdatesForConfirm.value).toBeNull()
      expect(error).toEqual(original)
    }
  })
  it.each(locales)('bulk risk result keeps the old EN/ZH failure fallback (%s)', async locale => {
    language.current = locale
    for (const message of ['Original risk', '', undefined]) {
      const result = { has_risk: true, message, details: { group_name: 'raw-group' } }
      const scope = bulkScope(async () => result)
      const built = { priority: 4, group_ids: [7] }
      const { preCheckMixedChannelRisk } = consumers(bulkPath, ['preCheckMixedChannelRisk'], scope)
      expect(await preCheckMixedChannelRisk(built)).toBe(false)
      expect(scope.mixedChannelWarningMessage.value).toBe(isRu() ? t('admin.accounts.mixedChannelWarningGeneric') : message || t('admin.accounts.bulkEdit.failed'))
      expect(scope.pendingUpdatesForConfirm.value).toEqual(built)
      expect(scope.showMixedChannelWarning.value).toBe(true)
      expect(result.message).toBe(message)
    }
  })
  it.each(locales)('bulk catch preserves selectors, codes and exact submitted values (%s)', async locale => {
    language.current = locale
    for (const mixed of [false, true]) {
      for (const message of ['Original primary', '', undefined]) {
        const error = { ...failure(message), status: mixed ? 409 : 500, error: mixed ? 'mixed_channel_warning' : 'OTHER_CODE' }
        const original = structuredClone(error)
        const scope = bulkScope(() => Promise.reject(error))
        const payload = { group_ids: [7], priority: 4, extra: { mode: 'unchanged' } }
        const { submitBulkUpdate } = consumers(bulkPath, ['submitBulkUpdate'], scope)
        await submitBulkUpdate(payload)
        const key = mixed ? 'admin.accounts.mixedChannelWarningGeneric' : 'admin.accounts.bulkEdit.failed'
        // The upstream 409 branch assigns error.message verbatim: unlike
        // ordinary failures, an empty/absent value has no EN/ZH fallback.
        const expected = isRu() ? t(key) : mixed ? message : message || t(key)
        if (mixed) {
          expect(scope.mixedChannelWarningMessage.value).toBe(expected)
          expect(scope.pendingUpdatesForConfirm.value).toEqual(payload)
          expect(scope.showMixedChannelWarning.value).toBe(true)
        } else expect(scope.appStore.showError).toHaveBeenCalledWith(expected)
        expect(scope.adminAPI.accounts.bulkUpdate).toHaveBeenCalledWith([31, 32], payload)
        expect(payload).toEqual({ group_ids: [7], priority: 4, extra: { mode: 'unchanged' } })
        expect(error).toEqual(original)
        expect(scope.submitting.value).toBe(false)
      }
    }
  })
  it.each(locales)('edit precheck keeps message-only errors (%s)', async locale => {
    language.current = locale
    for (const message of ['Original primary', '', undefined]) {
      const scope = editScope(() => Promise.reject(failure(message)))
      const { ensureAntigravityMixedChannelConfirmed } = consumers(editPath, ['ensureAntigravityMixedChannelConfirmed'], scope)
      expect(await ensureAntigravityMixedChannelConfirmed(vi.fn())).toBe(false)
      expect(scope.appStore.showError).toHaveBeenCalledWith(isRu() || !message ? t('admin.accounts.failedToUpdate') : message)
    }
  })
  it.each(locales)('edit dialog preserves opts → response → original fallback (%s)', locale => {
    language.current = locale
    const scope = editScope(async () => ({}))
    const { openMixedChannelDialog } = consumers(editPath, ['openMixedChannelDialog'], scope)
    for (const [message, responseMessage, expected] of [
      ['Options primary', 'Response secondary', 'Options primary'],
      ['', 'Response primary', 'Response primary'],
      [undefined, undefined, t('admin.accounts.failedToUpdate')],
    ]) {
      const onConfirm = vi.fn()
      openMixedChannelDialog({ message, response: { message: responseMessage }, onConfirm })
      expect(scope.mixedChannelWarningRawMessage.value).toBe(isRu() ? t('admin.accounts.mixedChannelWarningGeneric') : expected)
      expect(scope.mixedChannelWarningAction.value).toBe(onConfirm)
      expect(scope.showMixedChannelWarning.value).toBe(true)
    }
  })
  it.each(locales)('edit update catch and actual dialog do not adopt other fields (%s)', async locale => {
    language.current = locale
    for (const mixed of [false, true]) {
      for (const message of ['Original primary', '', undefined]) {
        const error = { ...failure(message), status: mixed ? 409 : 500, error: mixed ? 'mixed_channel_warning' : 'OTHER_CODE' }
        const original = structuredClone(error)
        const scope = editScope(() => Promise.reject(error))
        const payload = { group_ids: [7], priority: 4, credentials: { model_mapping: { model: 'unchanged' } } }
        const { submitUpdateAccount } = consumers(editPath, ['openMixedChannelDialog', 'withAntigravityConfirmFlag', 'submitUpdateAccount'], scope)
        await submitUpdateAccount(31, payload)
        const expected = isRu() ? t(mixed ? 'admin.accounts.mixedChannelWarningGeneric' : 'admin.accounts.failedToUpdate') : message || t('admin.accounts.failedToUpdate')
        if (mixed) {
          expect(scope.mixedChannelWarningRawMessage.value).toBe(expected)
          expect(scope.showMixedChannelWarning.value).toBe(true)
        } else expect(scope.appStore.showError).toHaveBeenCalledWith(expected)
        expect(scope.adminAPI.accounts.update).toHaveBeenCalledWith(31, payload)
        expect(payload).toEqual({ group_ids: [7], priority: 4, credentials: { model_mapping: { model: 'unchanged' } } })
        expect(error).toEqual(original)
        expect(scope.persistGrokMediaEligibility).not.toHaveBeenCalled()
        expect(scope.submitting.value).toBe(false)
      }
    }
  })
  it.each(locales)('edit 409 forwards the exact raw selector to its localized dialog (%s)', async locale => {
    language.current = locale
    for (const message of ['Original primary', '', undefined]) {
      const error = { ...failure(message), status: 409, error: 'mixed_channel_warning' }
      const scope = { ...editScope(() => Promise.reject(error)), openMixedChannelDialog: vi.fn() }
      const actual = consumers(editPath, ['withAntigravityConfirmFlag', 'submitUpdateAccount'], scope)
      await actual.submitUpdateAccount(31, { priority: 4 })
      expect(scope.openMixedChannelDialog).toHaveBeenCalledTimes(1)
      expect(scope.openMixedChannelDialog.mock.calls[0]?.[0]?.message).toBe(message)
      expect(scope.openMixedChannelDialog.mock.calls[0]?.[0]?.onConfirm).toBeTypeOf('function')
    }
  })
  it.each(locales)('edit outer submit catch keeps its own message-only contract (%s)', async locale => {
    language.current = locale
    for (const message of ['Original primary', '', undefined]) {
      const scope = { ...editScope(async () => ({})), autoResetCreditEnabled: ref(false),
        // A failed reactive settings read is inside the actual outer try/catch,
        // before credential conversion or any persisted update can occur.
        autoPauseOnExpired: { get value(): boolean { throw failure(message) } },
        submitUpdateAccount: vi.fn(),
      }
      const original = structuredClone(scope.form)
      const { handleSubmit } = consumers(editPath, ['handleSubmit'], scope)
      await handleSubmit()
      expect(scope.appStore.showError).toHaveBeenCalledWith(isRu() || !message ? t('admin.accounts.failedToUpdate') : message)
      expect(scope.form).toEqual(original)
      expect(scope.submitUpdateAccount).not.toHaveBeenCalled()
    }
  })
})

describe('real referral/reset catches retain known codes and message-only unknowns', () => {
  it.each(locales)('referral refresh/send use actual computed admission and keep snapshots (%s)', async locale => {
    language.current = locale
    for (const sending of [false, true]) {
      for (const message of ['Original primary', '', undefined]) {
        const errorValue = failure(message)
        const originalError = structuredClone(errorValue)
        const snapshot = { program_id: 'codex_referral_workspace', should_show: true, available_invites: 2, requires_explicit_confirmation: true }
        const originalSnapshot = structuredClone(snapshot)
        const scope = { ...baseScope(), generation: 0, loading: ref(false), sending: ref(false), fresh: ref(true),
          error: ref(''), warning: ref(''), sentEmail: ref(''), email: ref(' fixture@example.invalid '), confirmed: ref(true),
          props: { account: { id: 31 } }, eligibility: ref(snapshot), isShadow: ref(false), count: ref(2), needsConsent: ref(true),
          refreshOpenAIReferrals: vi.fn(() => Promise.reject(errorValue)), sendOpenAIReferralInvite: vi.fn(() => Promise.reject(errorValue)),
        }
        const actual = consumers('components/account/OpenAIReferralCell.vue', ['errorMessage', 'canSend', 'refresh', 'sendInvite'], scope)
        if (sending) {
          expect(actual.canSend.value).toBe(true)
          await actual.sendInvite()
          expect(scope.sendOpenAIReferralInvite).toHaveBeenCalledWith(31, { email: 'fixture@example.invalid', program_id: 'codex_referral_workspace', confirmed: true })
          expect(scope.email.value).toBe(' fixture@example.invalid ')
          expect(scope.confirmed.value).toBe(true)
        } else await actual.refresh()
        expect(scope.error.value).toBe(isRu() || !message ? t('common.error') : message)
        expect(scope.eligibility.value).toEqual(originalSnapshot)
        expect(errorValue).toEqual(originalError)
        expect(scope.loading.value).toBe(false)
        expect(scope.sending.value).toBe(false)
        expect(actual.errorMessage({ ...failure('ignored'), reason: 'OPENAI_REFERRAL_REJECTED' })).toBe(t('admin.accounts.openaiReferral.rejected'))
        expect(actual.errorMessage({ ...failure('ignored'), reason: undefined, code: 'ERR_NETWORK' }, true)).toBe(t('admin.accounts.openaiReferral.sendUnknown'))
      }
    }
  })
  it.each(locales)('reset catch preserves idempotency key, snapshot and known-code feedback (%s)', async locale => {
    language.current = locale
    for (const message of ['Original primary', '', undefined]) {
      const errorValue = failure(message)
      const originalError = structuredClone(errorValue)
      const snapshot = { credits: [{ redeemable: true, clears: ['5h'] }] }
      const originalSnapshot = structuredClone(snapshot)
      const scope = { ...baseScope(), generation: 0, pendingKey: 'persisted-operation-key',
        showRedeemConfirm: ref(true), redeeming: ref(false), loading: ref(false), canRedeem: ref(true),
        props: { account: { id: 31 } }, status: ref(snapshot), redeemFeedback: ref(null),
        newOperationKey: vi.fn(), redeemClaudeResetCredit: vi.fn(() => Promise.reject(errorValue)),
        emit: vi.fn(), refresh: vi.fn(), outcomeFeedback: vi.fn(),
      }
      const actual = consumers('components/account/ClaudeResetCreditsCell.vue', ['preClaimRefusals', 'errorText', 'confirmRedeem', 'feedbackClass'], scope)
      await actual.confirmRedeem()
      expect(scope.redeemFeedback.value).toEqual({ kind: 'error', text: isRu() || !message ? t('admin.accounts.claudeResetCredits.outcome.failed') : message })
      expect(actual.feedbackClass.value).toBe('text-red-600 dark:text-red-400')
      await actual.confirmRedeem()
      expect(scope.redeemClaudeResetCredit.mock.calls).toEqual([[31, 'persisted-operation-key'], [31, 'persisted-operation-key']])
      expect(scope.newOperationKey).not.toHaveBeenCalled()
      expect(scope.status.value).toEqual(originalSnapshot)
      expect(scope.refresh).not.toHaveBeenCalled()
      expect(errorValue).toEqual(originalError)
      expect(scope.redeeming.value).toBe(false)
      expect(actual.errorText({ ...failure('ignored'), reason: 'CLAUDE_RESET_BUSY' })).toBe(t('admin.accounts.claudeResetCredits.outcome.busy'))
    }
  })
})

const testPaths = ['components/account/AccountTestModal.vue', 'components/admin/account/AccountTestModal.vue']
function testScope(transport: () => Promise<unknown>) {
  return { ...baseScope(), props: { account: { id: 31, name: 'Fixture', type: 'oauth' } },
    selectedModelId: ref('model-id'), canStartTest: ref(true), status: ref('idle'), errorMessage: ref(''),
    streamingContent: ref(''), outputLines: ref<Array<{ text: string; class: string }>>([]), scrollToBottom: vi.fn(),
    resetState: vi.fn(), abortStream: vi.fn(), abortController: null, buildApiUrl: (path: string) => path,
    fetch: vi.fn(transport), localStorage: { getItem: () => 'fixture-token' }, ADMIN_UI_REQUEST_HEADER: 'X-Fixture',
    supportsImageTest: ref(false), supportsPromptInput: ref(false), showModelSelect: ref(true),
    testPrompt: ref(''), isOpenAIAccount: ref(true), isGrokAccount: ref(false), testMode: ref('default'),
  }
}

describe('actual account test catch/event primary and diagnostic channels', () => {
  for (const path of testPaths) {
    const admin = path.includes('/admin/')
    it.each(locales)(`${path}: start catch keeps original selector/fallback and raw log (%s)`, async locale => {
      language.current = locale
      for (const error of [new Error('Original transport primary'), new Error(''), failure('Not an Error'), 'Thrown string']) {
        const scope = testScope(() => Promise.reject(error))
        const { startTest } = consumers(path, ['addLine', 'startTest'], scope)
        await startTest()
        const raw = error instanceof Error ? error.message : admin ? t('common.unknownError') : 'Unknown error'
        expect(scope.errorMessage.value).toBe(isRu() ? t('admin.accounts.testFailed') : raw)
        expect(scope.outputLines.value.at(-1)).toEqual({ text: t('admin.accounts.errorPrefix', { message: raw }), class: 'text-red-400' })
        expect(scope.status.value).toBe('error')
        const request = scope.fetch.mock.calls[0] as unknown as [string, RequestInit]
        expect(request[0]).toBe('/admin/accounts/31/test')
        expect(JSON.parse(request[1].body as string)).toEqual({ model_id: 'model-id', prompt: '', mode: 'default' })
      }
    })
    it.each(locales)(`${path}: complete/error retain exact unknown fallback and diagnostics (%s)`, locale => {
      language.current = locale
      for (const type of ['test_complete', 'error']) {
        for (const error of ['Original event primary', '', undefined]) {
          const scope = testScope(async () => ({}))
          scope.streamingContent.value = 'Unmodified streaming content'
          const names = admin ? ['localizeKnownAccountTestText', 'primaryTestError', 'addLine', 'handleEvent'] : ['addLine', 'handleEvent']
          const { handleEvent } = consumers(path, names, scope)
          const event = { type, success: false, error }
          const original = structuredClone(event)
          handleEvent(event)
          const fallback = admin ? t(type === 'error' ? 'common.unknownError' : 'admin.accounts.testFailed') : type === 'error' ? 'Unknown error' : 'Test failed'
          expect(scope.errorMessage.value).toBe(isRu() ? t('admin.accounts.testFailed') : error || fallback)
          expect(scope.outputLines.value).toContainEqual({ text: 'Unmodified streaming content', class: 'text-green-300' })
          if (error) expect(scope.outputLines.value).toContainEqual({ text: t('admin.accounts.errorPrefix', { message: error }), class: 'text-red-400' })
          expect(scope.streamingContent.value).toBe('')
          expect(scope.status.value).toBe('error')
          expect(event).toEqual(original)
        }
      }
    })
  }
  it.each(locales)('admin compact exact-message translations survive, near matches stay diagnostic (%s)', locale => {
    language.current = locale
    const unsupported = 'Upstream returned 2xx without a compaction output item (native remote compaction v2 unsupported on this chain)'
    for (const type of ['test_complete', 'error']) {
      const scope = testScope(async () => ({}))
      scope.testMode.value = 'compact'
      const { handleEvent } = consumers(testPaths[1]!, ['localizeKnownAccountTestText', 'primaryTestError', 'addLine', 'handleEvent'], scope)
      handleEvent({ type, success: false, error: unsupported })
      expect(scope.errorMessage.value).toBe(t('admin.accounts.openai.compactProbeUnsupported'))
      handleEvent({ type, success: false, error: `${unsupported} extra detail` })
      expect(scope.errorMessage.value).toBe(isRu() ? t('admin.accounts.testFailed') : `${unsupported} extra detail`)
      expect(scope.outputLines.value).toContainEqual({ text: t('admin.accounts.errorPrefix', { message: `${unsupported} extra detail` }), class: 'text-red-400' })
    }
    const scope = testScope(async () => ({}))
    scope.testMode.value = 'compact'
    const { handleEvent } = consumers(testPaths[1]!, ['localizeKnownAccountTestText', 'primaryTestError', 'addLine', 'handleEvent'], scope)
    handleEvent({ type: 'content', text: 'Compact probe succeeded (native remote compaction v2)' })
    expect(scope.streamingContent.value).toBe(t('admin.accounts.openai.compactProbeSuccess'))
  })
})

// The last three strict equality branches bypassed the established RU-root
// contract even though the surrounding catches already handled regional RU.
describe('regional Russian boundaries at the actual remaining consumers', () => {
  const localeCases = ['ru', 'ru-RU', 'ru_RU', 'RU', 'en', 'zh', 'russian']
  const russian = (value: string) => value.toLowerCase().split(/[-_]/)[0] === 'ru'
  it.each(localeCases)('admin reauth preserves each EN/ZH mode and localizes the RU root (%s)', locale => {
    language.current = locale
    const { reauthErrorText } = consumers('components/admin/account/ReAuthAccountModal.vue', ['reauthErrorText'], baseScope())
    const fallback = t('admin.accounts.oauth.authFailed')
    const cases = [
      { input: { message: 'Envelope', response: { data: { detail: 'Detail', message: 'Nested' } } }, expected: ['Detail', 'Detail', 'Detail'] },
      { input: { message: 'Envelope', response: { data: { message: 'Nested' } } }, expected: [fallback, 'Nested', 'Envelope'] },
      { input: { message: 'Envelope', response: { data: { detail: '', message: '' } } }, expected: [fallback, 'Envelope', 'Envelope'] },
      { input: { message: '', response: { data: { message: '' } } }, expected: [fallback, fallback, fallback] },
      { input: undefined, expected: [fallback, fallback, fallback] },
    ]
    for (const { input, expected } of cases) {
      const before = structuredClone(input)
      for (const [index, mode] of ['detail', 'detail-message-error', 'detail-error'].entries()) {
        expect(reauthErrorText(input, fallback, mode)).toBe(russian(locale) ? fallback : expected[index])
      }
      expect(input).toEqual(before)
    }
  })
  it.each(localeCases)('successful Grok quota response localizes only display, preserving result and emission (%s)', async locale => {
    language.current = locale
    for (const raw of ['Provider temporarily unavailable', 'Authentication failed (HTTP 401): request-id=keep', '', null, undefined]) {
      const result = { probe_error: raw, success: false, quota: { remaining: 17 }, code: 'UNCHANGED_CODE' }
      const before = structuredClone(result)
      const queryQuota = vi.fn(async () => result)
      const scope = { ...baseScope(), localizeQuotaDiagnostic, props: { account: { id: 31 } },
        loading: ref(false), error: ref<string | null>(null), data: ref<unknown>(null), emit: vi.fn(),
        adminAPI: { grok: { queryQuota } },
      }
      const { handleProbe } = consumers('components/account/GrokQuotaProbeCell.vue', ['extractErrorMessage', 'handleProbe'], scope)
      await handleProbe()
      expect(scope.error.value).toBe(raw ? russian(locale) ? localizeQuotaDiagnostic(raw, t) : raw : null)
      expect(scope.data.value).toEqual(result)
      expect(scope.emit).toHaveBeenCalledWith('probed', scope.data.value)
      expect(queryQuota).toHaveBeenCalledTimes(1)
      expect(queryQuota).toHaveBeenCalledWith(31)
      expect(result).toEqual(before)
      expect(scope.loading.value).toBe(false)
    }
  })
  it.each(localeCases)('admin status event keeps the original event while localizing the RU display (%s)', locale => {
    language.current = locale
    for (const text of ['Provider queued: custom detail', '', undefined]) {
      const scope = testScope(async () => ({}))
      scope.streamingContent.value = 'User-authored model content'
      const { handleEvent } = consumers(testPaths[1]!, ['localizeKnownAccountTestText', 'primaryTestError', 'addLine', 'handleEvent'], scope)
      const event = { type: 'status', text, model: 'machine-model-id' }
      const before = structuredClone(event)
      handleEvent(event)
      expect(scope.outputLines.value).toEqual(text ? [{ text: russian(locale) ? t('admin.accounts.testing') : text, class: 'text-cyan-300' }] : [])
      expect(scope.status.value).toBe('idle')
      expect(scope.streamingContent.value).toBe('User-authored model content')
      expect(scope.errorMessage.value).toBe('')
      expect(scope.fetch).not.toHaveBeenCalled()
      expect(event).toEqual(before)
    }
  })
})
