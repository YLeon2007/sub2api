import { describe, expect, it } from 'vitest'
import ru from '../locales/ru'
import en from '../locales/en'
import expected from './ruUpstreamV0221Expected.json'
const leaf = (locale: unknown, key: string): unknown => key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], locale)
describe('v0.2.21 Russian semantic delta', () => {
  it('covers all 11 added and the modified upstream English leaf with exact Russian copy', () => {
    expect(Object.keys(expected)).toHaveLength(12)
    for (const [key, value] of Object.entries(expected)) {
      expect(leaf(en, key), key).toBeTypeOf('string')
      expect(leaf(ru, key), key).toBe(value)
    }
  })
})
