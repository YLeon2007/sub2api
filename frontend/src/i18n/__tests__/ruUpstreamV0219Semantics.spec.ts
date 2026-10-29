import { baseCompile } from '@intlify/message-compiler'
import { describe, expect, it } from 'vitest'

import en from '../locales/en'
import zh from '../locales/zh'
import ru, { ruOverrides } from '../locales/ru'

// Official v0.2.17 060d0160417782cd962a0c7f460f6cd4565d4916
//       -> v0.2.19 dece26153621959ccd7635814f4b2d08304e681a.
// The three existing leaves changed meaning/example, not just key coverage.
const modified = {
  'admin.channels.form.webSearchEmulationHint': {
    en: '⚠️ When enabled, accounts of the matching platforms in this channel will intercept web_search requests. Use with caution.',
    zh: '⚠️ 开启后该渠道下对应平台的账号将自动拦截 web_search 请求，请谨慎操作',
    ru: '⚠️ Если включено, аккаунты соответствующих платформ в этом канале будут перехватывать запросы web_search. Используйте осторожно.'
  },
  'admin.settings.gatewayForwarding.openaiCodexUserAgentPlaceholder': {
    en: 'codex_cli_rs/0.146.1 (Ubuntu 22.4.0; x86_64) WindowsTerminal',
    zh: 'codex_cli_rs/0.146.1 (Ubuntu 22.4.0; x86_64) WindowsTerminal',
    ru: 'codex_cli_rs/0.146.1 (Ubuntu 22.4.0; x86_64) WindowsTerminal'
  },
  'admin.settings.gatewayForwarding.openaiCodexUserAgentHint': {
    en: 'The full Codex User-Agent used for all outbound requests, for customizing the OS / arch / terminal fingerprint. Leave empty to build the standard codex_cli_rs identity from the version below (recommended). If set, both the leading and trailing version declarations are synchronized to the version below, so the UA never stays pinned to the release entered here — upstream identity and version risk controls may return server_is_overloaded for stale or non-official identities.',
    zh: '出站统一使用的完整 Codex User-Agent，用于自定义 OS / 架构 / 终端指纹。留空则按下方版本号拼出标准 codex_cli_rs 形态（推荐）。填写后首段和尾部的版本号仍会被下方版本号同步覆盖，避免这条 UA 停在填写时的旧版本——上游会根据客户端身份和版本进行风控分层，陈旧或非官方形态可能返回 server_is_overloaded。',
    ru: 'Полный User-Agent Codex для всех исходящих запросов; позволяет настраивать отпечаток ОС / архитектуры / терминала. Оставьте пустым, чтобы формировать стандартную идентичность codex_cli_rs на основе версии ниже (рекомендуется). Если значение задано, версии в начале и в конце всё равно синхронизируются с версией ниже, поэтому UA не остаётся привязанным к введённому здесь релизу: механизмы контроля рисков удалённого сервиса, учитывающие идентичность и версию клиента, могут возвращать server_is_overloaded для устаревших или неофициальных идентичностей.'
  }
} as const

