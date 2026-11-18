import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '@/i18n/locales/en'
import zh from '@/i18n/locales/zh'
import ru from '@/i18n/locales/ru'
import { useGeminiOAuth } from '@/composables/useGeminiOAuth'
import { useAppStore } from '@/stores/app'
import BulkEditUserModal from '../BulkEditUserModal.vue'

const fixture = vi.hoisted(() => ({
  generateAuthUrl: vi.fn(), batchUpdateLimits: vi.fn(),
  composer: null as unknown as { t: (key: string) => string; locale: { value: string } },
}))
vi.mock('@/api/admin', () => ({ adminAPI: {
  gemini: { generateAuthUrl: fixture.generateAuthUrl },
  users: { batchUpdateLimits: fixture.batchUpdateLimits },
} }))
vi.mock('@/i18n', async importOriginal => ({
  ...await importOriginal<typeof import('@/i18n')>(), getLocale: () => 'en',
}))
vi.mock('vue-i18n', async importOriginal => ({
  ...await importOriginal<typeof import('vue-i18n')>(), useI18n: () => fixture.composer,
}))

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  setActivePinia(createPinia())
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// Official dece2615 uses the generic extractor at both actual catch sites.
// Its Standard Error branch returns err.message verbatim, INCLUDING "".
// The actual app store always enqueues that value; it does not suppress empties.
for (const locale of ['en', 'zh', 'ru', 'ru-RU', 'RU_ru', 'ru_RU'] as const) {
  describe(`real extracted-error consumers and real toast store (${locale})`, () => {
    for (const consumer of ['Gemini', 'BulkEdit'] as const) {
      it.each([
        { name: 'empty Standard Error', error: new Error(''), original: '' },
        { name: 'populated Standard Error', error: new Error('Original error'), original: 'Original error' },
        { name: 'empty plain message falls back', error: { message: '' }, original: undefined },
        { name: 'message precedes detail', error: { message: 'Envelope', response: { data: { detail: 'Detail' } } }, original: 'Envelope' },
        { name: 'detail selected when message absent', error: { response: { data: { detail: 'Detail' } } }, original: 'Detail' },
      ])(`${consumer} preserves $name`, async row => {
        const i18n = createI18n({ legacy: false, locale, fallbackLocale: false,
          messages: { en, zh, ru, 'ru-RU': ru, RU_ru: ru, ru_RU: ru }, missingWarn: false, fallbackWarn: false })
        fixture.composer = i18n.global
        const app = useAppStore()
        const fallback = i18n.global.t(consumer === 'Gemini'
          ? 'admin.accounts.oauth.gemini.failedToGenerateUrl' : 'admin.users.bulkLimits.failed')
        const expected = locale.toLowerCase().split(/[-_]/)[0] === 'ru' ? fallback : row.original ?? fallback
        let wrapper: ReturnType<typeof mount> | undefined
        if (consumer === 'Gemini') {
          fixture.generateAuthUrl.mockRejectedValueOnce(row.error)
          const oauth = useGeminiOAuth()
          expect(await oauth.generateAuthUrl(null)).toBe(false)
          expect(fixture.generateAuthUrl).toHaveBeenCalledOnce()
          expect(oauth.error.value).toBe(expected)
          expect(oauth.loading.value).toBe(false)
        } else {
          fixture.batchUpdateLimits.mockRejectedValueOnce(row.error)
          wrapper = mount(BulkEditUserModal, { props: { show: true, selectedIds: [4, 7] }, global: {
            plugins: [i18n], stubs: { BaseDialog: { template: '<div><slot /><slot name="footer" /></div>' } },
          } })
          await wrapper.get('[data-test="enable-concurrency"]').trigger('click')
          await wrapper.get('[data-test="concurrency-input"]').setValue('5')
          await wrapper.get('form').trigger('submit')
          await flushPromises()
          expect(fixture.batchUpdateLimits).toHaveBeenCalledOnce()
          expect(wrapper.emitted('success')).toBeUndefined()
          expect(wrapper.get('[data-test="submit"]').attributes('disabled')).toBeUndefined()
        }
        expect(app.toasts).toHaveLength(1)
        expect(app.toasts[0].type).toBe('error')
        expect(app.toasts[0].message).toBe(expected)
        wrapper?.unmount()
      })
    }
  })
}
