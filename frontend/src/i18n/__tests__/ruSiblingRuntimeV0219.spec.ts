import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserDashboardCharts from '@/components/user/dashboard/UserDashboardCharts.vue'
import UserDashboardRecentUsage from '@/components/user/dashboard/UserDashboardRecentUsage.vue'
import UserBreakdownSubTable from '@/components/charts/UserBreakdownSubTable.vue'
import UserTokenRanking from '@/components/admin/usage/UserTokenRanking.vue'
import OpsOpenAITokenStatsCard from '@/views/admin/ops/components/OpsOpenAITokenStatsCard.vue'
import MonitorSettingsPanel from '@/features/channel-monitor-v2/MonitorSettingsPanel.vue'
import TotpSetupModal from '@/components/user/profile/TotpSetupModal.vue'
import { NodeTypes, actualElements, actualHandler, actualObjectFields, hasBinding, renderActual } from './ruSiblingRuntimeHarness'
import en from '../locales/en'
import ru from '../locales/ru'
import zh from '../locales/zh'
import type { UsageLog } from '@/types'

const fixtures = vi.hoisted(() => ({
  locale: 'ru' as 'en' | 'ru' | 'zh',
  breakdown: vi.fn(), stats: vi.fn(), getConfig: vi.fn(), updateConfig: vi.fn(), groups: vi.fn(),
  showError: vi.fn(), showSuccess: vi.fn(), getMethod: vi.fn(), setupTotp: vi.fn(), qr: vi.fn(),
}))
// Preserve the actual module exports (especially createI18n in its dependency),
// while keeping formatting locale aligned with each mounted composer.
vi.mock('@/i18n', async importActual => ({
  ...await importActual<typeof import('@/i18n')>(), getLocale: () => fixtures.locale,
}))
vi.mock('@/api/admin/dashboard', () => ({ getUserBreakdown: fixtures.breakdown }))
vi.mock('@/api/admin/ops', () => ({ opsAPI: { getOpenAITokenStats: fixtures.stats } }))
vi.mock('@/api/admin', () => ({ adminAPI: { groups: { getAllIncludingInactive: fixtures.groups } } }))
vi.mock('@/api/channelMonitorV2', async importActual => ({
  ...await importActual<typeof import('@/api/channelMonitorV2')>(),
  getConfig: fixtures.getConfig, updateConfig: fixtures.updateConfig,
}))
vi.mock('@/stores/app', () => ({ useAppStore: () => ({
  cachedPublicSettings: { channel_monitor_enabled: true, channel_monitor_mode: 'v2' },
  showError: fixtures.showError, showSuccess: fixtures.showSuccess,
}) }))
vi.mock('@/api', () => ({ totpAPI: { getVerificationMethod: fixtures.getMethod, initiateSetup: fixtures.setupTotp } }))
vi.mock('qrcode', () => ({ default: { toDataURL: fixtures.qr } }))
vi.mock('vue-chartjs', () => ({
  Doughnut: { name: 'Doughnut', props: ['data', 'options'], template: '<div data-chart />' },
  Line: { name: 'Line', props: ['data', 'options'], template: '<div data-chart />' },
}))

const locales = ['ru', 'en', 'zh'] as const
function plugin(locale: typeof locales[number]) {
  fixtures.locale = locale
  return createI18n({ legacy: false, locale, fallbackLocale: false, messages: { en, ru, zh } })
}
const selectStub = { name: 'Select', props: ['options', 'modelValue'], emits: ['update:modelValue', 'change'], template: '<div data-select />' }
const rows = [
  { user_id: 73, email: '', requests: 1234, input_tokens: 1000, output_tokens: 200, cache_tokens: 300, total_tokens: 1500, actual_cost: 0.0123, account_cost: 0.02, cost: 0.03 },
  { user_id: 91, email: 'Operator+Custom@example.invalid', requests: 2, input_tokens: 3, output_tokens: 4, cache_tokens: 5, total_tokens: 12, actual_cost: 0.02, account_cost: 0.03, cost: 0.04 },
]
const monitorConfig = {
  enabled: true, refresh_interval_seconds: 60, platforms: [{ platform: 'openai', enabled: true, models: ['operator-model'] }],
  group_ids: [19], ignored_error_categories: [], health_thresholds: {},
}

