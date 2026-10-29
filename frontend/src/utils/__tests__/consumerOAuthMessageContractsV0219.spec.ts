import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ref } from 'vue'
import { parse } from 'vue/compiler-sfc'
import ts from 'typescript'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as apiErrors from '@/utils/apiError'
import { useAccountOAuth } from '@/composables/useAccountOAuth'
import { useAntigravityOAuth } from '@/composables/useAntigravityOAuth'
import { useGeminiOAuth } from '@/composables/useGeminiOAuth'

const fixture = vi.hoisted(() => ({
  current: 'ru',
  // Deliberately differ from the component/composable locale: callers must
  // pass locale.value, including regional RU, rather than depend on getLocale.
  globalLocale: 'en',
  showError: vi.fn(),
  api: {
    accounts: { generateAuthUrl: vi.fn(), exchangeCode: vi.fn() },
    antigravity: { generateAuthUrl: vi.fn(), exchangeCode: vi.fn(), refreshAntigravityToken: vi.fn() },
    gemini: { generateAuthUrl: vi.fn(), exchangeCode: vi.fn() },
  },
}))
vi.mock('@/i18n', () => ({ getLocale: () => fixture.globalLocale }))
vi.mock('vue-i18n', async (importOriginal) => ({ ...await importOriginal<typeof import('vue-i18n')>(), useI18n: () => ({
  t: (key: string) => `translated:${fixture.current}:${key}`,
  locale: { get value() { return fixture.current } },
}) }))
vi.mock('@/stores/app', () => ({ useAppStore: () => ({ showError: fixture.showError }) }))
vi.mock('@/api/admin', () => ({ adminAPI: fixture.api }))
beforeEach(() => {
  vi.resetAllMocks()
  fixture.current = 'ru'
  fixture.globalLocale = 'en'
})

const locales = ['en', 'zh', 'ru', 'ru-RU'] as const
const t = (key: string, params?: Record<string, unknown>) =>
  `translated:${fixture.current}:${key}${params ? `:${JSON.stringify(params)}` : ''}`
const primary = (raw: string | undefined, key: string, officialFallback?: string) =>
  fixture.current.toLowerCase().startsWith('ru') ? t(key) : raw || officialFallback || t(key)
const authFailed = 'admin.accounts.oauth.authFailed'
const createPath = 'components/account/CreateAccountModal.vue'
const reauthPath = 'components/account/ReAuthAccountModal.vue'

