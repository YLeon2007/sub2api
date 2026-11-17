import { describe, expect, it } from 'vitest'
import ru from '../locales/ru'
import en from '../locales/en'
import zh from '../locales/zh'
import expected from './ruUpstreamV0222Expected.json'
const leaf = (locale: unknown, key: string): unknown => key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], locale)
describe('v0.2.22 Russian semantic delta', () => {
  it('covers all nine added and the modified upstream leaf with exact Russian copy', () => {
    expect(Object.keys(expected)).toHaveLength(10)
    for (const [key, value] of Object.entries(expected)) {
      expect(leaf(en, key), key).toBeTypeOf('string')
      expect(leaf(zh, key), key).toBeTypeOf('string')
      expect(leaf(ru, key), key).toBe(value)
    }
  })
  it('retains Ultra Fast cost, access, precedence and the exact source model names', () => {
    const hint = ru.admin.groups.openaiFast.ultrafastHint
    for (const token of ['service_tier=ultrafast', 'GPT-6 Astra', 'GPT-6.1 Sol', 'priority', 'Standard', 'шестикратной', 'Бесплатный Fast', 'доступом']) expect(hint).toContain(token)
    expect(en.admin.accounts.openai.modelRestrictionDisabledByPassthrough).toContain('account selection only')
    expect(ru.admin.accounts.openai.passthroughModelFilterDesc).toContain('не изменяют модель')
    expect(ru.admin.accounts.openai.passthroughModelFilterDesc).toContain('Пустой список разрешает все модели')
  })
})
