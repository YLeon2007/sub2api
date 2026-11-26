import { describe, expect, it } from 'vitest'
import ru from '../locales/ru'
import en from '../locales/en'
import zh from '../locales/zh'
import expected from './ruUpstreamV0222Expected.json'
const leaf = (locale: unknown, key: string): unknown => key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], locale)
describe('v0.2.22 Russian semantic delta', () => {
  it('retains exact Russian copy for the nine unchanged additions', () => {
    expect(Object.keys(expected)).toHaveLength(9)
    for (const [key, value] of Object.entries(expected)) {
      expect(leaf(en, key), key).toBeTypeOf('string')
      expect(leaf(zh, key), key).toBeTypeOf('string')
      expect(leaf(ru, key), key).toBe(value)
    }
  })
  it('retains passthrough selection semantics', () => {
    expect(en.admin.accounts.openai.modelRestrictionDisabledByPassthrough).toContain('account selection only')
    expect(ru.admin.accounts.openai.passthroughModelFilterDesc).toContain('не изменяют модель')
    expect(ru.admin.accounts.openai.passthroughModelFilterDesc).toContain('Пустой список разрешает все модели')
  })
})
