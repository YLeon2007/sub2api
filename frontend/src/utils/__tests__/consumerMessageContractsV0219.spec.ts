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
