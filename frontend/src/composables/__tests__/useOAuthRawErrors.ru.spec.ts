import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ showError: vi.fn() }))

vi.mock('@/i18n', () => ({ getLocale: () => 'ru' }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'ru' },
    t: (key: string) => ({
      'admin.accounts.oauth.antigravity.failedToGenerateUrl': 'Не удалось создать ссылку авторизации Antigravity',
      'admin.accounts.oauth.antigravity.failedToValidateRT': 'Не удалось проверить токен обновления Antigravity',
      'admin.accounts.oauth.gemini.failedToGenerateUrl': 'Не удалось создать ссылку авторизации Gemini',
      'admin.accounts.oauth.gemini.failedToExchangeCode': 'Не удалось обменять код авторизации Gemini',
      'admin.accounts.oauth.gemini.missingProjectId': 'Не указан идентификатор проекта'
    })[key as 'admin.accounts.oauth.antigravity.failedToGenerateUrl'] ?? key
  })
}))
vi.mock('@/stores/app', () => ({ useAppStore: () => ({ showError: state.showError }) }))
vi.mock('@/api/admin', () => ({
  adminAPI: {
    antigravity: {
      generateAuthUrl: vi.fn(), exchangeCode: vi.fn(), refreshAntigravityToken: vi.fn()
    },
    gemini: { generateAuthUrl: vi.fn(), exchangeCode: vi.fn(), getCapabilities: vi.fn() }
  }
}))

import { adminAPI } from '@/api/admin'
import { useAntigravityOAuth } from '../useAntigravityOAuth'
import { useGeminiOAuth } from '../useGeminiOAuth'

beforeEach(() => vi.clearAllMocks())

describe('Russian primary errors in adjacent OAuth composables', () => {
  it('does not surface raw Antigravity URL failures', async () => {
    vi.mocked(adminAPI.antigravity.generateAuthUrl).mockRejectedValueOnce({ response: { data: { detail: 'Raw upstream URL failure' } } })
    const oauth = useAntigravityOAuth()
    await oauth.generateAuthUrl()
    expect(oauth.error.value).toBe('Не удалось создать ссылку авторизации Antigravity')
    expect(state.showError).toHaveBeenCalledWith(oauth.error.value)
  })

  it('does not surface raw Antigravity refresh-token failures', async () => {
    vi.mocked(adminAPI.antigravity.refreshAntigravityToken).mockRejectedValueOnce({ response: { data: { detail: 'Raw upstream token failure' } } })
    const oauth = useAntigravityOAuth()
    await oauth.validateRefreshToken('token')
    expect(oauth.error.value).toBe('Не удалось проверить токен обновления Antigravity')
  })

  it('does not surface raw Gemini URL failures', async () => {
    vi.mocked(adminAPI.gemini.generateAuthUrl).mockRejectedValueOnce({ response: { data: { detail: 'Raw Gemini URL failure' } } })
    const oauth = useGeminiOAuth()
    await oauth.generateAuthUrl()
    expect(oauth.error.value).toBe('Не удалось создать ссылку авторизации Gemini')
  })

  it('keeps a missing-project diagnostic but localizes unknown Gemini exchange failures', async () => {
    vi.mocked(adminAPI.gemini.exchangeCode).mockRejectedValueOnce({ message: 'Raw Gemini exchange failure' })
    const oauth = useGeminiOAuth()
    await oauth.exchangeAuthCode({ code: 'code', sessionId: 'session', state: 'state' })
    expect(oauth.error.value).toBe('Не удалось обменять код авторизации Gemini')
    vi.mocked(adminAPI.gemini.exchangeCode).mockRejectedValueOnce({ message: 'missing project_id' })
    await oauth.exchangeAuthCode({ code: 'code', sessionId: 'session', state: 'state' })
    expect(oauth.error.value).toBe('Не указан идентификатор проекта')
  })
})
