import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import OpsDashboardHeader from '../OpsDashboardHeader.vue'

const localeRef = vi.hoisted(() => ({ value: 'ru' }))
const { getAllGroups, getRealtimeTrafficSummary } = vi.hoisted(() => ({
  getAllGroups: vi.fn(),
  getRealtimeTrafficSummary: vi.fn(),
}))

const translations: Record<string, string> = {
  'admin.ops.title': 'Операционный мониторинг',
  'admin.ops.loadingText': 'Загрузка',
  'admin.ops.ready': 'Готово',
  'admin.ops.autoRefreshRemaining': 'До обновления: {seconds} с',
  'admin.ops.timeRange.5m': '5 минут',
  'admin.ops.timeRange.30m': '30 минут',
  'admin.ops.timeRange.1h': '1 час',
  'admin.ops.timeRange.6h': '6 часов',
  'admin.ops.timeRange.24h': '24 часа',
  'admin.ops.timeRange.custom': 'Свой период',
  'admin.ops.queryMode.auto': 'Авто',
  'admin.ops.queryMode.raw': 'Raw',
  'admin.ops.queryMode.preagg': 'Pre-agg',
  'admin.ops.alertRules.title': 'Правила оповещений',
  'admin.ops.alertRules.manage': 'Правила',
  'admin.ops.settings.title': 'Настройки мониторинга',
  'admin.ops.fullscreen.enter': 'На весь экран',
  'common.all': 'Все',
  'common.refresh': 'Обновить',
  'common.settings': 'Настройки',
  'common.unknown': 'Неизвестно',
}

vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string, params?: Record<string, string | number>) =>
        (translations[key] ?? key).replace(/\{(\w+)\}/g, (_, token) => String(params?.[token] ?? `{${token}}`)),
      locale: localeRef,
    }),
  }
})

vi.mock('@/api', () => ({
  adminAPI: {
    groups: {
      getAll: getAllGroups,
    },
  },
}))

vi.mock('@/api/admin/ops', () => ({
  opsAPI: {
    getRealtimeTrafficSummary,
  },
}))

vi.mock('@/stores', () => ({
  useAdminSettingsStore: () => ({
    opsRealtimeMonitoringEnabled: false,
    setOpsRealtimeMonitoringEnabledLocal: vi.fn(),
  }),
}))

describe('OpsDashboardHeader localized dates', () => {
  beforeEach(() => {
    localeRef.value = 'ru'
    getAllGroups.mockReset()
    getRealtimeTrafficSummary.mockReset()
    getAllGroups.mockResolvedValue([])
    getRealtimeTrafficSummary.mockResolvedValue({ summary: null })
  })

  it('formats last updated with the active locale instead of hardcoded zh-CN', async () => {
    const lastUpdated = new Date(2026, 4, 19, 15, 4, 5)
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }
    const expectedRussianDate = lastUpdated.toLocaleString('ru', options).replace(/\//g, '-')
    const hardcodedChineseDate = lastUpdated.toLocaleString('zh-CN', options).replace(/\//g, '-')

    const wrapper = mount(OpsDashboardHeader, {
      props: {
        overview: null,
        platform: '',
        groupId: null,
        timeRange: '1h',
        queryMode: 'auto',
        loading: false,
        lastUpdated,
        thresholds: null,
        autoRefreshEnabled: false,
        autoRefreshCountdown: 30,
        fullscreen: false,
        customStartTime: null,
        customEndTime: null,
      },
      global: {
        stubs: {
          Select: true,
          HelpTooltip: true,
          BaseDialog: true,
          Icon: true,
        },
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain(`${translations['common.refresh']}: ${expectedRussianDate}`)
    expect(wrapper.text()).not.toContain(hardcodedChineseDate)

    wrapper.unmount()
  })
})
