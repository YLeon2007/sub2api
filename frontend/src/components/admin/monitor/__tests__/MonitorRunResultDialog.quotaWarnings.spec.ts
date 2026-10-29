import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it, vi } from 'vitest'
import en from '@/i18n/locales/en'
import ru from '@/i18n/locales/ru'
import zh from '@/i18n/locales/zh'
import type { MonitorQuotaSnapshot } from '@/api/admin/channelMonitor'
import MonitorRunResultDialog from '../MonitorRunResultDialog.vue'

// The component must use its own active composer, not the unrelated global one.
vi.mock('@/i18n', async importOriginal => ({
  ...await importOriginal<typeof import('@/i18n')>(), getLocale: () => 'en',
}))

// Shared with the real Go producer test TestQuotaWarningProducerDisplayContracts.
// These gold messages are emitted by deriveQuotaCheckResult, not helper inventions.
const rows = JSON.parse(readFileSync(resolve(process.cwd(), '../backend/internal/service/testdata/quota_warning_contracts.json'), 'utf8')) as {
  name: string; snapshot: MonitorQuotaSnapshot; message: string; ru: string
}[]

for (const locale of ['ru', 'ru-RU', 'en', 'zh'] as const) {
  describe(`actual quota-warning run-result display (${locale})`, () => {
    for (const row of rows) {
      it(`preserves ${row.name} meaning and raw diagnostic`, () => {
        const i18n = createI18n({
          legacy: false, locale, fallbackLocale: false, messages: { en, ru, zh, 'ru-RU': ru },
          missingWarn: false, fallbackWarn: false,
        })
        const result = {
          model: 'quota', status: 'degraded' as const, message: row.message,
          latency_ms: null, ping_latency_ms: null, checked_at: '2026-10-29T00:00:00Z', quota: row.snapshot,
        }
        const before = structuredClone(result)
        const wrapper = mount(MonitorRunResultDialog, {
          props: { show: true, results: [result] },
          global: { plugins: [i18n], stubs: {
            BaseDialog: { template: '<div><slot /><slot name="footer" /></div>' }, MonitorQuotaView: true,
          } },
        })
        const russian = locale === 'ru' || locale === 'ru-RU'
        expect(wrapper.find('span.text-xs').text()).toBe(russian ? row.ru : row.message)
        if (russian) {
          expect(wrapper.find('details summary').text()).toBe('Техническая диагностика')
          expect(wrapper.find('details pre').text()).toBe(row.message)
        } else {
          expect(wrapper.find('details').exists()).toBe(false)
        }
        expect(result).toEqual(before)
        wrapper.unmount()
      })
    }
  })
}