// Read-only call-site review: AdminAccessKeysSettings.vue and
// backend/internal/pkg/adminaccess/policy.go. Conditions must match within ONE
// rule (AND), alternative rules grant access (OR); no cross-rule splicing.
// Empty types deny account operations, but do not restrict group model actions.
// Global permissions are independent, and all_groups does not imply ungrouped.
const expectedAdminAccessKeys = {
  title: 'Ключи доступа администратора',
  authorizationHint: 'Разрешайте операции в пределах области действия ресурсов. Невыбранные операции запрещены. Для доступа к аккаунту в одном правиле должны одновременно совпасть операция, группа, тип аккаунта и платформа (И); достаточно одного подходящего правила (ИЛИ). Условия разных правил не объединяются.',
  sharedAccountWarning: 'Изменения общего аккаунта затрагивают все связанные группы. Глобальные разрешения действуют независимо от областей действия групп.',
  secretWarning: 'Полный ключ показывается только один раз. Скопируйте и сохраните его перед закрытием.',
  copySecret: 'Скопировать ключ',
  dismissSecret: 'Сохранено, закрыть',
  create: 'Создать ключ с ограниченными правами',
  refresh: 'Обновить',
  loading: 'Загрузка ключей и разрешений…',
  noDescription: 'Нет описания',
  never: 'Бессрочно',
  neverUsed: 'Ещё не использовался',
  summaryLabel: 'Сводка разрешений',
  editPermissions: 'Изменить разрешения',
  disable: 'Отключить',
  enable: 'Включить',
  rotate: 'Заменить ключ',
  revoke: 'Отозвать без возможности восстановления',
  deleteRecord: 'Удалить запись',
  editTitle: 'Изменить ключ',
  createTitle: 'Создать ключ',
  name: 'Название',
  description: 'Описание',
  expiration: 'Срок действия (местное время; оставьте пустым для бессрочного ключа)',
  allowedIps: 'Разрешённые IP / CIDR (по одному в строке; пустое поле разрешает любой IP)',
  enabled: 'Включить ключ',
  allGroups: 'Все группы, включая будущие',
  groups: 'Группы (можно выбрать несколько)',
  includeUngrouped: 'Включить аккаунты без группы',
  accountTypes: 'Типы аккаунтов (только для операций с аккаунтами; если ничего не выбрано, доступ к аккаунтам запрещён)',
  platforms: 'Платформы (можно выбрать несколько; пустой список разрешает все)',
  accountOperations: 'Разрешённые операции с аккаунтами',
  groupOperations: 'Разрешённые операции с моделями группы (с учётом указанных выше ограничений по группам и платформам)',
  modelAllowlistHint: 'Список разрешённых моделей группы ограничивает модели, которые группа может использовать.',
  removeRule: 'Удалить правило',
  addRule: 'Добавить правило доступа к ресурсам',
  globalPermissions: 'Глобальные разрешения (по умолчанию все выключены)',
  processing: 'Обработка…',
  save: 'Сохранить ключ',
  cancel: 'Отмена',
  other: 'Прочее',
  allGroupsSummary: 'Все группы, включая будущие',
  noGroups: 'Нет групп',
  ungroupedSummary: ', включая аккаунты без группы',
  noAccountTypes: 'Типы аккаунтов не выбраны (доступ к аккаунтам запрещён)',
  anyPlatform: 'Любая платформа',
  operationFailed: 'Операция не выполнена. Повторите попытку.',
  nameRequired: 'Введите название ключа',
  expirationInvalid: 'Укажите корректное время окончания срока действия',
  saved: 'Ключ сохранён',
  statusUpdated: 'Статус ключа обновлён',
  rotated: 'Ключ заменён',
  revoked: 'Ключ отозван без возможности восстановления',
  removed: 'Ключ удалён из списка. История операций сохраняется.',
  copied: 'Ключ скопирован',
  copyFailed: 'Не удалось скопировать ключ. Скопируйте его вручную.',
  statusRevoked: 'Отозван',
  statusDisabled: 'Отключён',
  statusExpired: 'Срок действия истёк',
  statusEnabled: 'Включён',
  summary: 'Глобальные разрешения: {globals} · Правила доступа к ресурсам: {rules}',
  ruleLine: 'Правило {index}: {summary}',
  expires: 'Срок действия: {value}',
  lastUsed: 'Последнее использование: {value}',
  ruleLegend: 'Правило доступа к аккаунтам и группам {index}',
  groupFallback: 'Группа #{id}',
  ruleSummary: '{groups}; Типы аккаунтов: {types} (только для операций с аккаунтами); Платформы: {platforms}; Операции: {count}',
  rotateConfirm: 'Замена ключа «{name}» немедленно сделает текущий ключ недействительным. Продолжить?',
  revokeConfirm: 'Отзыв ключа «{name}» нельзя отменить. Продолжить?',
  deleteConfirm: 'Удалить запись ключа «{name}»? Она будет удалена только из списка. История операций сохраняется.',
  legacy: 'Устаревший ключ с полным доступом (рекомендуется переход на ключи с ограниченными правами)'
} as const

