import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import TokenUsageTrend from '@/components/charts/TokenUsageTrend.vue'
import AuthLayout from '@/components/layout/AuthLayout.vue'
import UseKeyModal from '@/components/keys/UseKeyModal.vue'
import PlatformTypeBadge from '@/components/common/PlatformTypeBadge.vue'
import AccountTableFilters from '@/components/admin/account/AccountTableFilters.vue'
import { getPresetMappingsByPlatform } from '@/composables/useModelWhitelist'

const fixtures = vi.hoisted(() => ({ subtitle: '', fetchSettings: vi.fn() }))
vi.mock('@/stores', () => ({ useAppStore: () => ({
  siteName: 'Fixture Site', siteLogo: '', publicSettingsLoaded: true,
  get cachedPublicSettings() { return { site_subtitle: fixtures.subtitle } },
  fetchPublicSettings: fixtures.fetchSettings,
}) }))
vi.mock('@/composables/useClipboard', () => ({ useClipboard: () => ({ copyToClipboard: vi.fn() }) }))

vi.mock('vue-chartjs', () => ({
  Line: { name: 'Line', props: ['data', 'options'], template: '<div data-chart />' },
}))
import NotFoundView from '@/views/NotFoundView.vue'
import en from '../locales/en'
import ru from '../locales/ru'
import zh from '../locales/zh'

const messages = { en, ru, zh }
function plugin(locale: 'en' | 'ru' | 'zh') {
  return createI18n({ legacy: false, locale, fallbackLocale: false, messages })
}

