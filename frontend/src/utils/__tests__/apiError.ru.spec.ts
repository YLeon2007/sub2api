import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractApiErrorCode, extractApiErrorMessage, extractI18nErrorMessage } from '@/utils/apiError'
import { buildAuthErrorMessage } from '@/utils/authError'

const locale = vi.hoisted(() => ({ current: 'ru' }))
vi.mock('@/i18n', () => ({ getLocale: () => locale.current }))

const fallback = 'Не удалось выполнить операцию'
const t = (key: string, metadata?: Record<string, unknown>) => {
  if (key === 'payment.errors.PAYMENT_DECLINED') return `Платёж отклонён: ${metadata?.amount}`
  return key
}

beforeEach(() => { locale.current = 'ru' })

describe('Russian primary API errors', () => {
  it.each([
    { message: 'Backend failed', error: 'Other backend error' },
    { error: 'Backend failed' },
    { response: { data: { detail: 'Backend failed', message: 'More English' } } },
    new Error('Backend failed'),
    'Backend failed',
  ])('uses the translated fallback instead of an unknown English error (%#)', (error) => {
    expect(extractApiErrorMessage(error, fallback)).toBe(fallback)
    expect(extractI18nErrorMessage(error, t, 'payment.errors', fallback)).toBe(fallback)
  })

  it('keeps known translated codes and metadata, without changing machine values', () => {
    const error = { reason: 'PAYMENT_DECLINED', message: 'Card declined', metadata: { amount: '42 USD' } }
    expect(extractApiErrorCode(error)).toBe('PAYMENT_DECLINED')
    expect(extractI18nErrorMessage(error, t, 'payment.errors', fallback)).toBe('Платёж отклонён: 42 USD')
    expect(extractApiErrorMessage(error, fallback, { PAYMENT_DECLINED: 'Локализованный отказ' })).toBe('Локализованный отказ')
    expect(error.message).toBe('Card declined')
  })

  it('rejects unknown codes and inherited map properties as translations', () => {
    expect(extractI18nErrorMessage({ reason: 'NEW_CODE', message: 'English failure' }, t, 'payment.errors', fallback)).toBe(fallback)
    expect(extractApiErrorMessage({ code: 'toString', message: 'English failure' }, fallback, {})).toBe(fallback)
  })

  it('does not precompute a raw fallback in the payment order catch path', () => {
    const payment = readFileSync(resolve(process.cwd(), 'src/views/user/PaymentView.vue'), 'utf8')
    expect(payment).toMatch(/errorMessage\.value\s*=\s*extractI18nErrorMessage\(err,\s*t,\s*'payment\.errors',\s*t\('payment\.result\.failed'\)\)/)
    expect(payment).not.toMatch(/extractI18nErrorMessage\(err,\s*t,\s*'payment\.errors',\s*extractApiErrorMessage\(/)
  })

  it('gates login 2FA backend error prose by the active locale', () => {
    const login = readFileSync(resolve(process.cwd(), 'src/views/auth/LoginView.vue'), 'utf8')
    expect(login).toMatch(/const message = getLocale\(\) === 'ru'\s*\? t\('profile\.totp\.loginFailed'\)/)
  })

  it('routes redemption and password recovery failures through the locale-aware extractor', () => {
    const redeem = readFileSync(resolve(process.cwd(), 'src/views/user/RedeemView.vue'), 'utf8')
    const forgot = readFileSync(resolve(process.cwd(), 'src/views/auth/ForgotPasswordView.vue'), 'utf8')
    const reset = readFileSync(resolve(process.cwd(), 'src/views/auth/ResetPasswordView.vue'), 'utf8')
    expect(redeem).toContain("extractApiErrorMessage(error, t('redeem.failedToRedeem'))")
    expect(forgot).toContain("extractApiErrorMessage(error, t('auth.sendResetLinkFailed'))")
    expect(reset).toContain("extractApiErrorMessage(error, t('auth.resetPasswordFailed'))")
    expect(reset).toContain("err.response?.data?.code === 'INVALID_RESET_TOKEN'")
    for (const view of [redeem, forgot, reset]) {
      expect(view).not.toMatch(/errorMessage\.value\s*=\s*(?:err|error)\.response(?:\?\.)?\.data(?:\?\.)?\.detail/)
    }
  })

  it('uses the translated auth fallback in registration and email verification', () => {
    expect(buildAuthErrorMessage({ response: { data: { detail: 'Invalid account' } } }, { fallback })).toBe(fallback)
  })
})

describe.each(['en', 'zh'])('%s compatibility', (language) => {
  beforeEach(() => { locale.current = language })

  it('keeps raw backend details where previously shown, including unknown i18n reasons', () => {
    const error = { reason: 'NEW_CODE', message: 'Backend failed', response: { data: { detail: 'More detail' } } }
    expect(extractApiErrorMessage(error, fallback)).toBe('Backend failed')
    expect(extractI18nErrorMessage(error, t, 'payment.errors', fallback)).toBe('Backend failed')
    expect(extractI18nErrorMessage(error, t, 'payment.errors', fallback, true)).toBe(fallback)
    expect(buildAuthErrorMessage(error, { fallback })).toBe('More detail')
  })

  it('still translates known error codes', () => {
    expect(extractI18nErrorMessage({ reason: 'PAYMENT_DECLINED', message: 'Backend failed', metadata: { amount: 42 } }, t, 'payment.errors', fallback)).toBe('Платёж отклонён: 42')
  })
})
