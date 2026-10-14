import { beforeEach, describe, expect, it, vi } from 'vitest'
import { localizeApiErrorFallback, extractI18nErrorMessage, extractApiErrorCode, extractApiErrorMetadata } from '@/utils/apiError'
const locale = vi.hoisted(() => ({ current: 'ru' }))
vi.mock('@/i18n', () => ({ getLocale: () => locale.current }))
beforeEach(() => { locale.current = 'ru' })
const fallback = 'Не удалось выполнить операцию'
describe('locale-aware raw error fallback', () => {
  it.each(['Backend failed', '后端错误', 'Сырой текст', '', undefined, null])('uses only translated primary copy in RU (%s)', raw => {
    expect(localizeApiErrorFallback(raw, fallback)).toBe(fallback)
  })
  it.each(['en', 'zh'])('preserves caller-selected raw branch priority in %s', language => {
    locale.current = language
    const err = { message: 'First', response: { data: { detail: 'Second' } } }
    expect(localizeApiErrorFallback(err.response.data.detail || err.message, fallback)).toBe('Second')
    expect(localizeApiErrorFallback(err.message || err.response.data.detail, fallback)).toBe('First')
    expect(localizeApiErrorFallback('', fallback)).toBe(fallback)
  })
  it('accepts an explicit component locale including regional RU', () => {
    locale.current = 'en'
    expect(localizeApiErrorFallback('Raw', fallback, 'ru-RU')).toBe(fallback)
    expect(localizeApiErrorFallback('Raw', fallback, 'zh')).toBe('Raw')
  })
  it.each(['ru', 'en', 'zh'])('keeps known reason codes, localized metadata and raw diagnostic data intact in %s', language => {
    locale.current = language
    const err = { reason: 'KNOWN', code: 400, message: 'Raw detail', metadata: { key: 'certSerial', amount: 42 } }
    const before = structuredClone(err)
    const t = (key: string, params?: Record<string, unknown>) => key === 'payment.errors.KNOWN'
      ? `Известная ошибка: ${params?.key} ${params?.amount}`
      : key === 'admin.settings.payment.field_certSerial' ? 'Серийный номер' : key
    expect(extractI18nErrorMessage(err, t, 'payment.errors', fallback)).toBe('Известная ошибка: Серийный номер 42')
    expect(extractApiErrorCode(err)).toBe('KNOWN')
    expect(extractApiErrorMetadata(err)).toEqual(before.metadata)
    expect(err).toEqual(before)
    expect(extractI18nErrorMessage({ reason: 'NEW', message: 'Raw' }, t, 'payment.errors', fallback)).toBe(language === 'ru' ? fallback : 'Raw')
  })
})