// Cache only transpiled real declarations. The catch expressions are never
// copied into the harness; APIs and adjacent reactive state are fixture seams.
const handlers = new Map<string, string>()
function handler(path: string, name: string, scope: Record<string, unknown>) {
  const key = `${path}:${name}`
  let code = handlers.get(key)
  if (!code) {
    const { descriptor } = parse(readFileSync(resolve(process.cwd(), 'src', path), 'utf8'))
    const file = ts.createSourceFile(path, descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const statement = file.statements.find(node =>
      (ts.isFunctionDeclaration(node) && node.name?.text === name) ||
      (ts.isVariableStatement(node) && node.declarationList.declarations.some(decl => ts.isIdentifier(decl.name) && decl.name.text === name)),
    )
    if (!statement) throw new Error(`Missing actual handler: ${key}`)
    code = ts.transpileModule(statement.getText(file), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText
    handlers.set(key, code)
  }
  const bindings = Object.entries(scope).filter(([binding]) => binding !== name)
  return new Function(...bindings.map(([binding]) => binding), `${code}\nreturn ${name}`)(...bindings.map(([, value]) => value)) as
    (...args: unknown[]) => Promise<unknown>
}

// Expectations are characterized against official dece26153621959ccd7635814f4b2d08304e681a.
// In particular, detail-only must NOT adopt response.message, error, or reason;
// detail -> envelope-message must NOT insert response.message between them.
const errors = [
  {
    name: 'all fields contradict',
    error: { message: 'Envelope message', error: 'Envelope error', reason: 'Envelope reason', response: {
      data: { detail: 'Response detail', message: 'Response message', error: 'Response error', reason: 'Response reason' },
    } },
    detail: 'Response detail', responseMessage: 'Response message', envelope: 'Envelope message', generic: 'Envelope message',
  },
  {
    name: 'detail absent',
    error: { message: 'Envelope message', error: 'Envelope error', reason: 'Envelope reason', response: {
      data: { message: 'Response message', error: 'Response error', reason: 'Response reason' },
    } },
    detail: undefined, responseMessage: 'Response message', envelope: 'Envelope message', generic: 'Envelope message',
  },
  {
    name: 'response message with competing error and reason only',
    error: { error: 'Envelope error', reason: 'Envelope reason', response: {
      data: { message: 'Response message', error: 'Response error', reason: 'Response reason' },
    } },
    detail: undefined, responseMessage: 'Response message', envelope: undefined, generic: 'Envelope error',
  },
  {
    name: 'detail does not expand Gemini exchange selector',
    error: { error: 'Envelope error', reason: 'Envelope reason', response: { data: { detail: 'Response detail' } } },
    detail: 'Response detail', responseMessage: undefined, envelope: undefined, generic: 'Envelope error',
  },
  {
    name: 'unselected fields cannot replace fallback',
    error: { error: 'Envelope error', reason: 'Envelope reason', response: {
      data: { error: 'Response error', reason: 'Response reason' },
    } },
    detail: undefined, responseMessage: undefined, envelope: undefined, generic: 'Envelope error',
  },
  {
    name: 'response absent', error: {},
    detail: undefined, responseMessage: undefined, envelope: undefined, generic: undefined,
  },
  {
    name: 'selected fields empty',
    error: { message: '', error: 'Envelope error', reason: 'Envelope reason', response: { data: { detail: '', message: '' } } },
    detail: undefined, responseMessage: undefined, envelope: undefined, generic: 'Envelope error',
  },
]

function client() {
  return {
    loading: ref(false), error: ref(''), sessionId: ref('fixture-session'),
    state: ref('fixture-state'), oauthState: ref('fixture-state'),
    exchangeAuthCode: vi.fn().mockResolvedValue({}),
    validateRefreshToken: vi.fn().mockResolvedValue({}),
    authorizePassword: vi.fn().mockResolvedValue({}),
    buildCredentials: vi.fn(() => ({})), buildExtraInfo: vi.fn(() => ({})),
    parseSessionKeys: vi.fn(() => ['fixture-cookie']),
  }
}
function createFixture(error: unknown, platform = 'openai') {
  const reject = () => vi.fn().mockRejectedValue(error)
  return {
    ...apiErrors, t, locale: ref(fixture.current),
    appStore: { showSuccess: vi.fn(), showWarning: vi.fn(), showError: vi.fn() },
    form: { platform, proxy_id: null, group_ids: [], name: 'Fixture', notes: '' },
    oauth: client(), openaiOAuth: client(), geminiOAuth: client(), antigravityOAuth: client(), grokOAuth: client(),
    adminAPI: {
      accounts: { create: reject(), exchangeCode: reject(), checkMixedChannelRisk: reject(),
        importCodexSession: reject(), createOpenAICodexPAT: reject(), update: reject(), clearError: vi.fn() },
      grok: { createFromSSO: reject() },
    },
    oauthFlowRef: ref({ authCode: 'fixture-code', oauthState: 'fixture-state', inputMethod: 'manual' }),
    autoPauseOnExpired: ref(false), addMethod: ref('oauth'), submitting: ref(false),
    antigravityMixedChannelConfirmed: ref(false), needsMixedChannelCheck: () => true,
    withAntigravityConfirmFlag: (value: unknown) => value, openMixedChannelDialog: vi.fn(),
    validateGrokOAuthUpstreamConfig: () => true, applyGrokOAuthUpstreamConfig: vi.fn(),
    modelRestrictionMode: ref('none'), allowedModels: ref([]), modelMappings: ref([]),
    antigravityModelMappings: ref([]), antigravityProjectId: ref(''),
    buildModelMappingObject: () => undefined, isOpenAIModelRestrictionDisabled: ref(true),
    buildOpenAICompactModelMapping: () => undefined, applyTempUnschedConfig: () => true,
    withUpstreamRequestIdHeader: (value: unknown) => value, buildOpenAIExtra: () => ({}),
    buildAntigravityExtra: () => ({}), applyAntigravityProjectID: vi.fn(), applyInterceptWarmup: vi.fn(),
    interceptWarmupRequests: ref(false), createAccountAndFinish: reject(),
    geminiOAuthType: ref('code_assist'), geminiSelectedTier: ref('free'),
    buildOpenAICodexImportCredentialExtras: () => ({}), buildOpenAICodexImportExtra: () => ({}),
    isAgentIdentityImportContent: () => true, upstreamModelsPreviewed: ref(false),
    tempUnschedEnabled: ref(false), tempUnschedRules: ref([]), buildTempUnschedRules: () => [],
    windowCostEnabled: ref(false), windowCostLimit: ref(null), windowCostStickyReserve: ref(null),
    sessionLimitEnabled: ref(false), maxSessions: ref(null), sessionIdleTimeout: ref(null),
    rpmLimitEnabled: ref(false), baseRpm: ref(null), rpmStrategy: ref(''), rpmStickyBuffer: ref(null),
    userMsgQueueMode: ref(''), tlsFingerprintEnabled: ref(false), tlsFingerprintProfileId: ref(''),
    sessionIdMaskingEnabled: ref(false), cacheTTLOverrideEnabled: ref(false), cacheTTLOverrideTarget: ref(''),
    customBaseUrlEnabled: ref(false), customBaseUrl: ref(''), emit: vi.fn(), handleClose: vi.fn(),
  }
}

describe('real create-account message-first consumers (REG-001/002/003)', () => {
  for (const name of ['ensureAntigravityMixedChannelConfirmed', 'submitCreateAccount']) {
    it.each(locales)(`${name} keeps response.message -> response.detail (%s)`, async locale => {
      fixture.current = locale
      for (const row of errors) {
        const scope = createFixture(row.error, 'antigravity')
        const boundary = name === 'submitCreateAccount' ? scope.adminAPI.accounts.create : scope.adminAPI.accounts.checkMixedChannelRisk
        await handler(createPath, name, scope)({ platform: 'antigravity', credentials: {} })
        expect(boundary, row.name).toHaveBeenCalledOnce()
        expect(scope.appStore.showError, row.name).toHaveBeenCalledWith(
          primary(row.responseMessage || row.detail, 'admin.accounts.failedToCreate'),
        )
        expect(scope.submitting.value).toBe(false)
      }
    })
  }
  it.each(locales)('409 mixed-channel warning ignores all fields except response.message (%s)', async locale => {
    fixture.current = locale
    for (const message of ['Response message', undefined]) {
      const error = { message: 'Envelope message', error: 'Envelope error', reason: 'Envelope reason', response: {
        status: 409, data: { message, detail: 'Do not select detail', error: 'mixed_channel_warning', reason: 'Response reason' },
      } }
      const base = createFixture(error, 'antigravity')
      const state = { ...base, buildMixedChannelDetails: () => null,
        mixedChannelWarningDetails: ref(null), mixedChannelWarningRawMessage: ref(''),
        mixedChannelWarningAction: ref(null), showMixedChannelWarning: ref(false) }
      const scope = { ...state, openMixedChannelDialog: handler(createPath, 'openMixedChannelDialog', state) }
      await handler(createPath, 'submitCreateAccount', scope)({ platform: 'antigravity', credentials: {} })
      expect(scope.adminAPI.accounts.create).toHaveBeenCalledOnce()
      expect(scope.showMixedChannelWarning.value).toBe(true)
      expect(scope.mixedChannelWarningRawMessage.value).toBe(primary(message, 'admin.accounts.mixedChannelWarningGeneric'))
      expect(scope.appStore.showError).not.toHaveBeenCalled()
      expect(scope.submitting.value).toBe(false)
    }
  })
  it.each(locales)('dialog keeps explicit message before response.message (%s)', async locale => {
    fixture.current = locale
    const scope = { ...createFixture({}), buildMixedChannelDetails: () => null,
      mixedChannelWarningDetails: ref(null), mixedChannelWarningRawMessage: ref(''),
      mixedChannelWarningAction: ref(null), showMixedChannelWarning: ref(false) }
    await handler(createPath, 'openMixedChannelDialog', scope)({
      message: 'Explicit message', response: { message: 'Response message' }, onConfirm: vi.fn(),
    })
    expect(scope.mixedChannelWarningRawMessage.value).toBe(primary('Explicit message', 'admin.accounts.mixedChannelWarningGeneric'))
  })
})

describe('real create-account detail-first handlers (REG-004..017)', () => {
  const batchCases = [
    ['handleGrokValidateRT', 'grokOAuth', 'grok', 'fixture-refresh-token'],
    ['handleGrokAuthorizePassword', 'grokOAuth', 'grok', 'fixture@example.invalid----fixture-password'],
    ['handleOpenAIBatchRT', 'openaiOAuth', 'openai', 'fixture-refresh-token'],
    ['handleAntigravityValidateRT', 'antigravityOAuth', 'antigravity', 'fixture-refresh-token'],
  ] as const
  for (const [name, output, platform, input] of batchCases) {
    it.each(locales)(`${name} keeps detail -> envelope message, never response.message (%s)`, async locale => {
      fixture.current = locale
      for (const row of errors) {
        const scope = createFixture(row.error, platform)
        await handler(createPath, name, scope)(input)
        expect(scope.adminAPI.accounts.create, row.name).toHaveBeenCalledOnce()
        expect(scope[output].error.value, row.name).toBe(`#1: ${primary(row.detail || row.envelope, authFailed, 'Unknown error')}`)
        expect(scope[output].loading.value).toBe(false)
      }
    })
    it.each(locales)(`${name} preserves the returned-client-error branch (%s)`, async locale => {
      fixture.current = locale
      for (const raw of ['Returned client diagnostic', '']) {
        const scope = createFixture({ unreachable: true }, platform)
        const oauth = scope[output]
        const api = name === 'handleGrokAuthorizePassword' ? oauth.authorizePassword : oauth.validateRefreshToken
        api.mockImplementation(async () => {
          oauth.error.value = raw
          return null
        })
        await handler(createPath, name, scope)(input)
        expect(api).toHaveBeenCalledOnce()
        expect(scope.adminAPI.accounts.create).not.toHaveBeenCalled()
        expect(oauth.error.value).toBe(`#1: ${primary(raw, authFailed, name === 'handleGrokAuthorizePassword' ? 'Authorization failed' : undefined)}`)
        expect(oauth.loading.value).toBe(false)
      }
    })
  }
  it.each(locales)('handleGrokImportSSO catch keeps detail -> envelope message (%s)', async locale => {
    fixture.current = locale
    for (const row of errors) {
      const scope = createFixture(row.error, 'grok')
      await handler(createPath, 'handleGrokImportSSO', scope)('fixture-sso')
      expect(scope.adminAPI.grok.createFromSSO, row.name).toHaveBeenCalledOnce()
      expect(scope.grokOAuth.error.value, row.name).toBe(primary(row.detail || row.envelope, 'admin.accounts.oauth.grok.failedToConvertSSO'))
      expect(scope.appStore.showError).toHaveBeenCalledWith(scope.grokOAuth.error.value)
      expect(scope.grokOAuth.loading.value).toBe(false)
    }
  })
  for (const partial of [false, true]) {
    it.each(locales)(`handleGrokImportSSO preserves per-item diagnostics, partial=${partial} (%s)`, async locale => {
      fixture.current = locale
      for (const raw of ['SSO item diagnostic', '', undefined]) {
        const scope = createFixture({ unreachable: true }, 'grok')
        const result = { created: partial ? [{}] : [], failed: [{ index: 1, error: raw }] }
        const before = structuredClone(result)
        scope.adminAPI.grok.createFromSSO.mockResolvedValue(result)
        await handler(createPath, 'handleGrokImportSSO', scope)('fixture-sso')
        expect(scope.adminAPI.grok.createFromSSO).toHaveBeenCalledOnce()
        expect(scope.grokOAuth.error.value).toBe(`#1: ${primary(raw, 'admin.accounts.oauth.grok.failedToConvertSSO', 'Unknown error')}`)
        expect(scope.grokOAuth.loading.value).toBe(false)
        expect(result).toEqual(before)
      }
    })
  }
  const exchangeCases = [
    ['handleOpenAIExchange', 'openaiOAuth', 'openai'],
    ['handleGeminiExchange', 'geminiOAuth', 'gemini'],
    ['handleAntigravityExchange', 'antigravityOAuth', 'antigravity'],
    ['handleGrokExchange', 'grokOAuth', 'grok'],
    ['handleAnthropicExchange', 'oauth', 'anthropic'],
  ] as const
  for (const [name, output, platform] of exchangeCases) {
    it.each(locales)(`${name} retains detail-only catch (%s)`, async locale => {
      fixture.current = locale
      for (const row of errors) {
        const scope = createFixture(row.error, platform)
        await handler(createPath, name, scope)('fixture-code')
        const boundary = platform === 'openai' ? scope.adminAPI.accounts.create
          : platform === 'anthropic' ? scope.adminAPI.accounts.exchangeCode : scope.createAccountAndFinish
        expect(boundary, row.name).toHaveBeenCalledOnce()
        expect(scope[output].error.value, row.name).toBe(primary(row.detail, authFailed))
        expect(scope.appStore.showError).toHaveBeenCalledWith(scope[output].error.value)
        expect(scope[output].loading.value).toBe(false)
      }
    })
  }
  for (const [name, api, fallback] of [
    ['handleOpenAIImportCodexSession', 'importCodexSession', 'admin.accounts.oauth.openai.codexSessionImportFailed'],
    ['handleOpenAIImportCodexPAT', 'createOpenAICodexPAT', 'admin.accounts.oauth.openai.codexPatImportFailed'],
  ] as const) {
    it.each(locales)(`${name} keeps detail -> response.message -> envelope message (%s)`, async locale => {
      fixture.current = locale
      for (const row of errors) {
        const scope = createFixture(row.error)
        await handler(createPath, name, scope)('fixture-content')
        expect(scope.adminAPI.accounts[api], row.name).toHaveBeenCalledOnce()
        expect(scope.openaiOAuth.error.value, row.name).toBe(primary(row.detail || row.responseMessage || row.envelope, fallback))
        expect(scope.appStore.showError).toHaveBeenCalledWith(scope.openaiOAuth.error.value)
        expect(scope.openaiOAuth.loading.value).toBe(false)
      }
    })
  }
  it.each(locales)('Codex result errors and warnings use the real formatter (%s)', async locale => {
    fixture.current = locale
    const base = createFixture({ unreachable: true })
    base.adminAPI.accounts.importCodexSession.mockResolvedValue({
      created: 0, updated: 0, skipped: 0, failed: 1,
      errors: [{ index: 1, name: 'fixture', message: 'Codex item diagnostic' }],
      warnings: [{ index: 2, message: 'Codex warning diagnostic' }],
    })
    const scope = { ...base, formatCodexImportMessages: handler(createPath, 'formatCodexImportMessages', base) }
    await handler(createPath, 'handleOpenAIImportCodexSession', scope)('fixture-content')
    expect(scope.adminAPI.accounts.importCodexSession).toHaveBeenCalledOnce()
    expect(scope.openaiOAuth.error.value).toBe([
      `#1 fixture: ${primary('Codex item diagnostic', 'admin.accounts.oauth.openai.codexSessionImportFailed')}`,
      `#2: ${primary('Codex warning diagnostic', 'common.warning')}`,
    ].join('\n'))
    expect(scope.openaiOAuth.loading.value).toBe(false)
  })
  it.each(locales)('Codex formatter preserves exact empty/null/undefined EN/ZH messages (%s)', locale => {
    fixture.current = locale
    const format = handler(createPath, 'formatCodexImportMessages', createFixture({}))
    for (const message of ['Raw item message', '', null, undefined]) {
      for (const fallback of ['admin.accounts.oauth.openai.codexSessionImportFailed', 'common.warning']) {
        const items = [{ index: 31, name: 'Custom name', message }, { index: 32, name: '', message }]
        const before = structuredClone(items)
        const displayed = fixture.current.toLowerCase().startsWith('ru') ? t(fallback) : message
        expect(format(items, fallback)).toBe(`#31 Custom name: ${displayed}\n#32: ${displayed}`)
        expect(items).toEqual(before)
      }
    }
  })
  it.each(locales)('cookie per-item catch remains detail-only (%s)', async locale => {
    fixture.current = locale
    for (const row of errors) {
      const scope = createFixture(row.error, 'anthropic')
      await handler(createPath, 'handleCookieAuth', scope)('fixture-cookie')
      expect(scope.adminAPI.accounts.exchangeCode, row.name).toHaveBeenCalledOnce()
      expect(scope.oauth.error.value, row.name).toBe(t('admin.accounts.oauth.keyAuthFailed', {
        index: 1, error: primary(row.detail, authFailed),
      }))
      expect(scope.oauth.loading.value).toBe(false)
    }
  })
  it.each(locales)('cookie outer catch remains detail-only (%s)', async locale => {
    fixture.current = locale
    for (const row of errors) {
      const scope = createFixture(row.error, 'anthropic')
      scope.oauth.parseSessionKeys.mockImplementation(() => { throw row.error })
      await handler(createPath, 'handleCookieAuth', scope)('fixture-cookie')
      expect(scope.oauth.parseSessionKeys, row.name).toHaveBeenCalledOnce()
      expect(scope.adminAPI.accounts.exchangeCode).not.toHaveBeenCalled()
      expect(scope.oauth.error.value, row.name).toBe(primary(row.detail, 'admin.accounts.oauth.cookieAuthFailed'))
      expect(scope.oauth.loading.value).toBe(false)
    }
  })
})

describe('real reauthorization branches keep detail-only contracts (REG-018..022)', () => {
  for (const platform of ['openai', 'gemini', 'antigravity', 'anthropic'] as const) {
    it.each(locales)(`${platform} update catch ignores envelope and response.message (%s)`, async locale => {
      fixture.current = locale
      for (const row of errors) {
        const base = createFixture(row.error, platform)
        // Claude exchanges through accounts.exchangeCode before the update.
        base.adminAPI.accounts.exchangeCode.mockResolvedValue({})
        const scope = { ...base, claudeOAuth: base.oauth, props: { account: { id: 1, credentials: {}, proxy_id: null } },
          isOpenAILike: ref(platform === 'openai'), isGemini: ref(platform === 'gemini'), isAntigravity: ref(platform === 'antigravity') }
        const output = platform === 'openai' ? scope.openaiOAuth : platform === 'gemini' ? scope.geminiOAuth
          : platform === 'antigravity' ? scope.antigravityOAuth : scope.claudeOAuth
        await handler(reauthPath, 'handleExchangeCode', scope)()
        expect(scope.adminAPI.accounts.update, row.name).toHaveBeenCalledOnce()
        expect(output.error.value, row.name).toBe(primary(row.detail, authFailed))
        expect(scope.appStore.showError).toHaveBeenCalledWith(output.error.value)
        expect(scope.adminAPI.accounts.clearError).not.toHaveBeenCalled()
        expect(scope.emit).not.toHaveBeenCalled()
      }
    })
  }
  it.each(locales)('cookie exchange catch ignores all unselected fields (%s)', async locale => {
    fixture.current = locale
    for (const row of errors) {
      const base = createFixture(row.error, 'anthropic')
      const scope = { ...base, claudeOAuth: base.oauth, props: { account: { id: 1, proxy_id: null } }, isOpenAILike: ref(false) }
      await handler(reauthPath, 'handleCookieAuth', scope)('fixture-cookie')
      expect(scope.adminAPI.accounts.exchangeCode, row.name).toHaveBeenCalledOnce()
      expect(scope.claudeOAuth.error.value, row.name).toBe(primary(row.detail, 'admin.accounts.oauth.cookieAuthFailed'))
      expect(scope.claudeOAuth.loading.value).toBe(false)
    }
  })
})

describe('actual OAuth composables, not copied catches (REG-023..028/072)', () => {
  for (const operation of ['generateAuthUrl', 'exchangeAuthCode', 'cookieAuth'] as const) {
    it.each(locales)(`useAccountOAuth.${operation} keeps detail-only (%s)`, async locale => {
      fixture.current = locale
      const fallback = operation === 'generateAuthUrl' ? 'admin.accounts.oauth.failedToGenerateUrl'
        : operation === 'exchangeAuthCode' ? 'admin.accounts.oauth.failedToExchangeCode' : 'admin.accounts.oauth.cookieAuthFailed'
      for (const row of errors) {
        const api = operation === 'generateAuthUrl' ? fixture.api.accounts.generateAuthUrl : fixture.api.accounts.exchangeCode
        api.mockReset().mockRejectedValue(row.error)
        fixture.showError.mockClear()
        const oauth = useAccountOAuth()
        oauth.authCode.value = 'fixture-code'
        oauth.sessionId.value = 'fixture-session'
        const result = operation === 'cookieAuth' ? await oauth.cookieAuth('oauth', 'fixture-cookie') : await oauth[operation]('oauth')
        expect(api, row.name).toHaveBeenCalledOnce()
        expect(result).toBe(operation === 'generateAuthUrl' ? false : null)
        const officialFallback = operation === 'generateAuthUrl' ? 'Failed to generate auth URL'
          : operation === 'exchangeAuthCode' ? 'Failed to exchange auth code' : 'Cookie authorization failed'
        expect(oauth.error.value, row.name).toBe(primary(row.detail, fallback, officialFallback))
        expect(oauth.loading.value).toBe(false)
        if (operation === 'cookieAuth') expect(fixture.showError).not.toHaveBeenCalled()
        else expect(fixture.showError).toHaveBeenCalledWith(oauth.error.value)
      }
    })
  }
  for (const operation of ['generateAuthUrl', 'exchangeAuthCode', 'validateRefreshToken'] as const) {
    it.each(locales)(`useAntigravityOAuth.${operation} keeps detail-only (%s)`, async locale => {
      fixture.current = locale
      const fallback = `admin.accounts.oauth.antigravity.${operation === 'generateAuthUrl' ? 'failedToGenerateUrl'
        : operation === 'exchangeAuthCode' ? 'failedToExchangeCode' : 'failedToValidateRT'}`
      for (const row of errors) {
        const api = operation === 'generateAuthUrl' ? fixture.api.antigravity.generateAuthUrl
          : operation === 'exchangeAuthCode' ? fixture.api.antigravity.exchangeCode : fixture.api.antigravity.refreshAntigravityToken
        api.mockReset().mockRejectedValue(row.error)
        fixture.showError.mockClear()
        const oauth = useAntigravityOAuth()
        const result = operation === 'generateAuthUrl' ? await oauth.generateAuthUrl(null)
          : operation === 'exchangeAuthCode' ? await oauth.exchangeAuthCode({ code: 'fixture-code', sessionId: 'fixture-session', state: 'fixture-state' })
            : await oauth.validateRefreshToken('fixture-refresh-token')
        expect(api, row.name).toHaveBeenCalledOnce()
        expect(result).toBe(operation === 'generateAuthUrl' ? false : null)
        expect(oauth.error.value, row.name).toBe(primary(row.detail, fallback))
        expect(oauth.loading.value).toBe(false)
        if (operation === 'validateRefreshToken') expect(fixture.showError).not.toHaveBeenCalled()
        else expect(fixture.showError).toHaveBeenCalledWith(oauth.error.value)
      }
    })
  }
  it.each(locales)('Gemini exchange keeps envelope message -> response.message, excludes detail/error/reason (%s)', async locale => {
    fixture.current = locale
    for (const row of errors) {
      fixture.api.gemini.exchangeCode.mockReset().mockRejectedValue(row.error)
      const oauth = useGeminiOAuth()
      expect(await oauth.exchangeAuthCode({ code: 'fixture-code', sessionId: 'fixture-session', state: 'fixture-state' })).toBeNull()
      expect(fixture.api.gemini.exchangeCode, row.name).toHaveBeenCalledOnce()
      expect(oauth.error.value, row.name).toBe(primary(row.envelope || row.responseMessage, 'admin.accounts.oauth.gemini.failedToExchangeCode'))
      expect(fixture.showError).toHaveBeenLastCalledWith(oauth.error.value)
      expect(oauth.loading.value).toBe(false)
    }
  })
  it.each(locales)('Gemini known missing project_id mapping uses only the original selected message (%s)', async locale => {
    fixture.current = locale
    for (const [error, known] of [
      [{ message: 'missing project_id', response: { data: { message: 'Other message', detail: 'Other detail' } } }, true],
      [{ response: { data: { message: 'missing project_id' } } }, true],
      [{ message: 'Envelope wins', response: { data: { message: 'missing project_id' } } }, false],
      [{ response: { data: { detail: 'missing project_id' } } }, false],
      [{ error: 'missing project_id', reason: 'missing_project_id' }, false],
    ] as const) {
      fixture.api.gemini.exchangeCode.mockRejectedValue(error)
      const oauth = useGeminiOAuth()
      await oauth.exchangeAuthCode({ code: 'fixture-code', sessionId: 'fixture-session', state: 'fixture-state' })
      expect(oauth.error.value).toBe(known ? t('admin.accounts.oauth.gemini.missingProjectId')
        : primary('message' in error ? error.message : undefined, 'admin.accounts.oauth.gemini.failedToExchangeCode'))
    }
  })
  it.each(locales)('Gemini URL generation retains its official generic extractor instead of becoming detail-only (%s)', async locale => {
    fixture.current = locale
    for (const row of errors) {
      fixture.api.gemini.generateAuthUrl.mockReset().mockRejectedValue(row.error)
      const oauth = useGeminiOAuth()
      expect(await oauth.generateAuthUrl(null)).toBe(false)
      expect(fixture.api.gemini.generateAuthUrl, row.name).toHaveBeenCalledOnce()
      expect(oauth.error.value, row.name).toBe(primary(row.generic, 'admin.accounts.oauth.gemini.failedToGenerateUrl'))
      expect(oauth.loading.value).toBe(false)
    }
  })
})
