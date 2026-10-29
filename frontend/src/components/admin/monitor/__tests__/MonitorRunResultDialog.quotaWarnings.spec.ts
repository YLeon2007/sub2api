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

// All producer windows are exercised through the real child and progress bar.
// Immutable official MonitorQuotaView leaves monthly raw in EN/ZH; only RU
// closes the missing display mapping, without changing those original labels.
const windows: Record<string, string> = {
  '5h': '5h', '7d': '7d', '7d-sonnet': '7dSonnet', '7d-fable': '7dFable',
  daily: 'daily', weekly: 'weekly', monthly: 'monthly', '30d': '30d', total: 'total',
}
const labels = new Set(['requests', 'tokens', 'shared', 'pro', 'flash'])

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
            BaseDialog: { template: '<div><slot /><slot name="footer" /></div>' },
          } },
        })
        const russian = locale === 'ru' || locale === 'ru-RU'
        expect(wrapper.find('span.text-xs').text()).toBe(russian ? row.ru : row.message)
        const bars = wrapper.findAll('[data-testid="monitor-quota-tier"]')
        expect(bars).toHaveLength(row.snapshot.tiers?.length || 0)
        for (const [index, tier] of (row.snapshot.tiers || []).entries()) {
          const key = tier.window === 'monthly' && !russian ? undefined : windows[tier.window]
          const window = key ? i18n.global.t(`monitorCommon.quota.windows.${key}`) : tier.window
          const label = tier.label && labels.has(tier.label)
            ? i18n.global.t(`monitorCommon.quota.labels.${tier.label}`) : tier.label
          const expected = label ? `${label}/${window}` : window
          expect(bars[index].attributes('title')).toBe(expected)
          expect(bars[index].text()).toContain(expected)
        }
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
