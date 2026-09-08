import { describe, expect, it } from 'vitest'

import ru from '../locales/ru'

describe('Russian inherited prose localization', () => {
  it('localizes Gemini quota prose while preserving plan names, units, and limits', () => {
    const rows = ru.admin.accounts.gemini.quotaPolicy.rows

    expect(rows.googleOne.limitsFree).toBe('Общий пул: 1000 RPD / 60 RPM')
    expect(rows.googleOne.limitsPro).toBe('Общий пул: 1500 RPD / 120 RPM')
    expect(rows.googleOne.limitsUltra).toBe('Общий пул: 2000 RPD / 120 RPM')
    expect(rows.gcp.limitsStandard).toBe('Общий пул: 1500 RPD / 120 RPM')
    expect(rows.gcp.limitsEnterprise).toBe('Общий пул: 2000 RPD / 120 RPM')
    expect(rows.cli.limitsPremium).toBe('RPD ~1500+; RPM ~60+ (очередь с приоритетом)')
    expect(rows.aiStudio.limitsPaid).toBe(
      'RPD без ограничений; RPM 1000 (Pro) / 2000 (Flash) (для каждой модели)'
    )
  })

  it('localizes example guidance without changing literal model IDs or match keywords', () => {
    expect(ru.admin.groups.openaiMessages.claudeModelPlaceholder).toBe(
      'например, claude-sonnet-4-5-20250929'
    )
    expect(ru.admin.accounts.tempUnschedulable.keywordsPlaceholder).toBe(
      'например: overloaded, too many requests'
    )
    expect(ru.admin.accounts.oauth.gemini.projectIdPlaceholder).toBe(
      'например, my-gcp-project или cloud-ai-companion-xxxxx'
    )
    expect(ru.admin.settings.betaPolicy.modelPatternPlaceholder).toBe(
      'например, claude-opus-* или claude-opus-4-6'
    )
  })

  it('uses an actionable Russian label for bypassing the Codex engine fingerprint check', () => {
    const forwarding = ru.admin.settings.gatewayForwarding

    expect(forwarding.codexWhitelistSkipFingerprint).toBe('Не проверять fingerprint движка')
    expect(forwarding.codexWhitelistDesc).toContain('«Не проверять fingerprint движка»')
    expect(forwarding.codexWhitelistDesc).not.toContain('Skip engine fingerprint')
  })
})