// GrokModelDiagnosticsPanel.vue + EvaluateGrokModelDiagnostics: only a fresh
// same-account/endpoint text catalog proves absence; stale/source-changed data
// is historical. Configured fallback enriches capabilities, not the form.
// Diagnostics use SAVED configuration and never block requests/delete mappings.
const expectedGrokModelDiagnostics = {
  title: 'Диагностика каталога моделей',
  configuredModels: 'Локальная конфигурация',
  upstreamModels: 'Каталог удалённого сервиса',
  lastSuccess: 'Последняя успешная синхронизация',
  lastAttempt: 'Последняя попытка',
  fresh: 'Актуален',
  stale: 'Исторический каталог',
  unknown: 'Неизвестно',
  sourceChanged: 'Источник изменился',
  notListed: 'Нет в текущем каталоге для этого аккаунта и эндпоинта',
  unverifiable: 'Невозможно проверить каждую модель отдельно',
  outOfScope: 'Вне области этого каталога текстовых моделей',
  compatibilityNotice: 'Запросы не блокируются',
  configuredFallback: 'Актуальный каталог удалённого сервиса не получен. Сохранённая конфигурация оставлена без изменений; ID резервных моделей не добавлены в форму.',
  savedConfigOnly: 'Диагностика отражает сохранённую конфигурацию. Сохраните изменения, затем повторите синхронизацию.',
  refreshFailed: 'Не удалось загрузить актуальный статус',
  syncSavedConfig: 'Синхронизировать каталог удалённого сервиса для сохранённой конфигурации',
  catalogTitle: 'Каталог моделей удалённого сервиса',
  syncCatalog: 'Синхронизировать каталог',
  details: 'Сведения о каталоге',
  viewDifferences: 'Показать различия',
  hideDifferences: 'Скрыть различия',
  missingSummary: 'Цели сопоставлений, отсутствующие в текущем каталоге: {count}',
  summaryNotice: 'Только для сведения. Запросы не блокируются, сопоставления остаются без изменений.',
  modelCount: 'Моделей: {count}',
  historicalModelCount: 'Моделей в историческом каталоге: {count}',
  lastSuccessRelative: 'Последняя успешная синхронизация: {time}',
  source: 'Источник каталога',
  historicalSource: 'Источник исторического каталога',
  historicalModels: 'Исторический каталог',
  savedMappings: 'Сравнение с сохранённой конфигурацией',
  currentListed: 'Найдено в текущем каталоге',
  historicalComparison: 'Историческая запись; для проверки повторите синхронизацию',
  syncFailed: 'Ошибка синхронизации',
  attemptSuccess: 'Синхронизация выполнена',
  attemptFallback: 'Сведения о возможностях дополнены на основе настроенных моделей',
  attemptUnknown: 'Статус неизвестен',
  attemptUnavailable: 'Синхронизация не выполнена. Повторите попытку позже.',
  previousCatalogValid: 'Последний успешно полученный каталог всё ещё действителен.',
  staleNotice: 'Срок действия каталога истёк. Повторите синхронизацию перед сравнением сопоставлений.',
  changedNotice: 'Источник изменился. Повторите синхронизацию.',
  unknownNotice: 'Нет достоверного каталога для сравнения сопоставлений.',
  fallbackNotice: 'Актуальный каталог не получен; настроенные модели использованы только для дополнения сведений о возможностях.',
  savedConfigHint: 'Диагностика использует сохранённую конфигурацию. Сохраните изменения, затем повторите синхронизацию.',
  requestColumn: 'Запрошенная модель',
  targetColumn: 'Целевая модель для пересылки',
  mappingFromAria: 'Запрошенная модель {index}',
  mappingTargetAria: 'Целевая модель для пересылки {index}',
  removeMappingAria: 'Удалить сопоставление {index}',
  errorConfiguration: 'Конфигурация удалённого сервиса недоступна',
  errorHTTP: 'Запрос к удалённому сервису завершился ошибкой',
  errorTransport: 'Не удалось подключиться к удалённому сервису',
  errorInvalidResponse: 'Не удалось разобрать полученный каталог',
  errorEmptyCatalog: 'Не получен пригодный для использования каталог моделей',
  errorTooLarge: 'Каталог превышает ограничение на объём чтения',
  errorPersistence: 'Не удалось сохранить каталог'
} as const

