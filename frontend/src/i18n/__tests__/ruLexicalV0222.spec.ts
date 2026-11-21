import { describe, expect, it } from 'vitest'
import ru from '../locales/ru'
import expected from './ruLexicalV0222Expected.json'
const leaf = (key: string): unknown => key.split('.').reduce<unknown>((v, p) => (v as Record<string, unknown>)[p], ru)
describe('small current Russian source-equal prose closure', () => {
  it('translates active generic labels and quota qualifiers, not machine values', () => {
    for (const [key, value] of Object.entries(expected)) expect(leaf(key), key).toBe(value)
    expect(ru.admin.accounts.gemini.quotaPolicy.rows.cli.limitsFree).toContain('RPD ~1000; RPM ~60')
    expect(ru.admin.accounts.gemini.quotaPolicy.rows.gcloud.limits).toContain('RPD ~1000; RPM ~60')
    expect(ru.admin.accounts.gemini.quotaPolicy.rows.aiStudio.channel).toContain('OAuth')
    expect(ru.admin.accounts.bedrockDesc).toContain('SigV4')
  })
})
