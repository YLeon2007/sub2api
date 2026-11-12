import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@/stores/app'

const locale = vi.hoisted(() => ({ current: 'ru' }))
vi.mock('@/i18n', () => ({
  getLocale: () => locale.current,
  i18n: { global: { t: () => 'Неизвестная ошибка' } },
}))
vi.mock('@/api/auth', () => ({ getPublicSettings: vi.fn() }))
vi.mock('@/api/admin/system', () => ({ checkUpdates: vi.fn() }))

beforeEach(() => { setActivePinia(createPinia()); locale.current = 'ru' })
describe('withLoadingAndError primary copy', () => {
  it('localizes an unknown backend failure in RU and resets loading', async () => {
    const store = useAppStore()
    const error = new Error('Backend unavailable')
    expect(await store.withLoadingAndError(() => Promise.reject(error))).toBeNull()
    expect(store.toasts[0].message).toBe('Неизвестная ошибка')
    expect(store.loading).toBe(false)
    expect(error.message).toBe('Backend unavailable')
  })
  it.each(['en', 'zh'])('preserves raw message precedence in %s', async (language) => {
    locale.current = language
    const store = useAppStore()
    await store.withLoadingAndError(() => Promise.reject({ message: 'Original', response: { data: { detail: 'Secondary' } } }))
    expect(store.toasts[0].message).toBe('Original')
  })
  it('keeps explicitly supplied translated copy ahead of backend prose', async () => {
    const store = useAppStore()
    await store.withLoadingAndError(() => Promise.reject(new Error('Raw')), 'Сбой операции')
    expect(store.toasts[0].message).toBe('Сбой операции')
  })
})