beforeEach(() => {
  vi.clearAllMocks()
  fixtures.breakdown.mockResolvedValue({ users: rows })
  fixtures.stats.mockResolvedValue({ items: [], total: 0 })
  fixtures.getConfig.mockImplementation(async () => structuredClone(monitorConfig))
  fixtures.updateConfig.mockImplementation(async payload => JSON.parse(JSON.stringify(payload)))
  fixtures.groups.mockResolvedValue([{ id: 19, name: 'Operator group', platform: 'openai' }])
  fixtures.getMethod.mockResolvedValue({ method: 'password' })
  fixtures.setupTotp.mockResolvedValue({ secret: 'FIXTURE-SECRET', setup_token: 'fixture-setup', qr_code_url: 'otpauth://totp/Fixture?secret=FIXTURE' })
  fixtures.qr.mockResolvedValue('data:image/png;base64,Zml4dHVyZQ==')
})

describe('S5 actual chart, ranking and Top N paths', () => {
  it.each(locales)('localizes tooltip and recent-usage token units without changing numbers or models (%s)', locale => {
    const i18n = plugin(locale)
    const charts = mount(UserDashboardCharts, { props: {
      loading: false, startDate: '2026-10-01', endDate: '2026-10-29', granularity: 'day', trend: [],
      models: [{ model: 'Operator-Custom-Model', requests: 3, total_tokens: 1500, actual_cost: 0.0123, cost: 0.03, input_tokens: 1000, output_tokens: 500, cache_creation_tokens: 0, cache_read_tokens: 0 }],
    }, global: { plugins: [i18n], stubs: { Select: selectStub, DateRangePicker: true, TokenUsageTrend: true } } })
    const chart = charts.getComponent({ name: 'Doughnut' })
    expect(chart.props('data').labels).toEqual(['Operator-Custom-Model'])
    expect(chart.props('data').datasets[0].data).toEqual([1500])
    expect(chart.props('options').plugins.tooltip.callbacks.label({ label: 'Operator-Custom-Model', parsed: 1500 }))
      .toBe(`Operator-Custom-Model: 1.5K ${i18n.global.t('dashboard.tokens')}`)
    expect(charts.text()).toContain('$0.0123')
    charts.unmount()
    const recent = mount(UserDashboardRecentUsage, { props: { loading: false, data: [{
      id: 7, model: 'Operator-Custom-Model', created_at: '2026-10-29T12:00:00Z', input_tokens: 1234,
      output_tokens: 56, actual_cost: 0.0123, total_cost: 0.03,
    } as UsageLog] }, global: { plugins: [i18n], stubs: { RouterLink: { template: '<a><slot /></a>' }, Icon: true } } })
    expect(recent.text()).toContain(`${(1290).toLocaleString()} ${i18n.global.t('dashboard.tokens')}`)
    expect(recent.text()).toContain('Operator-Custom-Model')
    expect(recent.text()).toContain('$0.0123')
    recent.unmount()
  })

  it.each(locales)('localizes empty-email fallback but preserves custom emails, IDs, selection and numeric API limits (%s)', async locale => {
    const i18n = plugin(locale)
    expect(i18n.global.te('runtimeUi.userIdFallback')).toBe(true)
    expect(i18n.global.te('runtimeUi.topCount')).toBe(true)
    const breakdown = mount(UserBreakdownSubTable, { props: { items: rows }, global: { plugins: [i18n] } })
    const cells = breakdown.findAll('tbody tr').map(row => row.findAll('td'))
    expect(cells[0][0].text()).toBe(i18n.global.t('runtimeUi.userIdFallback', { id: 73 }))
    expect(cells[1][0].text()).toBe(rows[1].email)
    expect(cells[1][0].attributes('title')).toBe(rows[1].email)
    expect(cells[0][1].text()).toBe((1234).toLocaleString())
    expect(cells[0][2].text()).toBe('1.50K')
    expect(cells[0][3].text()).toBe('$0.012')
    breakdown.unmount()

    const ranking = mount(UserTokenRanking, { props: { startDate: '2026-10-01', endDate: '2026-10-29', filters: { group_id: 19 }, model: 'operator-model' },
      global: { plugins: [i18n], stubs: { Select: selectStub } } })
    await flushPromises()
    const tableRows = ranking.findAll('tbody tr')
    expect(tableRows[0].text()).toContain(i18n.global.t('runtimeUi.userIdFallback', { id: 73 }))
    expect(tableRows[1].findAll('td')[1].attributes('title')).toBe(rows[1].email)
    expect(tableRows[1].text()).toContain(rows[1].email)
    await tableRows[0].trigger('click')
    await tableRows[1].trigger('click')
    expect(ranking.emitted('select-user')).toEqual([[73, ''], [91, rows[1].email]])
    const select = ranking.getComponent({ name: 'Select' })
    expect(select.props('modelValue')).toBe(50)
    expect(select.props('options')).toEqual([20, 50, 100, 200].map(count => ({ value: count, label: i18n.global.t('runtimeUi.topCount', { count }) })))
    for (const count of [20, 50, 100, 200]) {
      select.vm.$emit('update:modelValue', count)
      select.vm.$emit('change', count)
      await flushPromises()
      expect(fixtures.breakdown).toHaveBeenLastCalledWith({ group_id: 19, start_date: '2026-10-01', end_date: '2026-10-29', sort_by: 'total_tokens', limit: count, model: 'operator-model' })
    }
    i18n.global.locale.value = locale === 'ru' ? 'en' : 'ru'
    await nextTick()
    expect(select.props('options')[0].label).toBe(i18n.global.t('runtimeUi.topCount', { count: 20 }))
    ranking.unmount()
  })

  it.each(locales)('localizes ops limits and keeps exact top_n and pagination payloads (%s)', async locale => {
    const i18n = plugin(locale)
    const wrapper = mount(OpsOpenAITokenStatsCard, { props: { refreshToken: 7, platformFilter: 'openai', groupIdFilter: 19 },
      global: { plugins: [i18n], stubs: { Select: selectStub, EmptyState: true } } })
    await flushPromises()
    let selects = wrapper.findAllComponents({ name: 'Select' })
    expect(selects[2].props('modelValue')).toBe(20)
    expect(selects[2].props('options')).toEqual([10, 20, 50, 100].map(count => ({ value: count, label: i18n.global.t('runtimeUi.topCount', { count }) })))
    for (const count of [10, 20, 50, 100]) {
      selects[2].vm.$emit('update:modelValue', count)
      await flushPromises()
      expect(fixtures.stats).toHaveBeenLastCalledWith({ time_range: '30d', platform: 'openai', group_id: 19, top_n: count })
    }
    selects[1].vm.$emit('update:modelValue', 'pagination')
    await flushPromises()
    selects = wrapper.findAllComponents({ name: 'Select' })
    expect(selects[2].props('options')).toEqual([10, 20, 50, 100].map(value => ({ value, label: String(value) })))
    selects[2].vm.$emit('update:modelValue', 50)
    await flushPromises()
    expect(fixtures.stats).toHaveBeenLastCalledWith({ time_range: '30d', platform: 'openai', group_id: 19, page: 1, page_size: 50 })
    wrapper.unmount()
  })

  it.each(locales)('renders the actual admin recent-usage heading with the unchanged 12-row limit (%s)', async locale => {
    const i18n = plugin(locale)
    const nodes = actualElements('views/admin/DashboardView.vue', node => node.tag === 'h3' && node.children.some(child =>
      child.type === NodeTypes.INTERPOLATION && child.content.type === NodeTypes.SIMPLE_EXPRESSION && child.content.content.includes('admin.dashboard.recentUsage')))
    expect(nodes).toHaveLength(1)
    const wrapper = renderActual(nodes, { t: i18n.global.t })
    expect(wrapper.text()).toBe(`${i18n.global.t('admin.dashboard.recentUsage')} (${i18n.global.t('runtimeUi.topCount', { count: 12 })})`)
    const getUserUsageTrend = vi.fn().mockResolvedValue({ trend: [] })
    const userTrendMetric = ref('tokens')
    const load = actualHandler('views/admin/DashboardView.vue', 'loadUsersTrend', {
      usersTrendLoadSeq: 0, userTrendLoading: ref(false), userTrend: ref([]), userTrendMetric,
      startDate: ref('2026-10-01'), endDate: ref('2026-10-29'), granularity: ref('day'),
      adminAPI: { dashboard: { getUserUsageTrend } },
    })
    for (const metric of ['tokens', 'actual_cost']) {
      userTrendMetric.value = metric
      await load()
      expect(getUserUsageTrend).toHaveBeenLastCalledWith({ start_date: '2026-10-01', end_date: '2026-10-29', granularity: 'day', limit: 12, metric })
    }
    wrapper.unmount()
  })
})

