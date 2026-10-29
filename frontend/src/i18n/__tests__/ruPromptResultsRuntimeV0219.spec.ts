import { enableAutoUnmount, mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it } from 'vitest'
import EventDetailDialog from '@/features/prompt-audit/components/EventDetailDialog.vue'
import FilterDeleteDialog from '@/features/prompt-audit/components/FilterDeleteDialog.vue'
import type { PromptAuditEvent, PromptDeletePreview, PromptIssueSummary } from '@/features/prompt-audit/types'
import { emptyEventFilters } from '@/features/prompt-audit/viewModel'
import en from '../locales/en'
import ru from '../locales/ru'
import zh from '../locales/zh'

enableAutoUnmount(afterEach)

const locales = ['ru', 'en', 'zh', 'ru-RU'] as const
type Locale = (typeof locales)[number]
const copy = {
  ru: {
    title: 'Неизвестная опасная категория',
    description: 'Узел аудита вернул неизвестную, но потенциально опасную категорию.',
    filterHash: 'SHA-256 фильтра',
  },
  en: {
    title: 'Unknown unsafe category',
    description: 'The audit node returned an unknown but potentially unsafe category.',
    filterHash: 'Filter SHA-256',
  },
  zh: {
    title: '未知高风险分类',
    description: '审计节点返回了未知但不可忽略的高风险分类',
    filterHash: '筛选条件 SHA-256',
  },
} as const

function plugin(locale: Locale) {
  return createI18n({
    legacy: false, locale, fallbackLocale: locale === 'ru-RU' ? 'ru' : false,
    missingWarn: false, fallbackWarn: false, messages: { en, ru, zh },
  })
}

const DialogStub = defineComponent({
  props: ['show', 'title'],
  template: '<div v-if="show" role="dialog" :aria-label="title"><slot /><slot name="footer" /></div>',
})

function freezeFixture<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeFixture)
    Object.freeze(value)
  }
  return value
}

const unknownCategory = 'unknown:0123456789abcdef'
function issue(overrides: Partial<PromptIssueSummary> = {}): PromptIssueSummary {
  // BuildIssueSummaries' known unknown-category contract, not arbitrary user prose.
  return {
    category: unknownCategory, scanner_id: 'unknown_unsafe', title: '未知高风险分类',
    description: '审计节点返回了未知但不可忽略的高风险分类', severity: 'critical',
    severity_label: '严重', action: 'Block', action_label: '阻止',
    code: 'prompt_audit_unknown_unsafe', score: 1, evidence: 'unknown_unsafe',
    evidence_hash: 'abcdef0123456789'.repeat(4), ...overrides,
  }
}

function eventFor(summary: PromptIssueSummary): PromptAuditEvent {
  return freezeFixture<PromptAuditEvent>({
    id: 17, job_id: 19, decision: 'critical', risk_level: 'critical', action: 'Block',
    categories: [unknownCategory], matched_scanners: ['unknown_unsafe'],
    scanner_scores: { [unknownCategory]: 1 }, scanner_evidence: { [unknownCategory]: 'unknown_unsafe' },
    scanner_backend: 'qwen3guard-openai', scanner_version: 'qwen3guard', guard_endpoint_id: 'guard-fixture',
    policy_id: 'priority', policy_version: 2, config_version: 3, chunk_total: 1, latency_ms: 42,
    issue_summaries: [summary], created_at: '2026-10-29T12:00:00Z',
    snapshot: {
      request_id: 'req-fixture', user_id: 11, username: 'Operator unknown_unsafe',
      user_email: 'operator@example.test', api_key_id: 13, api_key_name: 'Custom key 未知高风险分类',
      group_id: 23, group_name: 'Custom group', provider: 'openai', endpoint: '/v1/chat/completions',
      protocol: 'openai_chat', model: 'custom-model', prompt_hash: '0123456789abcdef'.repeat(4),
      redacted_preview: 'Redacted fixture', full_prompt: 'User prompt: unknown_unsafe / 未知高风险分类 / pii',
      prompt_length: 54, message_count: 1, stage: 'http',
    },
  })
}

function mountEvent(locale: Locale, event: PromptAuditEvent) {
  const i18n = plugin(locale)
  const wrapper = mount(EventDetailDialog, {
    props: { show: true, event, loading: false },
    global: { plugins: [i18n], stubs: { BaseDialog: DialogStub } },
  })
  return { wrapper, i18n }
}

