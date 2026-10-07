import { describe, expect, it } from 'vitest'

import en from '../locales/en'
import ru from '../locales/ru'

describe('Russian inherited prose localization', () => {
  it.each([
    ['SigV4 mode', ru.admin.accounts.bedrockAuthModeSigv4, en.admin.accounts.bedrockAuthModeSigv4, 'Подпись SigV4'],
    ['AWS region examples', ru.admin.accounts.bedrockRegionHint, en.admin.accounts.bedrockRegionHint, 'например, us-east-1, us-west-2, eu-west-1'],
    ['TLS key share groups', ru.admin.tlsFingerprintProfiles.form.keyShareGroups, en.admin.tlsFingerprintProfiles.form.keyShareGroups, 'Группы обмена ключами'],
    ['ALPN protocols', ru.admin.tlsFingerprintProfiles.form.alpnProtocols, en.admin.tlsFingerprintProfiles.form.alpnProtocols, 'Протоколы ALPN'],
    ['scheduler default', ru.admin.settings.openaiExperimentalScheduler.defaultPlaceholder, en.admin.settings.openaiExperimentalScheduler.defaultPlaceholder, 'Из конфигурации / по умолчанию: {value}']
  ])('RU-ACTIVE-SOURCE-EQUAL localizes %s while preserving technical values', (_label, actual, source, expected) => {
    expect(actual).toBe(expected)
    expect(actual).not.toBe(source)
    expect(Array.from(actual.matchAll(/\{([a-zA-Z0-9_]+)\}/g), match => match[1])).toEqual(
      Array.from(source.matchAll(/\{([a-zA-Z0-9_]+)\}/g), match => match[1])
    )
  })

  it('RU-ACTIVE-MIXED-PROSE explains peak token billing in Russian, including image tokens and zero', () => {
    expect(ru.admin.groups.peakRate.multiplierHint).toBe(
      'Применяется к множителю тарификации по токенам; токены изображений при тарификации по токенам тоже учитываются. 0 означает тарификацию пиковых запросов по токенам с коэффициентом 0x.'
    )
    expect(ru.admin.groups.peakRate.multiplierHint).not.toMatch(/token|billing|image/)
  })

  it('RU-ACTIVE-MIXED-PROSE translates batch proxy status display names without renaming placeholders', () => {
    const message = ru.admin.proxies.batchQualityDone
    expect(message).toBe(
      'Массовая проверка качества завершена для прокси: {count}; исправны {healthy}, предупреждения {warn}, проверка доступа {challenge}, неполадки {failed}'
    )
    expect(Array.from(message.matchAll(/\{([a-zA-Z0-9_]+)\}/g), match => match[1])).toEqual(
      Array.from(en.admin.proxies.batchQualityDone.matchAll(/\{([a-zA-Z0-9_]+)\}/g), match => match[1])
    )
    expect(message.replace(/\{[a-zA-Z0-9_]+\}/g, '')).not.toMatch(/healthy|warn|challenge|abnormal/)
  })

  it('RU-ACTIVE-MIXED-PROSE defines TTFT for streaming responses in Russian', () => {
    expect(ru.admin.ops.tooltips.ttft).toBe(
      'Время до первого токена (TTFT), измеряет скорость возврата первого токена в потоковых ответах.'
    )
    expect(ru.admin.ops.tooltips.ttft).not.toMatch(/Time To First Token|streaming/)
  })

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