// GroupsView.vue binds this checkbox to image_count_billing on create AND edit,
// independently of image_rate_independent and its price multiplier.
const added: Record<string, string> = {
  ...Object.fromEntries(Object.entries(expectedAdminAccessKeys).map(([key, value]) => [`adminAccessKeys.${key}`, value])),
  ...Object.fromEntries(Object.entries(expectedGrokModelDiagnostics).map(([key, value]) => [`admin.accounts.grokModelDiagnostics.${key}`, value])),
  'admin.groups.imagePricing.perImageBilling': 'Тарифицировать каждое сгенерированное изображение'
}

function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[key]
  }, value)
}

function placeholders(message: string): string[] {
  const result = baseCompile(message)
  const found = new Set<string>()
  function visit(node: unknown): void {
    if (!node || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    if (record.type === 4 && typeof record.key === 'string') found.add(`named:${record.key}`)
    if (record.type === 5 && typeof record.index === 'number') found.add(`list:${record.index}`)
    for (const child of Object.values(record)) {
      if (Array.isArray(child)) child.forEach(visit)
      else if (child && typeof child === 'object') visit(child)
    }
  }
  visit(result.ast)
  return [...found].sort()
}

function expectMessages(path: string, values: { en: string; zh: string; ru: string }): void {
  for (const [locale, messages] of Object.entries({ en, zh, ru: ruOverrides })) {
    const actual = readPath(messages, path)
    expect(actual, `${locale} ${path}`).toBe(values[locale as keyof typeof values])
    expect(placeholders(String(actual)), `${locale} placeholders ${path}`).toEqual(placeholders(values.en))
  }
}

describe('Russian v0.2.17 -> v0.2.19 upstream locale semantics', () => {
  it('exports the explicit Russian tree without source-language fallback', () => {
    expect(ru).toBe(ruOverrides)
  })

  it.each(Object.entries(modified))('updates the exact existing source and Russian leaf %s', (path, values) => {
    expectMessages(path, values)
  })

  it('covers exactly the 71 access-key, 56 Grok diagnostic, and one image-billing additions in EN/ZH', () => {
    expect(Object.keys(expectedAdminAccessKeys)).toHaveLength(71)
    expect(Object.keys(expectedGrokModelDiagnostics)).toHaveLength(56)
    expect(Object.keys(added)).toHaveLength(128)
    for (const locale of [en, zh]) {
      expect(Object.keys(readPath(locale, 'adminAccessKeys') as object).sort()).toEqual(Object.keys(expectedAdminAccessKeys).sort())
      expect(Object.keys(readPath(locale, 'admin.accounts.grokModelDiagnostics') as object).sort()).toEqual(Object.keys(expectedGrokModelDiagnostics).sort())
    }
    expect(en.admin.groups.imagePricing.perImageBilling).toBe('Bill per generated image')
    expect(zh.admin.groups.imagePricing.perImageBilling).toBe('按张计费')
  })

  it.each(Object.entries(added))('pins the explicit Russian semantics and EN/ZH placeholder parity of %s', (path, expected) => {
    const actual = readPath(ruOverrides, path)
    expect(actual, `RU ${path}`).toBe(expected)
    expect(actual, `untranslated UI prose ${path}`).toMatch(/[А-Яа-яЁё]/)
    for (const [locale, messages] of Object.entries({ en, zh, ru: ruOverrides })) {
      const message = readPath(messages, path)
      expect(typeof message, `${locale} ${path}`).toBe('string')
      expect(placeholders(String(message)), `${locale} placeholders ${path}`).toEqual(placeholders(expected))
    }
  })

  it('keeps the full explicit resource-scope and diagnostics subtrees, not a partial fallback', () => {
    expect(readPath(ruOverrides, 'adminAccessKeys')).toEqual(expectedAdminAccessKeys)
    expect(readPath(ruOverrides, 'admin.accounts.grokModelDiagnostics')).toEqual(expectedGrokModelDiagnostics)
  })
})