const unknownCases = [
  { category: 'future_category', scanner_id: 'future_scanner', expectedTitle: 'future_category' },
  { category: '', scanner_id: 'future_scanner', expectedTitle: 'future_scanner' },
  { category: 'future_category', scanner_id: '', expectedTitle: 'future_category' },
  { category: '', scanner_id: '', expectedTitle: 'Custom title 未知高风险分类' },
  // Neither a category nor an error code alone identifies the known scanner case.
  { category: 'unknown_unsafe', scanner_id: 'future_scanner', expectedTitle: 'unknown_unsafe' },
  { category: 'unknown_unsafe', scanner_id: '', expectedTitle: 'unknown_unsafe' },
  { category: 'future_category', scanner_id: 'unknown_unsafe_v2', expectedTitle: 'future_category' },
  { category: 'future_category', scanner_id: 'pii', expectedTitle: 'future_category' },
] as const

for (const locale of locales) {
  describe(`actual prompt results display boundary (${locale})`, () => {
    const expected = copy[locale === 'ru-RU' ? 'ru' : locale]

    it.each([unknownCategory, 'unknown_unsafe', '', 'pii'])(
      'localizes the known unknown_unsafe scanner even when category is %j', async category => {
        const event = eventFor(issue({ category }))
        const before = JSON.stringify(event)
        const { wrapper, i18n } = mountEvent(locale, event)
        expect(i18n.global.t('runtimeUi.unknownUnsafeTitle')).toBe(expected.title)
        expect(i18n.global.t('runtimeUi.unknownUnsafeDescription')).toBe(expected.description)
        await wrapper.findAll('[role="tab"]')[1].trigger('click')
        const risk = wrapper.get('[data-test="risk-issue"]')
        expect(risk.isVisible()).toBe(true)
        expect(risk.get('h5').text()).toBe(expected.title)
        expect(risk.get('p').text()).toBe(expected.description)
        expect(risk.get('span').text()).toBe(
          `${i18n.global.t('admin.promptAudit.riskLevels.critical')} · ${i18n.global.t('admin.promptAudit.actions.Block')}`,
        )
        const details = risk.findAll('dd')
        expect(details[0].text()).toBe(category === 'pii' ? i18n.global.t('admin.promptAudit.scanners.pii') : category || 'unknown_unsafe')
        expect(details[1].text()).toBe('1')
        expect(details[2].text()).toBe('unknown_unsafe')
        expect(wrapper.get('[data-test="risk-prompt-full"]').text()).toBe(event.snapshot.full_prompt)
        const guardReturn = JSON.parse(wrapper.get('[data-test="risk-guard-return"] pre').text())
        expect(guardReturn).toMatchObject({
          categories: event.categories, matched_scanners: event.matched_scanners,
          scanner_scores: event.scanner_scores, scanner_evidence: event.scanner_evidence,
          scanner_backend: event.scanner_backend, scanner_version: event.scanner_version,
          guard_endpoint_id: event.guard_endpoint_id, chunk_total: 1, latency_ms: 42,
        })
        await wrapper.findAll('[role="tab"]')[2].trigger('click')
        const technical = wrapper.get('dl[role="tabpanel"]')
        expect(technical.isVisible()).toBe(true)
        expect(technical.text()).toContain(event.snapshot.request_id)
        expect(technical.text()).toContain(event.snapshot.prompt_hash)
        expect(technical.text()).toContain('priority · v2')
        expect(JSON.stringify(event)).toBe(before)
        expect(event.issue_summaries[0]).toMatchObject({
          scanner_id: 'unknown_unsafe', category, code: 'prompt_audit_unknown_unsafe',
          title: '未知高风险分类', description: '审计节点返回了未知但不可忽略的高风险分类',
          evidence: 'unknown_unsafe', evidence_hash: 'abcdef0123456789'.repeat(4),
        })
      },
    )

    it.each(unknownCases)('preserves generic unknown fallback ($category/$scanner_id)', async ({ category, scanner_id, expectedTitle }) => {
      const summary = issue({
        category, scanner_id, code: 'prompt_audit_unknown_unsafe', title: 'Custom title 未知高风险分类',
        description: 'Custom description: unknown_unsafe / 审计节点返回了未知但不可忽略的高风险分类',
        evidence: 'Raw evidence: unknown_unsafe / Violent / PII / 中文',
        severity: 'future_severity', severity_label: 'Custom severity', action: 'future_action', action_label: 'Custom action',
      })
      const event = eventFor(summary)
      const before = JSON.stringify(event)
      const { wrapper } = mountEvent(locale, event)
      await wrapper.findAll('[role="tab"]')[1].trigger('click')
      const risk = wrapper.get('[data-test="risk-issue"]')
      expect(risk.get('h5').text()).toBe(expectedTitle)
      expect(risk.get('p').text()).toBe(summary.description)
      expect(risk.get('span').text()).toBe('Custom severity · Custom action')
      expect(risk.findAll('dd')[2].text()).toBe(summary.evidence)
      expect(JSON.stringify(event)).toBe(before)
    })

    it.each([
      { category: 'pii', scanner_id: 'pii' },
      { category: '', scanner_id: 'pii' },
      { category: 'pii', scanner_id: '' },
      { category: 'pii', scanner_id: 'violent' },
    ])('preserves known category precedence and missing-field fallback ($category/$scanner_id)', async identifiers => {
      const event = eventFor(issue({ ...identifiers, code: 'prompt_audit_pii', evidence: 'Exact user evidence / pii' }))
      const before = JSON.stringify(event)
      const { wrapper, i18n } = mountEvent(locale, event)
      await wrapper.findAll('[role="tab"]')[1].trigger('click')
      const risk = wrapper.get('[data-test="risk-issue"]')
      expect(risk.get('h5').text()).toBe(i18n.global.t('admin.promptAudit.scanners.pii'))
      expect(risk.get('p').text()).toBe(i18n.global.t('admin.promptAudit.scannerDescriptions.pii'))
      expect(risk.findAll('dd')[2].text()).toBe('Exact user evidence / pii')
      expect(JSON.stringify(event)).toBe(before)
    })

    it('localizes only the filter hash heading and preserves preview DTO and emitted criteria', async () => {
      const i18n = plugin(locale)
      const initialFilters = freezeFixture({
        ...emptyEventFilters(), decision: 'critical', risk_level: 'high', endpoint: '/v1/chat/completions',
        group_id: '23', user_id: '11', api_key_id: '13', request_id: 'req-fixture',
        prompt_hash: '0123456789abcdef'.repeat(4), keyword: 'Custom unknown_unsafe / 未知高风险分类',
        start_at: '2026-10-01T00:00', end_at: '2026-10-02T00:00',
      })
      const preview: PromptDeletePreview = freezeFixture({
        matched_count: 3, snapshot_max_id: 29, filter_hash: 'abcdef0123456789'.repeat(4),
        confirmation_token: 'opaque-fixture-token', expires_at: '2026-10-29T12:05:00Z',
        filter_summary: { decision: 'critical', keyword: initialFilters.keyword },
      })
      const before = JSON.stringify({ initialFilters, preview })
      const wrapper = mount(FilterDeleteDialog, {
        props: { show: true, initialFilters, preview: null, previewing: false, deleting: false },
        global: { plugins: [i18n], stubs: { BaseDialog: DialogStub } },
      })
      expect(wrapper.find('[data-test="delete-preview-result"]').exists()).toBe(false)
      expect(wrapper.get('[data-test="delete-preview-empty"]').isVisible()).toBe(true)
      await wrapper.get('[data-test="run-delete-preview"]').trigger('click')
      expect(wrapper.emitted('preview')).toEqual([[initialFilters]])
      await wrapper.setProps({ preview })
      expect(i18n.global.t('runtimeUi.filterHash')).toBe(expected.filterHash)
      const result = wrapper.get('[data-test="delete-preview-result"]')
      expect(result.findAll('dt').map(dt => dt.text())).toContain(expected.filterHash)
      expect(result.findAll('dd')[1].text()).toBe(preview.filter_hash)
      expect(result.findAll('dd')[0].text()).toBe('29')
      expect(wrapper.text()).not.toContain(preview.confirmation_token)
      await wrapper.get('[data-test="confirm-filter-delete"]').trigger('click')
      expect(wrapper.emitted('confirm')).toEqual([[initialFilters]])
      expect(JSON.stringify({ initialFilters, preview })).toBe(before)
    })
  })
}

describe('live locale changes on mounted prompt results', () => {
  it('recomputes risk card display without rewriting the event', async () => {
    const event = eventFor(issue())
    const before = JSON.stringify(event)
    const { wrapper, i18n } = mountEvent('en', event)
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    for (const locale of locales) {
      // vue-i18n infers message keys, but regional fallback locales are valid.
      i18n.global.locale.value = locale as typeof i18n.global.locale.value
      expect(String(i18n.global.locale.value)).toBe(locale)
      await nextTick()
      const expected = copy[locale === 'ru-RU' ? 'ru' : locale]
      const risk = wrapper.get('[data-test="risk-issue"]')
      expect(risk.get('h5').text()).toBe(expected.title)
      expect(risk.get('p').text()).toBe(expected.description)
      expect(risk.findAll('dd')[2].text()).toBe('unknown_unsafe')
    }
    expect(JSON.stringify(event)).toBe(before)
  })
})
