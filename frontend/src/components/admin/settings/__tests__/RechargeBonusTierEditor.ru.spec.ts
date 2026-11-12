import { afterEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import RechargeBonusTierEditor from '../RechargeBonusTierEditor.vue'
import ru from '@/i18n/locales/ru'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const value = key.split('.').reduce<unknown>((node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined, ru)
      if (typeof value !== 'string') return key
      return value.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? `{${name}}`))
    },
  }),
}))
enableAutoUnmount(afterEach)

describe('Russian recharge tier editor', () => {
  it('renders the discount percent unit in Russian and preserves numeric tier data', () => {
    const tiers = [{ min_amount: 100, bonus_percent: 30 }]
    const wrapper = mount(RechargeBonusTierEditor, { props: { modelValue: tiers, mode: 'discount' } })
    expect(wrapper.text()).not.toContain('OFF')
    expect(wrapper.text()).toContain('% скидки')
    expect((wrapper.get('[data-testid="recharge-bonus-tier-percent-input"]').element as HTMLInputElement).value).toBe('30')
    expect(wrapper.props('modelValue')).toEqual(tiers)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('keeps untranslated machine mode values when changing the localized mode control', async () => {
    const wrapper = mount(RechargeBonusTierEditor, { props: { modelValue: [], mode: 'discount' } })
    await wrapper.get('[data-testid="recharge-bonus-mode-bonus"]').trigger('click')
    expect(wrapper.emitted('update:mode')).toEqual([['bonus']])
  })
})
