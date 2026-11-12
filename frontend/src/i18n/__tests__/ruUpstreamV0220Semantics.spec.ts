import { describe, expect, it } from 'vitest'
import ru from '../locales/ru'
import expected from './ruUpstreamV0220Expected.json'
const leaf = (key: string): unknown => key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], ru)
describe('v0.2.20 Russian semantic delta', () => {
  it('covers every added and modified upstream English leaf with exact Russian copy', () => {
    expect(Object.keys(expected)).toHaveLength(238)
    for (const [key, value] of Object.entries(expected)) expect(leaf(key), key).toBe(value)
  })
})
