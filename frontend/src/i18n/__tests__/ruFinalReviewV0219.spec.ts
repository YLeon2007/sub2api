import { baseCompile } from '@intlify/message-compiler'
import { describe, expect, it } from 'vitest'

import en from '../locales/en'
import zh from '../locales/zh'
import ru from '../locales/ru'
import proseCorrections from './ruProseV0219Expected.json'

// Inherited active UI prose found by exact-commit final review. Preserve
// protocol identifiers, technical examples and acquisition/fallback semantics.
const corrections: Record<string, string> = {
  ...proseCorrections,
  'admin.accounts.cnProviders.apiProtocol.anthropicDesc': 'Передача без преобразования в родной эндпоинт Anthropic провайдера — оптимально для Claude Code.',
  'admin.accounts.cnProviders.apiProtocol.responsesDesc': 'Родной эндпоинт Responses провайдера — оптимально для Codex.',
  'admin.settings.openaiExperimentalScheduler.title': 'Экспериментальная политика планировщика OpenAI',
  'admin.settings.openaiExperimentalScheduler.description': 'По умолчанию отключено. Когда включено, меняет только экспериментальную политику выбора аккаунта шлюза для трафика OpenAI; это не означает наличие такой возможности у удалённого сервиса OpenAI.',
  'admin.settings.openaiExperimentalScheduler.lowRatePriorityDescription': 'Учитывать тариф удалённого сервиса при выборе аккаунта.',
  'admin.settings.openaiExperimentalScheduler.oauthRatePriorityDescription': 'OAuth-аккаунты используют этот опорный тариф для упорядочения «сначала низкий тариф». Оставьте пустым, чтобы использовать собственный тариф каждого аккаунта. Аккаунты с API-ключом используют действительный тариф, полученный проверкой, если он есть, иначе — тариф аккаунта.',
  'admin.settings.openaiExperimentalScheduler.oauthRateWeightedDescription': 'OAuth-аккаунты используют этот опорный тариф для оценки по тарифу биллинга. Оставьте пустым, чтобы использовать собственный тариф каждого аккаунта. Аккаунты с API-ключом используют действительный тариф, полученный проверкой, если он есть, иначе — тариф аккаунта.',
  'admin.settings.openaiExperimentalScheduler.stickyWeightedTitle': 'Взвешенная привязка к аккаунту',
  'admin.settings.openaiExperimentalScheduler.stickyWeightedDescription': 'Когда включено, расширенный планировщик учитывает привязку по previous_response_id и session_hash при расчёте оценки. Когда выключено, привязанные аккаунты сохраняют прежнее поведение прямого выбора.',
  'admin.settings.openaiExperimentalScheduler.subscriptionPriorityDescription': 'Когда включено, планировщик сначала оценивает аккаунты с подпиской ChatGPT и переходит к аккаунтам без подписки, только если не удаётся занять ни одного слота обработки запроса у аккаунтов с подпиской.',
  'admin.settings.openaiExperimentalScheduler.weightsTitle': 'Переопределения весов планировщика',
  'admin.settings.openaiExperimentalScheduler.weightsDescription': 'Пустые значения используют настройки конфигурации или переменных окружения; если в конфигурации ничего не задано, применяются встроенные значения по умолчанию. Непустые значения на странице имеют приоритет.',
  'admin.settings.openaiExperimentalScheduler.upstreamCostWeight': 'Вес тарифа удалённого сервиса',
  'admin.settings.openaiExperimentalScheduler.previousResponseWeight': 'Вес привязки previous_response',
  'admin.settings.openaiExperimentalScheduler.sessionStickyWeight': 'Вес привязки session_hash',
  'admin.tlsFingerprintProfiles.title': 'Профили отпечатков TLS',
  'admin.tlsFingerprintProfiles.description': 'Управляйте профилями отпечатков TLS для имитации характеристик рукопожатия TLS конкретного клиента',
  'admin.tlsFingerprintProfiles.createFirstProfile': 'Создайте первый профиль отпечатка TLS',
  'admin.tlsFingerprintProfiles.form.pasteYamlPlaceholder': 'Вставьте сюда YAML, полученный из TLS Fingerprint Collector...',
  'admin.tlsFingerprintProfiles.form.openCollector': 'Открыть сборщик',
  'admin.tlsFingerprintProfiles.form.enableGreaseHint': 'Вставлять значения GREASE в расширения TLS ClientHello',
  'admin.tlsFingerprintProfiles.form.cipherSuitesHint': 'Шестнадцатеричные значения через запятую, например 0x1301, 0x1302, 0xc02c',
  'admin.tlsFingerprintProfiles.form.curvesHint': 'Идентификаторы кривых через запятую',
  'admin.tlsFingerprintProfiles.form.supportedVersions': 'Поддерживаемые версии TLS'
}

