import { createPinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import OpsAlertRulesCard from '../OpsAlertRulesCard.vue'

const localeState = vi.hoisted(() => ({
  value: 'ru' as 'en' | 'ru' | 'zh',
  ref: null as null | { value: 'en' | 'ru' | 'zh' }
}))
const api = vi.hoisted(() => ({
  listAlertRules: vi.fn(),
  updateAlertRule: vi.fn(),
  createAlertRule: vi.fn(),
  deleteAlertRule: vi.fn(),
  getAllGroups: vi.fn()
}))

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

vi.mock('@/api', () => ({
  adminAPI: { groups: { getAll: api.getAllGroups } }
}))

vi.mock('@/api/admin/ops', () => ({
  opsAPI: {
    listAlertRules: api.listAlertRules,
    updateAlertRule: api.updateAlertRule,
    createAlertRule: api.createAlertRule,
    deleteAlertRule: api.deleteAlertRule
  }
}))

const seededRule = {
  id: 47,
  name: '错误率过高',
  description: '当错误率超过 5% 且持续 5 分钟时触发告警',
  enabled: true,
  metric_type: 'error_rate',
  operator: '>',
  threshold: 5,
  window_minutes: 5,
  sustained_minutes: 5,
  severity: 'P1',
  cooldown_minutes: 20,
  notify_email: true,
  updated_at: '2026-09-08T10:00:00Z'
} as const

const BaseDialogStub = {
  props: ['show', 'title'],
  template: '<section v-if="show" data-testid="dialog"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>'
}

function mountCard(locale: 'en' | 'ru' | 'zh' = 'ru') {
  localeState.ref!.value = locale
  const wrapper = mount(OpsAlertRulesCard, {
    global: {
      plugins: [createPinia()],
      stubs: {
        BaseDialog: BaseDialogStub,
        ConfirmDialog: true,
        Select: true
      }
    }
  })
  return { wrapper, locale: localeState.ref! }
}

describe('OpsAlertRulesCard seeded-rule localization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.listAlertRules.mockResolvedValue([structuredClone(seededRule)])
    api.getAllGroups.mockResolvedValue([])
    api.updateAlertRule.mockResolvedValue(undefined)
  })

  it('shows localized rule/editor text but sends original persisted text when only a threshold is edited', async () => {
    const { wrapper } = mountCard('ru')
    await flushPromises()

    expect(wrapper.text()).toContain('Высокая доля ошибок')
    expect(wrapper.text()).toContain('Срабатывает, когда доля ошибок превышает 5% в течение 5 минут.')
    expect(wrapper.text()).not.toContain('错误率过高')
    expect(wrapper.text()).not.toContain('当错误率超过')
    expect(api.updateAlertRule).not.toHaveBeenCalled()
    expect(api.createAlertRule).not.toHaveBeenCalled()

    const editButton = wrapper.findAll('button').find((button) => button.text() === 'Изменить')
    expect(editButton).toBeDefined()
    await editButton!.trigger('click')

    const textInputs = wrapper.findAll('input[type="text"]')
    expect((textInputs[0].element as HTMLInputElement).value).toBe('Высокая доля ошибок')
    expect((textInputs[1].element as HTMLInputElement).value).toBe('Срабатывает, когда доля ошибок превышает 5% в течение 5 минут.')

    const numberInputs = wrapper.findAll('input[type="number"]')
    await numberInputs[0].setValue('6')
    const saveButton = wrapper.findAll('button').find((button) => button.text() === 'Сохранить')
    expect(saveButton).toBeDefined()
    await saveButton!.trigger('click')
    await flushPromises()

    expect(api.updateAlertRule).toHaveBeenCalledTimes(1)
    expect(api.updateAlertRule).toHaveBeenCalledWith(
      seededRule.id,
      expect.objectContaining({
        name: seededRule.name,
        description: seededRule.description,
        threshold: 6
      })
    )
  })

  it('keeps the canonical description localized after the operator edits only the name', async () => {
    const { wrapper } = mountCard('ru')
    await flushPromises()

    const editButton = wrapper.findAll('button').find((button) => button.text() === 'Изменить')
    await editButton!.trigger('click')

    const textInputs = wrapper.findAll('input[type="text"]')
    await textInputs[0].setValue('Пользовательское имя')
    expect((textInputs[1].element as HTMLInputElement).value).toBe(
      'Срабатывает, когда доля ошибок превышает 5% в течение 5 минут.'
    )

    const saveButton = wrapper.findAll('button').find((button) => button.text() === 'Сохранить')
    await saveButton!.trigger('click')
    await flushPromises()

    expect(api.updateAlertRule).toHaveBeenCalledWith(
      seededRule.id,
      expect.objectContaining({
        name: 'Пользовательское имя',
        description: seededRule.description
      })
    )
  })

  it('saves the canonical raw name when the operator edits only the description', async () => {
    const { wrapper } = mountCard('ru')
    await flushPromises()

    const editButton = wrapper.findAll('button').find((button) => button.text() === 'Изменить')
    await editButton!.trigger('click')

    const textInputs = wrapper.findAll('input[type="text"]')
    await textInputs[1].setValue('Пользовательское описание')

    const saveButton = wrapper.findAll('button').find((button) => button.text() === 'Сохранить')
    await saveButton!.trigger('click')
    await flushPromises()

    expect(api.updateAlertRule).toHaveBeenCalledWith(
      seededRule.id,
      expect.objectContaining({
        name: seededRule.name,
        description: 'Пользовательское описание'
      })
    )
  })
})
