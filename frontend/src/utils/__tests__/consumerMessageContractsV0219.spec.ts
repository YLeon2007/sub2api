import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'vue/compiler-sfc'
import ts from 'typescript'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as apiErrors from '@/utils/apiError'

const language = vi.hoisted(() => ({ current: 'ru' }))
vi.mock('@/i18n', () => ({ getLocale: () => language.current }))
beforeEach(() => { language.current = 'ru' })

// Execute the actual SFC handler, not a copy of its catch expression. Only
// external APIs and surrounding reactive state are supplied by the fixture.
function handler(path: string, name: string, scope: Record<string, unknown>) {
  const { descriptor } = parse(readFileSync(resolve(process.cwd(), 'src', path), 'utf8'))
  const file = ts.createSourceFile(path, descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const statement = file.statements.find(node =>
    (ts.isFunctionDeclaration(node) && node.name?.text === name) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some(decl => ts.isIdentifier(decl.name) && decl.name.text === name)),
  )
  if (!statement) throw new Error(`Missing actual handler: ${path}:${name}`)
  const code = ts.transpileModule(statement.getText(file), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
  return new Function(...Object.keys(scope), `${code}\nreturn ${name}`)(...Object.values(scope)) as () => Promise<void>
}
// Exercise the actual outer catch block when the complete handler's payload
// construction is irrelevant to error selection. No catch expressions are copied.
function executeCatch(path: string, name: string, scope: Record<string, unknown>, caughtError: unknown) {
  const { descriptor } = parse(readFileSync(resolve(process.cwd(), 'src', path), 'utf8'))
  const file = ts.createSourceFile(path, descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const statement = file.statements.find(node =>
    (ts.isFunctionDeclaration(node) && node.name?.text === name) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some(decl => ts.isIdentifier(decl.name) && decl.name.text === name)),
  )
  if (!statement) throw new Error(`Missing actual handler: ${path}:${name}`)
  const catches: ts.CatchClause[] = []
  function visit(node: ts.Node) { if (ts.isCatchClause(node)) catches.push(node); ts.forEachChild(node, visit) }
  visit(statement)
  const actualCatch = catches.sort((a, b) => b.end - a.end)[0]
  if (!actualCatch) throw new Error(`Missing actual catch: ${path}:${name}`)
  const code = ts.transpileModule(`try { throw caughtFixtureError } ${actualCatch.getText(file)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText
  return new Function(...Object.keys(scope), 'caughtFixtureError', code)(...Object.values(scope), caughtError)
}

const ref = <T>(value: T) => ({ value })
const t = (key: string) => `translated:${language.current}:${key}`
const failure = { message: 'Envelope message', response: { data: { detail: 'Specific detail', message: 'Specific version failure' } } }
const reject = () => Promise.reject(failure)
function baseScope() {
  return {
    ...apiErrors, t, locale: { value: language.current },
    appStore: { showSuccess: vi.fn(), showError: vi.fn(), clearVersionCache: vi.fn() },
  }
}

describe('regional generic error fallback contracts', () => {
  it.each(['ru-RU', 'ru_RU', 'RU'])('keeps regional Russian primary copy localized (%s)', locale => {
    language.current = locale
    expect(apiErrors.extractApiErrorMessage(failure, t('common.error'))).toBe(t('common.error'))
    expect(apiErrors.extractApiErrorMessage(failure, t('common.error'), undefined, locale)).toBe(t('common.error'))
  })
})

describe('actual group create/update/duplicate catch selectors', () => {
  for (const [name, fallback] of [
    ['handleCreateGroup', 'admin.groups.failedToCreate'],
    ['handleUpdateGroup', 'admin.groups.failedToUpdate'],
    ['handleDuplicate', 'admin.groups.duplicateFailed'],
  ]) {
    it.each(['ru', 'ru-RU', 'en', 'zh'])(`${name} preserves generic selector and known reasons (%s)`, async locale => {
      language.current = locale
      const scope = { ...baseScope(), console: { error: vi.fn() } }
      for (const error of [failure, { response: { data: { detail: 'Detail only' } } }, {}]) {
        scope.appStore.showError.mockClear()
        await executeCatch('views/admin/GroupsView.vue', name, scope, error)
        const raw = error === failure ? 'Envelope message' : 'response' in error ? 'Detail only' : t(fallback)
        expect(scope.appStore.showError).toHaveBeenCalledWith(locale.startsWith('ru') ? t(fallback) : raw)
      }
      if (name !== 'handleDuplicate') {
        scope.appStore.showError.mockClear()
        await executeCatch('views/admin/GroupsView.vue', name, scope, { reason: 'FIXTURE_KNOWN', message: 'Raw known detail' })
        expect(scope.appStore.showError).toHaveBeenCalledWith(t('admin.groups.errors.FIXTURE_KNOWN'))
      }
    })
  }
})

describe('real auth and redemption handler error precedence', () => {
  it.each(['ru', 'en', 'zh'])('preserves detail before message in forgot-password (%s)', async locale => {
    language.current = locale
    const errorMessage = ref('')
    const scope = { ...baseScope(), errorMessage, validateForm: () => true, acquireActionProof: async () => true,
      isLoading: ref(false), formData: { email: 'fixture@example.invalid' }, forgotPassword: reject,
      turnstileEnabled: ref(false), aliyunCaptchaEnabled: ref(false), tencentCaptchaEnabled: ref(false),
      turnstileToken: ref(''), tencentCaptchaRandstr: ref(''), captchaEnabled: ref(false), isSubmitted: ref(false),
    }
    await handler('views/auth/ForgotPasswordView.vue', 'handleSubmit', scope)()
    expect(errorMessage.value).toBe(locale === 'ru' ? t('auth.sendResetLinkFailed') : 'Specific detail')
    expect(scope.appStore.showError).toHaveBeenCalledWith(errorMessage.value)
    expect(scope.isLoading.value).toBe(false)
  })
  it.each(['ru', 'en', 'zh'])('preserves detail before message in reset-password (%s)', async locale => {
    language.current = locale
    const errorMessage = ref('')
    const scope = { ...baseScope(), errorMessage, validateForm: () => true, isLoading: ref(false),
      formData: { password: 'fixture-password' }, email: ref('fixture@example.invalid'), token: ref('fixture'),
      resetPassword: reject, isSuccess: ref(false),
    }
    await handler('views/auth/ResetPasswordView.vue', 'handleSubmit', scope)()
    expect(errorMessage.value).toBe(locale === 'ru' ? t('auth.resetPasswordFailed') : 'Specific detail')
    expect(scope.appStore.showError).toHaveBeenCalledWith(errorMessage.value)
    expect(scope.isLoading.value).toBe(false)
  })
  it.each(['ru', 'en', 'zh'])('keeps redeem detail-only fallback and never adopts envelope message (%s)', async locale => {
    language.current = locale
    for (const error of [failure, { message: 'Envelope only' }]) {
      const errorMessage = ref('')
      const scope = { ...baseScope(), errorMessage, redeemCode: ref('fixture-code'), submitting: ref(false),
        redeemResult: ref(null), redeemAPI: { redeem: () => Promise.reject(error) },
      }
      await handler('views/user/RedeemView.vue', 'handleRedeem', scope)()
      expect(errorMessage.value).toBe(locale !== 'ru' && 'response' in error ? 'Specific detail' : t('redeem.failedToRedeem'))
      expect(scope.submitting.value).toBe(false)
    }
  })
})

describe('real updater handlers retain EN/ZH diagnostic priority', () => {
  const cases = [
    ['handleUpdate', 'updateError', 'version.updateFailed'],
    ['loadRollbackVersions', 'rollbackVersionsError', 'version.loadVersionsFailed'],
    ['handleRollback', 'rollbackError', 'version.rollbackFailed'],
  ] as const
  for (const [name, output, fallback] of cases) {
    it.each(['ru', 'en', 'zh'])(`${name} localizes only RU (%s)`, async locale => {
      language.current = locale
      const scope = { ...baseScope(), updating: ref(false), updateError: ref(''), updateSuccess: ref(false),
        performUpdate: reject, isAdmin: ref(true), rollbackVersionsLoading: ref(false), rollbackVersionsError: ref(''),
        getRollbackVersions: reject, rollingBack: ref(false), selectedRollbackVersion: ref('0.2.17-ru.1'),
        rollbackAPI: reject, rollbackError: ref(''),
      }
      await handler('components/common/VersionBadge.vue', name, scope)()
      expect(scope[output].value).toBe(locale === 'ru' ? t(fallback) : 'Specific version failure')
    })
  }
})

describe('remaining actual backup failure branches', () => {
  for (const name of ['loadS3Config', 'saveS3Config', 'loadImageStorageConfig', 'saveImageStorageConfig',
    'loadSchedule', 'saveSchedule', 'loadBackups', 'createBackup', 'downloadBackup', 'restoreBackup', 'removeBackup']) {
    it.each(['ru', 'ru-RU', 'en', 'zh'])(`${name} keeps message-only network selector (%s)`, async locale => {
      language.current = locale
      const scope = { ...baseScope(), creatingBackup: ref(true), restoringId: ref('fixture'),
        isStepUpCancelled: () => false, reportStepUpBlocked: () => false }
      for (const error of [failure, { response: { data: { detail: 'Ignored detail-only field' } } }, {}]) {
        scope.appStore.showError.mockClear()
        await executeCatch('views/admin/BackupView.vue', name, scope, error)
        expect(scope.appStore.showError).toHaveBeenCalledWith(!locale.startsWith('ru') && error === failure ? 'Envelope message' : t('errors.networkError'))
      }
    })
  }
  for (const [name, fallback, field] of [
    ['startPolling', 'admin.backup.operations.backupFailed', 'error_message'],
    ['startRestorePolling', 'admin.backup.operations.restoreFailed', 'restore_error'],
  ] as const) {
    it.each(['ru', 'ru-RU', 'en', 'zh'])(`${name} preserves the correct record diagnostic (%s)`, async locale => {
      language.current = locale
      let tick: (() => Promise<void>) | undefined
      const record = { id: 'fixture', status: 'failed', restore_status: 'failed', error_message: 'Backup-specific failure', restore_error: 'Restore-specific failure' }
      const scope = { ...baseScope(), disposed: false, stopPolling: vi.fn(), stopRestorePolling: vi.fn(),
        pollingTimer: ref<number | null>(null), restoringPollingTimer: ref<number | null>(null), MAX_POLL_COUNT: 900,
        creatingBackup: ref(true), restoringId: ref('fixture'), updateRecordInList: vi.fn(), loadBackups: vi.fn(),
        adminAPI: { backup: { getBackup: async () => record } },
        setInterval: (callback: () => Promise<void>) => { tick = callback; return 1 },
      }
      const run = handler('views/admin/BackupView.vue', name, scope) as (id: string) => unknown
      run('fixture')
      expect(tick).toBeTypeOf('function')
      await tick!()
      expect(scope.appStore.showError).toHaveBeenCalledWith(locale.startsWith('ru') ? t(fallback) : record[field])
      expect(scope.appStore.showSuccess).not.toHaveBeenCalled()
      expect(scope.loadBackups).toHaveBeenCalledOnce()
    })
  }
})

describe('real storage failure handlers preserve EN/ZH diagnostics', () => {
  for (const name of ['testImageStorage', 'testS3'] as const) {
    for (const mode of ['response', 'exception'] as const) {
      it.each(['ru', 'ru-RU', 'en', 'zh'])(`${name} ${mode} localizes only RU (%s)`, async locale => {
        language.current = locale
        const respond = () => mode === 'response'
          ? Promise.resolve({ ok: false, message: 'Missing S3 bucket field' })
          : Promise.reject(failure)
        const scope = { ...baseScope(),
          adminAPI: { backup: { testImageStorageConnection: respond, testS3Connection: respond } },
          testingImageStorage: ref(false), imageStorageForm: ref({}), testingS3: ref(false), s3Form: ref({}),
        }
        await handler('views/admin/BackupView.vue', name, scope)()
        const key = mode === 'response' ? 'admin.backup.s3.testFailed' : 'errors.networkError'
        const raw = mode === 'response' ? 'Missing S3 bucket field' : 'Envelope message'
        expect(scope.appStore.showError).toHaveBeenCalledWith(locale.startsWith('ru') ? t(key) : raw)
        expect(scope.appStore.showSuccess).not.toHaveBeenCalled()
        expect(scope.testingImageStorage.value).toBe(false)
        expect(scope.testingS3.value).toBe(false)
      })
    }
  }
})

describe('real usage, Grok and group error-selection contracts', () => {
  it.each(['ru', 'ru-RU', 'en', 'zh'])('keeps usage response body precedence and HTTP status (%s)', async locale => {
    language.current = locale
    for (const body of [
      { error: { message: 'Nested usage reason' }, message: 'Outer usage reason' },
      { message: 'Outer usage reason' },
      null,
      'invalid-json',
    ]) {
      const json = body === 'invalid-json' ? () => Promise.reject(new Error('Invalid JSON')) : async () => body
      const scope = { ...baseScope(), getDateParams: () => '', buildGatewayUrl: (path: string) => path,
        fetch: vi.fn().mockResolvedValue({ ok: false, status: 429, json }),
      }
      const fetchUsage = handler('views/KeyUsageView.vue', 'fetchUsage', scope) as (key: string) => Promise<unknown>
      const expected = locale.startsWith('ru') ? t('keyUsage.queryFailedRetry')
        : body && typeof body === 'object' ? ('error' in body ? 'Nested usage reason' : 'Outer usage reason')
          : `${t('keyUsage.queryFailed')} (429)`
      await expect(fetchUsage('fixture-key')).rejects.toThrow(expected)
    }
  })
  it.each(['ru', 'ru-RU', 'en', 'zh'])('keeps usage network and response diagnostics at actual UI catch (%s)', async locale => {
    language.current = locale
    const scope = { ...baseScope(), isQuerying: ref(false), apiKey: ref('fixture-key'),
      showResults: ref(false), showLoading: ref(false), resultData: ref(null), fetchUsage: reject,
    }
    await handler('views/KeyUsageView.vue', 'queryKey', scope)()
    expect(scope.appStore.showError).toHaveBeenCalledWith(locale.startsWith('ru') ? t('keyUsage.queryFailedRetry') : 'Envelope message')
    expect(scope.isQuerying.value).toBe(false)
    expect(scope.showLoading.value).toBe(false)
  })
  it.each(['ru', 'ru-RU', 'en', 'zh'])('keeps message-only Grok eligibility diagnostics (%s)', async locale => {
    language.current = locale
    const scope = { ...baseScope(), isGrokOAuthAccount: ref(true),
      adminAPI: { accounts: { getGrokMediaEligibility: reject } }, grokMediaEligibilityRequestVersion: 0,
      grokMediaEligibilityLoading: ref(false), grokMediaEligibilityError: ref(''),
    }
    const run = handler('components/account/EditAccountModal.vue', 'loadGrokMediaEligibility', scope) as (id: number) => Promise<unknown>
    await run(1)
    expect(scope.grokMediaEligibilityError.value).toBe(locale.startsWith('ru') ? t('admin.accounts.grokMediaEligibility.loadFailed') : 'Envelope message')
    expect(scope.grokMediaEligibilityLoading.value).toBe(false)
  })
  const compositeCases = [
    ['loadCompositeRoutes', 'failedToLoad'], ['saveCompositeRoute', 'failedToSave'],
    ['deleteCompositeRoute', 'failedToDelete'], ['previewCompositeRoute', 'failedToPreview'],
  ] as const
  for (const [name, key] of compositeCases) {
    it.each(['ru', 'ru-RU', 'en', 'zh'])(`${name} retains detail, then nested message, never envelope (%s)`, async locale => {
      language.current = locale
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        for (const error of [failure, { message: 'Envelope only', response: { data: { message: 'Nested message only' } } }, { message: 'Envelope only' }]) {
          const respond = () => Promise.reject(error)
          const scope = { ...baseScope(), compositeRoutesGroup: ref({ id: 1 }), compositeRoutesLoading: ref(false),
            compositeRouteForm: { public_model: 'fixture-model' }, compositeRouteSaving: ref(false),
            toCompositeRouteInput: () => ({}), compositeRouteEditingId: ref(null),
            compositePreviewModel: ref('fixture-model'), compositePreviewEndpoint: ref('any'),
            compositePreviewLoading: ref(false), compositePreviewDecision: ref(null),
            adminAPI: { groups: { listCompositeRoutes: respond, createCompositeRoute: respond, updateCompositeRoute: respond,
              deleteCompositeRoute: respond, previewCompositeRoute: respond } },
          }
          const run = handler('views/admin/GroupsView.vue', name, scope) as (route?: { id: number }) => Promise<unknown>
          await run({ id: 2 })
          const data = (error as { response?: { data?: { detail?: string; message?: string } } }).response?.data
          const raw = data?.detail || data?.message
          expect(scope.appStore.showError).toHaveBeenCalledWith(locale.startsWith('ru') || !raw ? t(`admin.groups.compositeRoutes.${key}`) : raw)
        }
      } finally { confirm.mockRestore(); consoleError.mockRestore() }
    })
  }
})

describe('real SMTP and storage success handlers', () => {
  const cases = [
    ['views/admin/SettingsView.vue', 'testSmtpConnection', 'admin.settings.smtpConnectionSuccess'],
    ['views/admin/SettingsView.vue', 'sendTestEmail', 'admin.settings.testEmailSent'],
    ['views/admin/BackupView.vue', 'testImageStorage', 'admin.backup.s3.testSuccess'],
    ['views/admin/BackupView.vue', 'testS3', 'admin.backup.s3.testSuccess'],
  ] as const
  for (const [path, name, key] of cases) {
    it.each(['ru', 'en', 'zh'])(`${name} keeps localized RU primary success (%s)`, async locale => {
      language.current = locale
      const respond = async () => ({ ok: true, message: 'Backend connection successful' })
      const scope = { ...baseScope(), adminAPI: { settings: { testSmtpConnection: respond, sendTestEmail: respond },
        backup: { testImageStorageConnection: respond, testS3Connection: respond } },
        testingSmtp: ref(false), smtpPasswordManuallyEdited: ref(false), form: {},
        testEmailAddress: ref('fixture@example.invalid'), sendingTestEmail: ref(false),
        testingImageStorage: ref(false), imageStorageForm: ref({}), testingS3: ref(false), s3Form: ref({}),
      }
      await handler(path, name, scope)()
      expect(scope.appStore.showSuccess).toHaveBeenCalledWith(locale === 'ru' ? t(key) : 'Backend connection successful')
      expect(scope.appStore.showError).not.toHaveBeenCalled()
    })
  }
})