describe('actual shared runtime surfaces with real locale messages', () => {
  it.each(['ru', 'en', 'zh'] as const)('localizes six passthrough preset labels while preserving exact mappings (%s)', locale => {
    const i18n = plugin(locale)
    const original = getPresetMappingsByPlatform('antigravity')
    // The exported source inventory remains immutable; only display labels change.
    const raw = original.filter(preset => preset.label.includes('透传'))
    expect(raw).toHaveLength(6)
    const localized = getPresetMappingsByPlatform('antigravity', i18n.global.t)
    expect(localized.map(({ label: _label, ...mapping }) => mapping)).toEqual(original.map(({ label: _label, ...mapping }) => mapping))
    for (const preset of raw) {
      const display = localized.find(entry => entry.from === preset.from && entry.to === preset.to)!
      expect(display.label).toBe(i18n.global.t('runtimeUi.presetPassthrough', { model: preset.label.replace('透传', '') }))
      if (locale === 'ru') expect(display.label).toContain('без изменения')
    }
    expect(original.filter(preset => preset.label.includes('透传'))).toHaveLength(6)
  })

  it.each(['ru', 'en', 'zh'] as const)('localizes auth defaults and keeps custom site text (%s)', locale => {
    const i18n = plugin(locale)
    for (const custom of ['', 'A custom operator subtitle']) {
      fixtures.subtitle = custom
      const wrapper = mount(AuthLayout, { global: { plugins: [i18n] } })
      expect(wrapper.text()).toContain(custom || i18n.global.t('admin.settings.site.siteSubtitlePlaceholder'))
      expect(wrapper.text()).toContain(i18n.global.t('home.footer.allRightsReserved'))
      expect(wrapper.get('img').attributes('alt')).toBe(i18n.global.t('runtimeUi.siteLogo'))
      if (locale === 'ru' && !custom) expect(wrapper.text()).not.toMatch(/All rights reserved|Subscription to API Conversion Platform/)
      wrapper.unmount()
    }
  })
  it.each(['ru', 'en', 'zh'] as const)('localizes accessible key setup navigation (%s)', locale => {
    const i18n = plugin(locale)
    const wrapper = mount(UseKeyModal, { props: { show: true, apiKey: 'fixture-key', platform: 'anthropic', baseUrl: 'https://example.invalid/v1' },
      global: { plugins: [i18n], stubs: { BaseDialog: { template: '<div><slot /></div>' } } } })
    expect(wrapper.findAll('nav').map(nav => nav.attributes('aria-label'))).toEqual([
      i18n.global.t('runtimeUi.clientNavigation'), i18n.global.t('runtimeUi.tabsNavigation'),
    ])
    wrapper.unmount()
  })
  it.each(['ru', 'en', 'zh'] as const)('localizes privacy labels without changing enum values (%s)', locale => {
    const i18n = plugin(locale)
    const wrapper = mount(AccountTableFilters, { props: { searchQuery: '', filters: {} },
      global: { plugins: [i18n], stubs: { SearchInput: true, Select: { name: 'Select', props: ['options'], template: '<div />' } } } })
    const privacyOptions = wrapper.findAllComponents({ name: 'Select' })[3].props('options')
    expect(privacyOptions.map((entry: { value: string }) => entry.value)).toEqual(['', '__unset__', 'training_off', 'training_set_cf_blocked', 'training_set_failed'])
    expect(privacyOptions.find((entry: { value: string }) => entry.value === 'training_off').label).toBe(i18n.global.t('runtimeUi.privacy'))
    expect(privacyOptions.find((entry: { value: string }) => entry.value === 'training_set_failed').label).toBe(i18n.global.t('common.error'))
    wrapper.unmount()
    for (const [platform, privacyMode, key] of [
      ['openai', 'training_off', 'runtimeUi.private'], ['openai', 'training_set_failed', 'common.error'],
      ['antigravity', 'privacy_set', 'runtimeUi.private'], ['antigravity', 'privacy_set_failed', 'common.error'],
    ] as const) {
      const badge = mount(PlatformTypeBadge, { props: { platform, type: 'oauth', privacyMode }, global: { plugins: [i18n], stubs: { PlatformIcon: true } } })
      expect(badge.find('[title]').text()).toBe(i18n.global.t(key))
      expect(badge.props('privacyMode')).toBe(privacyMode)
      badge.unmount()
    }
  })

  it.each(['ru', 'en', 'zh'] as const)('localizes chart legend and cost footer without changing computations (%s)', locale => {
    const i18n = plugin(locale)
    const wrapper = mount(TokenUsageTrend, { props: { trendData: [{ date: '2026-10-29', requests: 1,
      input_tokens: 500, output_tokens: 100, cache_creation_tokens: 0, cache_read_tokens: 1500, cost: 0.01, actual_cost: 0.005 }] },
      global: { plugins: [i18n] } })
    const chart = wrapper.getComponent({ name: 'Line' })
    expect(chart.props('data').datasets.map((entry: { label: string }) => entry.label)).toEqual([
      'admin.usage.inputTokens', 'admin.usage.outputTokens', 'usage.cacheCreationTokensLabel',
      'usage.cacheReadTokensLabel', 'usage.cacheHitRate',
    ].map(key => i18n.global.t(key)))
    expect(chart.props('data').datasets.map((entry: { data: number[] }) => entry.data)).toEqual([[500], [100], [0], [1500], [75]])
    expect(chart.props('options').plugins.tooltip.callbacks.footer([{ dataIndex: 0 }])).toBe(
      `${i18n.global.t('usage.actualCost')}: $0.0050 | ${i18n.global.t('usage.standardCost')}: $0.010`,
    )
    wrapper.unmount()
  })

  it.each(['ru', 'en', 'zh'] as const)('localizes the complete catch-all page (%s)', async locale => {
    const i18n = plugin(locale)
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
    await router.push('/')
    const wrapper = mount(NotFoundView, { global: { plugins: [i18n, router], stubs: { RouterLink: { template: '<a><slot /></a>' } } } })
    const text = wrapper.text()
    expect(text).toContain(i18n.global.t('runtimeUi.notFoundDescription'))
    expect(text).toContain(i18n.global.t('common.back'))
    expect(text).toContain(i18n.global.t('runtimeUi.goToDashboard'))
    expect(text).toContain(i18n.global.t('runtimeUi.needHelp'))
    expect(text).toContain(i18n.global.t('common.contactSupport'))
    if (locale === 'ru') expect(text).not.toMatch(/The page you are looking for|Go Back|Go to Dashboard|Need help|Contact support/)
    wrapper.unmount()
  })
})
