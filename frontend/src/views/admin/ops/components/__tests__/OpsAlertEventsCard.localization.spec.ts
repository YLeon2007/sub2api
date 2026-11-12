import { createPinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OpsAlertEventsCard from '../OpsAlertEventsCard.vue'

const localeState = vi.hoisted(() => ({
  value: 'ru' as 'en' | 'ru' | 'zh',
  ref: null as null | { value: 'en' | 'ru' | 'zh' }
}))
const api = vi.hoisted(() => ({
  listAlertEvents: vi.fn(),
  getAlertEvent: vi.fn(),
  createAlertSilence: vi.fn(),
  updateAlertEventStatus: vi.fn()
}))
const viewportState = vi.hoisted(() => ({
  desktop: false,
  ref: null as null | { value: boolean }
}))

vi.mock('@vueuse/core', async () => {
  const actual = await vi.importActual<typeof import('@vueuse/core')>('@vueuse/core')
  const { ref } = await import('vue')
  const viewport = ref(viewportState.desktop)
  viewportState.ref = viewport
  return { ...actual, useMediaQuery: () => viewport }
})

vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  const [{ default: en }, { default: ru }, { default: zh }, { ref }] = await Promise.all([
    import('@/i18n/locales/en'),
    import('@/i18n/locales/ru'),
    import('@/i18n/locales/zh'),
    import('vue')
  ])
  const messages = { en, ru, zh } as const
  const locale = ref(localeState.value)
  localeState.ref = locale

  return {
    ...actual,
    useI18n: () => ({
      locale,
      t: (key: string, params: Record<string, string | number> = {}) => {
        const value = key.split('.').reduce<unknown>((node, part) => {
          return node && typeof node === 'object'
            ? (node as Record<string, unknown>)[part]
            : undefined
        }, messages[locale.value])
        if (typeof value !== 'string') return key
        return value.replace(/\{(\w+)\}/g, (_, token: string) => String(params[token] ?? `{${token}}`))
      }
    })
  }
})

vi.mock('@/api/admin/ops', () => ({
  opsAPI: {
    listAlertEvents: api.listAlertEvents,
    getAlertEvent: api.getAlertEvent,
    createAlertSilence: api.createAlertSilence,
    updateAlertEventStatus: api.updateAlertEventStatus
  }
}))

const seededEvent = {
  id: 101,
  rule_id: 47,
  severity: 'P1',
  status: 'firing',
  title: 'P1: 错误率过高',
  description: 'error_rate > 5.00 (current 12.34) over last 5m (platform=openai group_id=42)',
  metric_value: 12.34,
  threshold_value: 5,
  dimensions: { platform: 'openai', group_id: 42 },
  fired_at: '2026-09-08T10:00:00Z',
  resolved_at: null,
  email_sent: true,
  created_at: '2026-09-08T10:00:00Z'
} as const

const customEvent = {
  ...seededEvent,
  id: 102,
  rule_id: 99,
  title: 'P1: Клиентское правило',
  description: 'custom description',
  dimensions: { platform: 'custom', group_id: 7 }
} as const

function mountCard(locale: 'en' | 'ru' | 'zh' = 'ru') {
  localeState.ref!.value = locale
  return mount(OpsAlertEventsCard, {
    global: {
      plugins: [createPinia()],
      stubs: {
        BaseDialog: {
          props: ['show', 'title'],
          template: '<section v-if="show" data-testid="detail-dialog"><h2>{{ title }}</h2><slot /></section>'
        },
        Icon: true,
        Select: true
      }
    }
  })
}

describe('OpsAlertEventsCard stored-event localization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    viewportState.ref!.value = false
    api.listAlertEvents.mockResolvedValue([
      structuredClone(seededEvent),
      structuredClone(customEvent)
    ])
  })

  it('localizes exact seeded event text while preserving machine data and custom text', async () => {
    const wrapper = mountCard('ru')
    await flushPromises()

    expect(wrapper.text()).toContain('P1: Высокая доля ошибок')
    expect(wrapper.text()).toContain(
      'error_rate > 5.00 (текущее значение 12.34) за последние 5 мин (platform=openai group_id=42)'
    )
    expect(wrapper.text()).not.toContain('P1: 错误率过高')
    expect(wrapper.text()).toContain('P1: Клиентское правило')
    expect(wrapper.text()).toContain('custom description')
    expect(wrapper.text()).toContain('platform=openai group_id=42')
  })

  it('localizes exact seeded event text in the desktop table and title attribute', async () => {
    viewportState.ref!.value = true
    const wrapper = mountCard('ru')
    await flushPromises()

    const rows = wrapper.findAll('tbody tr')
    expect(rows[0].text()).toContain('P1: Высокая доля ошибок')
    expect(rows[0].text()).toContain(
      'error_rate > 5.00 (текущее значение 12.34) за последние 5 мин (platform=openai group_id=42)'
    )
    expect(rows[0].attributes('title')).toBe('P1: Высокая доля ошибок')
    expect(rows[1].text()).toContain('P1: Клиентское правило')
    expect(rows[1].text()).toContain('custom description')
  })

  it('localizes exact seeded event text in the detail dialog', async () => {
    api.getAlertEvent.mockResolvedValue(structuredClone(seededEvent))
    const wrapper = mountCard('ru')
    await flushPromises()

    const eventRow = wrapper.findAll('div.cursor-pointer')[0]
    expect(eventRow).toBeDefined()
    await eventRow.trigger('click')
    await flushPromises()

    const detail = wrapper.get('[data-testid="detail-dialog"]')
    expect(detail.text()).toContain('P1: Высокая доля ошибок')
    expect(detail.text()).toContain(
      'error_rate > 5.00 (текущее значение 12.34) за последние 5 мин (platform=openai group_id=42)'
    )
    expect(detail.text()).not.toContain('错误率过高')
  })
})
