import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ locale: 'ru', localLocale: 'ru', showError: vi.fn() }))

vi.mock('@/i18n', () => ({ getLocale: () => state.locale }))
vi.mock('@/stores/app', () => ({ useAppStore: () => ({ showError: state.showError }) }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: state.localLocale },
    t: (key: string) => ({
      'admin.accounts.oauth.failedToGenerateUrl': 'Не удалось создать ссылку авторизации',
      'admin.accounts.oauth.failedToExchangeCode': 'Не удалось обменять код авторизации',
      'admin.accounts.oauth.missingAuthCodeOrSession': 'Отсутствует код авторизации или ID сеанса',
      'admin.accounts.oauth.pleaseEnterSessionKey': 'Введите хотя бы один корректный sessionKey',
      'admin.accounts.oauth.cookieAuthFailed': 'Cookie-авторизация не удалась'
    })[key] ?? key
  })
}))
vi.mock('@/api/admin', () => ({
  adminAPI: { accounts: { generateAuthUrl: vi.fn(), exchangeCode: vi.fn() } }
}))

import { adminAPI } from '@/api/admin'
import { useAccountOAuth } from '../useAccountOAuth'

beforeEach(() => {
  vi.clearAllMocks()
  state.locale = 'ru'
  state.localLocale = 'ru'
})

describe('useAccountOAuth Russian error paths', () => {
  it('uses localized primary text for an unknown backend URL error', async () => {
    vi.mocked(adminAPI.accounts.generateAuthUrl).mockRejectedValueOnce({
      response: { data: { detail: 'Failed to generate auth URL' } }
    })
    const oauth = useAccountOAuth()
    expect(await oauth.generateAuthUrl('oauth')).toBe(false)
    expect(oauth.error.value).toBe('Не удалось создать ссылку авторизации')
    expect(state.showError).toHaveBeenCalledWith(oauth.error.value)
  })

  it('localizes a missing code/session before sending a request', async () => {
    const oauth = useAccountOAuth()
    expect(await oauth.exchangeAuthCode('oauth')).toBeNull()
    expect(oauth.error.value).toBe('Отсутствует код авторизации или ID сеанса')
    expect(adminAPI.accounts.exchangeCode).not.toHaveBeenCalled()
  })

  it('does not show backend prose as the primary exchange or cookie error', async () => {
    vi.mocked(adminAPI.accounts.exchangeCode)
      .mockRejectedValueOnce({ message: 'Failed to exchange auth code' })
      .mockRejectedValueOnce({ response: { data: { detail: 'Cookie authorization failed' } } })
    const oauth = useAccountOAuth()
    oauth.authCode.value = 'code'
    oauth.sessionId.value = 'session'
    expect(await oauth.exchangeAuthCode('oauth')).toBeNull()
    expect(oauth.error.value).toBe('Не удалось обменять код авторизации')
    expect(await oauth.cookieAuth('oauth', 'key')).toBeNull()
    expect(oauth.error.value).toBe('Cookie-авторизация не удалась')
    expect(await oauth.cookieAuth('oauth', ' ')).toBeNull()
    expect(oauth.error.value).toBe('Введите хотя бы один корректный sessionKey')
  })

  it('uses the local Russian locale even if the global locale lags in English', async () => {
    state.locale = 'en'
    state.localLocale = 'ru'
    vi.mocked(adminAPI.accounts.generateAuthUrl).mockRejectedValueOnce({
      response: { data: { detail: 'Provider-specific diagnostic' } }
    })
    const oauth = useAccountOAuth()
    expect(await oauth.generateAuthUrl('oauth')).toBe(false)
    expect(oauth.error.value).toBe('Не удалось создать ссылку авторизации')
  })

  it('preserves the existing backend diagnostic for English', async () => {
    state.locale = 'en'
    state.localLocale = 'en'
    vi.mocked(adminAPI.accounts.generateAuthUrl).mockRejectedValueOnce({
      response: { data: { detail: 'Provider-specific diagnostic' } }
    })
    const oauth = useAccountOAuth()
    expect(await oauth.generateAuthUrl('oauth')).toBe(false)
    expect(oauth.error.value).toBe('Provider-specific diagnostic')
  })
})