function leaf(tree: unknown, path: string): string {
  const value = path.split('.').reduce<unknown>((node, key) => {
    if (!node || typeof node !== 'object') return undefined
    return (node as Record<string, unknown>)[key]
  }, tree)
  expect(typeof value, path).toBe('string')
  return String(value)
}

function placeholders(message: string): string[] {
  const names = new Set<string>()
  function visit(node: unknown): void {
    if (!node || typeof node !== 'object') return
    const value = node as Record<string, unknown>
    if (value.type === 4 && typeof value.key === 'string') names.add(`named:${value.key}`)
    if (value.type === 5 && typeof value.index === 'number') names.add(`list:${value.index}`)
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit)
      else if (child && typeof child === 'object') visit(child)
    }
  }
  visit(baseCompile(message).ast)
  return [...names].sort()
}

describe('Russian v0.2.19 final-review inherited prose closure', () => {
  it.each(Object.entries(corrections))('translates active prose at %s without changing placeholders', (path, expected) => {
    const actual = leaf(ru, path)
    expect(actual).toBe(expected)
    expect(actual).not.toMatch(/GREASE values|\bextensions\b|TLS Versions|Curve IDs|advanced scheduler|\bscore\b|subscription slot|Native passthrough|Native Responses endpoint|\bprobed\b|config\/environment|TLS fingerprint|YAML output/)
    for (const source of [en, zh]) {
      expect(placeholders(actual)).toEqual(placeholders(leaf(source, path)))
    }
  })

  it('retains protocol names, request-affinity keys and TLS wire examples', () => {
    const protocol = ru.admin.accounts.cnProviders.apiProtocol
    expect(protocol.anthropic).toBe(en.admin.accounts.cnProviders.apiProtocol.anthropic)
    expect(protocol.responses).toBe(en.admin.accounts.cnProviders.apiProtocol.responses)
    expect(protocol.anthropicDesc).toContain('Anthropic')
    expect(protocol.anthropicDesc).toContain('Claude Code')
    expect(protocol.responsesDesc).toContain('Responses')
    expect(protocol.responsesDesc).toContain('Codex')
    const scheduler = ru.admin.settings.openaiExperimentalScheduler
    expect(scheduler.stickyWeightedDescription).toContain('previous_response_id')
    expect(scheduler.stickyWeightedDescription).toContain('session_hash')
    expect(scheduler.subscriptionPriorityDescription).toContain('только если не удаётся занять')
    expect(scheduler.subscriptionPriorityDescription).toContain('у аккаунтов с подпиской')
    const form = ru.admin.tlsFingerprintProfiles.form
    expect(form.enableGreaseHint).toContain('GREASE')
    expect(form.enableGreaseHint).toContain('TLS ClientHello')
    expect(form.cipherSuitesHint).toContain('0x1301, 0x1302, 0xc02c')
    expect(form.alpnProtocolsHint).toContain('h2, http/1.1')
    expect(form.yamlParseFailed).toContain('name')
  })
})