describe('S6 actual logo and QR accessibility attributes', () => {
  const logoPaths = [
    ['views/HomeView.vue', 3], ['views/KeyUsageView.vue', 1], ['views/public/LegalDocumentView.vue', 1],
    ['components/modelPlaza/PlazaNavBar.vue', 1], ['components/layout/AppSidebar.vue', 1],
  ] as const
  for (const [path, count] of logoPaths) {
    it.each(locales)(`${path} renders localized alt and preserves custom/default src (%s)`, locale => {
      const i18n = plugin(locale)
      const nodes = actualElements(path, node => node.tag === 'img')
      expect(nodes).toHaveLength(count)
      for (const siteLogo of ['', '/operator-Custom-logo.svg']) {
        const wrapper = renderActual(nodes, { t: i18n.global.t, siteLogo, settingsLoaded: true })
        expect(wrapper.findAll('img').map(img => img.attributes('alt'))).toEqual(Array(count).fill(i18n.global.t('runtimeUi.siteLogo')))
        expect(wrapper.findAll('img').map(img => img.attributes('src'))).toEqual(Array(count).fill(siteLogo || '/logo.svg'))
        wrapper.unmount()
      }
    })
  }

  it.each(locales)('renders TOTP QR after the actual verification/setup flow (%s)', async locale => {
    const i18n = plugin(locale)
    expect(i18n.global.te('runtimeUi.totpQrCode')).toBe(true)
    const wrapper = mount(TotpSetupModal, { global: { plugins: [i18n] } })
    await flushPromises()
    expect(wrapper.find('img').exists()).toBe(false)
    await wrapper.get('input[type=password]').setValue('fixture-password')
    const next = wrapper.findAll('button').find(button => button.text() === i18n.global.t('common.next'))!
    await next.trigger('click')
    await flushPromises()
    expect(fixtures.setupTotp).toHaveBeenCalledWith({ password: 'fixture-password' })
    expect(fixtures.qr).toHaveBeenCalledWith('otpauth://totp/Fixture?secret=FIXTURE', { width: 200, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
    expect(wrapper.get('img').attributes('alt')).toBe(i18n.global.t('runtimeUi.totpQrCode'))
    expect(wrapper.get('img').attributes('src')).toBe('data:image/png;base64,Zml4dHVyZQ==')
    expect(wrapper.get('code').text()).toBe('FIXTURE-SECRET')
    wrapper.unmount()
  })

  it.each(locales)('renders the actual WeChat QR branch and preserves the payment QR bytes (%s)', async locale => {
    const i18n = plugin(locale)
    expect(i18n.global.te('runtimeUi.wechatPaymentQrCode')).toBe(true)
    const path = 'views/user/StripePaymentView.vue'
    const nodes = actualElements(path, node => node.tag === 'template' && hasBinding(node, 'if', 'wechatQrUrl'))
    expect(nodes).toHaveLength(1)
    const wechatQrUrl = ref('')
    const wrapper = renderActual(nodes, { t: i18n.global.t, wechatQrUrl })
    expect(wrapper.find('img').exists()).toBe(false)
    wechatQrUrl.value = 'data:image/png;base64,d2VjaGF0LXFy'
    await nextTick()
    expect(wrapper.get('img').attributes('alt')).toBe(i18n.global.t('runtimeUi.wechatPaymentQrCode'))
    expect(wrapper.get('img').attributes('src')).toBe(wechatQrUrl.value)
    wrapper.unmount()
  })
})

describe('S8 actual monitor interval controls', () => {
  it.each(locales)('renders localized minutes and saves 60/300 seconds without translating configured values (%s)', async locale => {
    const i18n = plugin(locale)
    const wrapper = mount(MonitorSettingsPanel, { global: { plugins: [i18n], stubs: { Select: selectStub, Toggle: true, Icon: true, RouterLink: true } } })
    await flushPromises()
    expect(fixtures.showError).not.toHaveBeenCalled()
    const buttons = wrapper.get('[role=group]').findAll('button')
    expect(buttons.map(button => button.text())).toEqual([`1 ${i18n.global.t('common.minutes')}`, `5 ${i18n.global.t('common.minutes')}`])
    const save = wrapper.get('header button')
    for (const [index, seconds] of [[1, 300], [0, 60]]) {
      await buttons[index].trigger('click')
      expect(buttons[index].classes()).toContain('tab-active')
      await save.trigger('click')
      await flushPromises()
      expect(fixtures.updateConfig.mock.lastCall?.[0]).toMatchObject({
        enabled: true, refresh_interval_seconds: seconds, group_ids: [19],
        platforms: [{ platform: 'openai', enabled: true, models: ['operator-model'] }], ignored_error_categories: [],
      })
    }
    expect(wrapper.text()).toContain('Operator group')
    expect(fixtures.showError).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('S9 real settings initializer, load handler, input and save projection', () => {
  const path = 'views/admin/SettingsView.vue'
  const fields = ['site_name', 'site_logo', 'site_subtitle', 'contact_info']
  function loadingScope(form: Record<string, string>, t: ReturnType<typeof plugin>['global']['t'], response: Record<string, unknown> | Error | null) {
    return {
      form, t, loading: ref(true), loadFailed: ref(false),
      adminAPI: { settings: { getSettings: response instanceof Error ? vi.fn().mockRejectedValue(response) : vi.fn().mockResolvedValue(response) } },
      appStore: { showError: vi.fn() }, extractApiErrorMessage: (_: unknown, fallback: string) => fallback,
      syncCaptchaProviderSelection: vi.fn(), defaultClaudeOAuthSystemPromptBlocks: '[]',
      claudeOAuthSystemPromptBlocks: ref([]), parseClaudeOAuthSystemPromptBlocks: () => [], syncClaudeOAuthSystemPromptBlocksFormField: vi.fn(),
      codexBlacklistRows: ref([]), codexWhitelistRows: ref([]), parseCodexEntriesToRows: () => [],
      codexFingerprintRows: ref([]), parseFingerprintSignalsToRows: () => [], defaultFingerprintSignalRows: () => [],
      defaultLoginAgreementDocuments: () => [], authSourceDefaults: {}, buildAuthSourceDefaultsState: () => ({}),
      normalizeRechargeBonusTiers: () => [], normalizeRechargeBonusMode: () => 'none',
      normalizePlatformQuotasMap: () => ({}), normalizeAccountSchedulingThresholdsMap: () => ({}), normalizeDefaultSubscriptionSettings: () => [],
      registrationEmailSuffixWhitelistTags: ref([]), normalizeRegistrationEmailSuffixDomains: () => [],
      normalizeForwardedClientIpHeaders: () => [], forwardedClientIpHeaderDraft: ref(''), tablePageSizeOptionsInput: ref(''),
      formatTablePageSizeOptions: () => '10,20,50,100', registrationEmailSuffixWhitelistDraft: ref(''), smtpPasswordManuallyEdited: ref(false),
      resolveWeChatConnectModeCapabilities: () => ({ openEnabled: false, mpEnabled: false, mobileEnabled: false }),
      deriveWeChatConnectStoredMode: () => '', defaultWeChatConnectScopesForMode: () => '',
      openaiFastPolicyForm: { rules: [] }, openaiFastPolicyLoaded: ref(false), loadWebSearchConfig: vi.fn().mockResolvedValue(undefined),
    }
  }
  for (const mode of ['failure', 'partial', 'null', 'null-response', 'empty', 'custom'] as const) {
    it.each(locales)(`${mode}: localized placeholder never becomes a persisted default (%s)`, async locale => {
      const i18n = plugin(locale)
      const form = reactive(actualObjectFields(path, 'form', fields, {}))
      expect(form.site_subtitle).toBe('')
      const custom = '  Operator-owned subtitle · Do not translate  '
      const response = mode === 'failure' ? new Error('fixture load failure') : mode === 'null-response' ? null : {
        site_name: 'Operator Site Name', contact_info: 'Owner+Custom@example.invalid',
        ...(mode === 'null' ? { site_subtitle: null } : mode === 'empty' ? { site_subtitle: '' } : mode === 'custom' ? { site_subtitle: custom } : {}),
      }
      const failed = mode === 'failure' || mode === 'null-response'
      const scope = loadingScope(form, i18n.global.t, response)
      await actualHandler(path, 'loadSettings', scope)()
      expect(scope.loading.value).toBe(false)
      expect(scope.loadFailed.value).toBe(failed)
      expect(scope.appStore.showError).toHaveBeenCalledTimes(failed ? 1 : 0)
      expect(form.site_subtitle).toBe(mode === 'custom' ? custom : '')
      const nodes = actualElements(path, node => node.tag === 'input' && hasBinding(node, 'model', 'form.site_subtitle'))
      expect(nodes).toHaveLength(1)
      const saveButtons = actualElements(path, node => node.tag === 'button' && hasBinding(node, 'bind', 'saving || loadFailed'))
      expect(saveButtons).toHaveLength(1)
      const wrapper = renderActual([...nodes, ...saveButtons], { t: i18n.global.t, form, saving: false, loadFailed: scope.loadFailed })
      expect(wrapper.get('button').element.disabled).toBe(failed)
      expect(wrapper.get('input').attributes('placeholder')).toBe(i18n.global.t('admin.settings.site.siteSubtitlePlaceholder'))
      expect(wrapper.get('input').element.value).toBe(mode === 'custom' ? custom : '')
      const payload = actualObjectFields(path, 'payload', fields, { form }, 'saveSettings')
      expect(payload.site_subtitle).toBe(mode === 'custom' ? custom : '')
      expect(payload.site_subtitle).not.toBe(i18n.global.t('admin.settings.site.siteSubtitlePlaceholder'))
      if (!failed) {
        expect(payload.site_name).toBe('Operator Site Name')
        expect(payload.contact_info).toBe('Owner+Custom@example.invalid')
      }
      await wrapper.get('input').setValue('  Explicit operator edit  ')
      expect(actualObjectFields(path, 'payload', fields, { form }, 'saveSettings').site_subtitle).toBe('  Explicit operator edit  ')
      wrapper.unmount()
    })
  }
})
