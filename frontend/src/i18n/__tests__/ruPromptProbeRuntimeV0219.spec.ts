import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import EndpointPool from '@/features/prompt-audit/components/EndpointPool.vue'
import RuntimeOverview from '@/features/prompt-audit/components/RuntimeOverview.vue'
import { PROMPT_ERROR_CODES, promptErrorLabel, promptModeLabel, promptStatusLabel } from '@/features/prompt-audit/display'
import { createDefaultEndpoint } from '@/features/prompt-audit/viewModel'
import type { PromptAuditRuntime, PromptProbeResult } from '@/features/prompt-audit/types'
import en from '../locales/en'
import ru from '../locales/ru'
import zh from '../locales/zh'

function plugin(locale: 'ru' | 'en' | 'zh') {
  return createI18n({ legacy: false, locale, fallbackLocale: false, messages: { en, ru, zh } })
}
const cases = [
  [true, 'healthy', '', '审计节点连接正常', 'admin.promptAudit.messages.probeSucceeded'],
  [true, 'healthy', '', '审计节点模型调用正常', 'runtimeUi.probeModelSucceeded'],
  [false, 'failed', 'endpoint_invalid', '审计节点配置无效', 'runtimeUi.promptErrors.endpoint_invalid'],
  [false, 'failed', 'timeout', '无法连接审计节点', 'runtimeUi.promptErrors.timeout'],
  [false, 'failed', 'authentication_failed', '审计节点探测失败', 'runtimeUi.promptErrors.authentication_failed'],
  [false, 'failed', 'future_error', '诊断文本', 'admin.promptAudit.errors.probe'],
  [false, 'future_status', 'future_error', 'future backend diagnostic', 'admin.promptAudit.errors.probe'],
] as const

describe('actual prompt-audit display boundary', () => {
  it.each(['ru', 'en', 'zh'] as const)('covers all known codes and never treats prototype/future values as labels (%s)', locale => {
    const i18n = plugin(locale)
    for (const code of PROMPT_ERROR_CODES) {
      expect(i18n.global.te(`runtimeUi.promptErrors.${code}`)).toBe(true)
      expect(promptErrorLabel(code, i18n.global.t)).toBe(i18n.global.t(`runtimeUi.promptErrors.${code}`))
    }
    for (const unknown of ['future_value', '__proto__', 'constructor', 'toString']) {
      expect(promptStatusLabel(unknown, i18n.global.t)).toBe(i18n.global.t('common.unknown'))
      expect(promptModeLabel(unknown, i18n.global.t)).toBe(i18n.global.t('common.unknown'))
      expect(promptErrorLabel(unknown, i18n.global.t)).toBe(i18n.global.t('admin.promptAudit.status.error'))
    }
  })

  for (const locale of ['ru', 'en', 'zh'] as const) {
    it.each(cases)(`keeps probe fields intact and localizes primary result (${locale}, %s/%s/%s)`, (ok, status, code, message, messageKey) => {
      const i18n = plugin(locale)
      const endpoint = { ...createDefaultEndpoint(), id: 'guard-fixture', name: 'Operator custom name' }
      const result: PromptProbeResult = Object.freeze({ ok, status, error_code: code, message, latency_ms: 42,
        http_status: ok ? 200 : 403, retryable: false, checked_at: '2026-10-29T12:00:00Z', token_applied: false })
      const before = JSON.stringify({ endpoint, result })
      const wrapper = mount(EndpointPool, { props: { endpoints: [endpoint], probeResults: { [endpoint.id]: result }, probingIds: [] },
        global: { plugins: [i18n], stubs: { BaseDialog: { template: '<div />' } } } })
      const primary = wrapper.get('article p.line-clamp-2').text()
      expect(primary).toContain(i18n.global.t(status === 'healthy' || status === 'failed' ? `admin.promptAudit.status.${status}` : 'common.unknown'))
      expect(primary).toContain(i18n.global.t(messageKey))
      expect(primary).toContain(String(ok ? 200 : 403))
      expect(primary).toContain('42')
      if (locale === 'ru') expect(primary).not.toMatch(/[\u3400-\u9fff]|healthy|failed|future_status|future_error/)
      const diagnostic = wrapper.get('article details')
      expect(diagnostic.get('summary').text()).toBe(i18n.global.t('admin.promptAudit.events.tabs.technical'))
      expect(diagnostic.attributes('open')).toBeUndefined()
      expect(diagnostic.get('pre').text()).toContain(message)
      expect(diagnostic.get('pre').text()).toContain(status)
      if (code) expect(diagnostic.get('pre').text()).toContain(code)
      expect(wrapper.text()).toContain(endpoint.name)
      expect(JSON.stringify({ endpoint, result })).toBe(before)
      wrapper.unmount()
    })
    it(`localizes sibling runtime statuses and isolates raw last-error diagnostics (${locale})`, () => {
      const i18n = plugin(locale)
      const runtime: PromptAuditRuntime = {
        process_status: 'future_status', effective_mode: 'off', expected_config_version: 4, active_config_version: 4,
        worker_total: 1, worker_active: 0, queue_capacity: 10,
        queue: { staging: 0, queued: 0, processing: 0, retry: 0, done: 0, failed: 0, active: 0 },
        processed_total: 0, failed_total: 0, enqueued_total: 0, dropped_total: 0,
        last_error_code: 'database_unavailable', last_error_message: '数据库不可用', database_status: 'unavailable', redis_status: 'ok',
        endpoints: { 'guard-fixture': { ok: true, status: 'healthy', message: '审计节点连接正常', latency_ms: 42,
          http_status: 200, retryable: false, checked_at: '2026-10-29T12:00:00Z', token_applied: false } },
        guard_metrics: { total: 0, allowed: 0, flagged: 0, blocked: 0, unavailable: 0, invalid: 0, timeouts: 0,
          failovers: 0, bulkhead_full: 0, record_failed: 0 },
      }
      const before = JSON.stringify(runtime)
      const wrapper = mount(RuntimeOverview, { props: { runtime, loading: false, error: '' }, global: { plugins: [i18n] } })
      expect(wrapper.findAll('dd')[0].text()).toBe(i18n.global.t('common.unknown'))
      expect(wrapper.findAll('dd')[5].text()).toBe(`DB ${i18n.global.t('admin.promptAudit.status.failed')} · Redis ${i18n.global.t('admin.promptAudit.status.healthy')}`)
      const primary = wrapper.get('[data-test="runtime-last-error"]').text()
      expect(primary).toBe(i18n.global.t('runtimeUi.promptErrors.database_unavailable'))
      if (locale === 'ru') expect(primary).not.toMatch(/[\u3400-\u9fff]|database_unavailable/)
      expect(wrapper.get('details pre').text()).toContain(runtime.last_error_message)
      expect(wrapper.get('[data-test="runtime-endpoint-status"]').text()).toContain(i18n.global.t('admin.promptAudit.status.healthy'))
      expect(JSON.stringify(runtime)).toBe(before)
      wrapper.unmount()
    })
  }
})
