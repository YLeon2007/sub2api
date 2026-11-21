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
  'admin.settings.upstreamBillingProbe.enabledHint': 'Когда включено, проверки по расписанию выполняются только для аккаунтов, у которых также включена автоматическая проверка. Отключение останавливает все проверки по расписанию; ручные проверки остаются доступны.',
  'admin.settings.ollamaCloudUsage.intervalHint': 'Диапазон: 15–1440 минут. Если непрерывные запросы постоянно откладывают обновление, по истечении этого времени оно выполняется принудительно.',
  "admin.accounts.upstreamBilling.trustWarning": "Этот тариф объявлен вышестоящим сервисом для текущего API-ключа. Sub2API не может проверить, совпадает ли он с фактическими списаниями. Сервис или промежуточный прокси могут вернуть поддельные, устаревшие или изменённые данные. Сверяйте их со счетами, изменениями баланса и фактическим использованием.",
  "admin.settings.security.stepUpHint": "Когда включено, чувствительные операции (экспорт аккаунтов и прокси, создание и скачивание резервных копий, изменение настроек S3, назначение администраторов) требуют недавней проверки TOTP, действительной 15 минут. Перед включением настройте 2FA для собственного аккаунта в профиле; отключение этого переключателя также требует повторной проверки.",
  "admin.settings.security.stepUpEnableRequiresTotp": "Перед включением повторной проверки включите 2FA (TOTP) для собственного аккаунта в профиле.",
  "admin.channels.form.codexImageGenerationBridgeHint": "Если включено, текстовым запросам Codex /responses в группах OpenAI автоматически добавляется размещённый на стороне сервиса инструмент image_generation, но только вне Responses Lite. Мост не добавляет инструменты для Responses Lite; обработка локального image_gen зависит от клиента и политики аккаунта. Не включайте, если маршрутизируемые аккаунты не поддерживают генерацию изображений.",
  "admin.accounts.bulkEdit.baseUrlNotice": "Применяется к аккаунтам API Key и адресу пересылки запросов аккаунтов Grok OAuth; оставьте пустым, чтобы сохранить текущее значение.",
  "admin.accounts.grokCustomBaseUrl.hint": "Когда включено, трафик аккаунта (чат, медиа и проверки) пересылается по указанному адресу. Авторизация OAuth и обновление токенов не затрагиваются и по-прежнему используют официальные эндпоинты.",
  "admin.settings.security.auditRetentionHint": "Записи аудита старше указанного срока автоматически удаляются. Значение 0 означает бессрочное хранение с возможностью только ручной очистки. Пустое значение использует срок по умолчанию — 180 дней.",
  'admin.accounts.cnProviders.apiProtocol.anthropicDesc': 'Передача без преобразования в родной эндпоинт Anthropic провайдера — оптимально для Claude Code.',
  'admin.accounts.cnProviders.apiProtocol.responsesDesc': 'Родной эндпоинт Responses провайдера — оптимально для Codex.',
  'admin.settings.openaiExperimentalScheduler.title': 'Экспериментальная политика планировщика OpenAI',
  'admin.settings.openaiExperimentalScheduler.description': 'По умолчанию отключено. Когда включено, меняет только экспериментальную политику выбора аккаунта шлюза для трафика OpenAI; это не означает наличие такой возможности у удалённого сервиса OpenAI.',
  'admin.settings.openaiExperimentalScheduler.lowRatePriorityDescription': "Когда включено, предпочтение отдаётся аккаунтам с меньшим тарифом. При равных тарифах учитываются приоритет аккаунта, текущая нагрузка и другие факторы планирования. При включённом экспериментальном планировщике этот переключатель не действует.",
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

  it('retains trust, enablement, exclusions and routing scope, independently of gold fixtures', () => {
    const trust = ru.admin.accounts.upstreamBilling.trustWarning
    for (const clause of ['не может проверить', 'поддельные', 'устаревшие', 'изменённые', 'счетами', 'баланса', 'использованием']) expect(trust).toContain(clause)
    expect(en.admin.accounts.upstreamBilling.trustWarning).toContain('cannot verify')
    const security = ru.admin.settings.security
    expect(security.stepUpEnableRequiresTotp).toContain('собственного аккаунта в профиле')
    for (const clause of ['15 минут', 'Перед включением настройте 2FA', 'отключение этого переключателя также']) expect(security.stepUpHint).toContain(clause)
    expect(security.auditRetentionHint).toContain('0 означает бессрочное')
    expect(security.auditRetentionHint).toContain('180 дней')
    const bridge = ru.admin.channels.form.codexImageGenerationBridgeHint
    expect(bridge).toContain('не добавляет инструменты для Responses Lite')
    expect(bridge).toContain('локального image_gen зависит от клиента и политики аккаунта')
    expect(ru.admin.accounts.bulkEdit.baseUrlNotice).toContain('API Key и адресу пересылки запросов аккаунтов Grok OAuth')
    expect(ru.admin.accounts.grokCustomBaseUrl.hint).toContain('Авторизация OAuth и обновление токенов не затрагиваются')
    expect(ru.admin.settings.openaiExperimentalScheduler.lowRatePriorityDescription).toContain('При включённом экспериментальном планировщике этот переключатель не действует')
  })

  it('keeps the subscription currency label explicitly display-only, not billing currency', () => {
    expect(en.payment.admin.currency).toBe('Currency Label')
    expect(en.payment.admin.currencyHint).toContain('does not affect billing')
    expect(ru.payment.admin.currency).toBe('Обозначение валюты')
    expect(ru.payment.admin.currencyHint).toContain('только для отображения')
    expect(ru.payment.admin.currencyHint.toLowerCase()).toContain('не влияет на списание')
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
