import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { baseCompile } from '@intlify/message-compiler'
import ts from 'typescript'

import en from '../locales/en'
import ru, { ruOverrides } from '../locales/ru'

type LeafMap = Map<string, unknown>

const NODE_NAMED = 4
const NODE_LIST = 5

function flattenLeaves(value: unknown, prefix = '', out: LeafMap = new Map()): LeafMap {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flattenLeaves(child, prefix ? `${prefix}.${key}` : key, out)
    }
    return out
  }

  if (prefix) {
    out.set(prefix, value)
  }
  return out
}

function extractPlaceholders(message: string): string[] {
  const placeholders = new Set<string>()
  const result = baseCompile(message, {
    onError: () => {
      // localesMessageCompile.spec.ts reports compile errors with the full path.
    }
  })

  function visit(node: unknown): void {
    if (!node || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    if (record.type === NODE_NAMED && typeof record.key === 'string') {
      placeholders.add(`named:${record.key}`)
    }
    if (record.type === NODE_LIST && typeof record.index === 'number') {
      placeholders.add(`list:${record.index}`)
    }
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) {
        value.forEach(visit)
      } else if (value && typeof value === 'object') {
        visit(value)
      }
    }
  }

  visit(result.ast)
  return Array.from(placeholders).sort()
}

function expectLocalizedCatchErrors(
  vueSource: string,
  expectedByFunction: Record<string, string>
): void {
  const script = vueSource.match(/<script\s+setup(?:\s+lang=["']ts["'])?[^>]*>([\s\S]*?)<\/script>/)
  expect(script, 'GroupsView.vue must expose a script setup block').not.toBeNull()
  const sourceFile = ts.createSourceFile(
    'GroupsView.ts',
    script?.[1] ?? '',
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )

  for (const [functionName, expectedKey] of Object.entries(expectedByFunction)) {
    let initializer: ts.Expression | undefined
    const findFunction = (node: ts.Node): void => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === functionName &&
        node.initializer
      ) {
        initializer = node.initializer
        return
      }
      if (!initializer) ts.forEachChild(node, findFunction)
    }
    findFunction(sourceFile)
    expect(initializer, `missing ${functionName}`).toBeDefined()

    const catches: ts.CatchClause[] = []
    const findCatches = (node: ts.Node): void => {
      if (ts.isCatchClause(node)) catches.push(node)
      ts.forEachChild(node, findCatches)
    }
    if (initializer) findCatches(initializer)
    expect(catches.length, `${functionName} must have a guarded failure path`).toBeGreaterThan(0)

    const localizedKeys: string[] = []
    for (const clause of catches) {
      const visitCatch = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'showError'
        ) {
          const message = node.arguments[0]
          expect(
            message &&
              ts.isCallExpression(message) &&
              ts.isIdentifier(message.expression) &&
              message.expression.text === 't' &&
              message.arguments.length === 1 &&
              ts.isStringLiteral(message.arguments[0]),
            `${functionName} must pass a literal i18n key to showError in catch`
          ).toBe(true)
          if (
            message &&
            ts.isCallExpression(message) &&
            message.arguments.length === 1 &&
            ts.isStringLiteral(message.arguments[0])
          ) {
            localizedKeys.push(message.arguments[0].text)
          }
        }
        ts.forEachChild(node, visitCatch)
      }
      visitCatch(clause.block)
    }
    expect(localizedKeys).toContain(expectedKey)
  }
}

describe('Russian locale key coverage', () => {
  const enLeaves = flattenLeaves(en)
  const ruLeaves = flattenLeaves(ruOverrides)

  it('uses the explicit Russian override tree as the runtime export', () => {
    expect(ru).toBe(ruOverrides)
  })

  it('explicitly translates every English leaf key without relying on English fallback', () => {
    const missing = Array.from(enLeaves.keys()).filter((key) => !ruLeaves.has(key))

    expect(missing).toEqual([])
  })

  it('does not keep stale Russian-only leaf keys absent from English', () => {
    const stale = Array.from(ruLeaves.keys()).filter((key) => !enLeaves.has(key))

    expect(stale).toEqual([])
  })

  it('keeps named and list placeholder parity with English messages', () => {
    const mismatches = Array.from(enLeaves.entries()).flatMap(([key, enValue]) => {
      const ruValue = ruLeaves.get(key)
      if (typeof enValue !== 'string' || typeof ruValue !== 'string') {
        return []
      }

      const enPlaceholders = extractPlaceholders(enValue)
      const ruPlaceholders = extractPlaceholders(ruValue)
      return JSON.stringify(enPlaceholders) === JSON.stringify(ruPlaceholders)
        ? []
        : [`${key}: en(${enPlaceholders.join(', ')}) ru(${ruPlaceholders.join(', ')})`]
    })

    expect(mismatches).toEqual([])
  })

  it('localizes active account, group, alert, and realtime UI prose', () => {
    expect(ru.admin.groups.platforms.all).toBe('Все платформы')
    expect(ru.admin.groups.compositeRoutes.endpoints.countTokens).toBe('Подсчёт токенов')
    expect(ru.admin.groups.openaiMessages.claudeModel).toBe('Модель Claude')
    expect(ru.admin.accounts.setupToken).toBe('Токен настройки')
    expect(ru.admin.accounts.types.antigravityApikey).toBe('Подключение через Base URL и API-ключ')
    expect(ru.admin.accounts.types.upstreamDesc).toBe('Подключение через Base URL и API-ключ')
    expect(ru.admin.accounts.oauthSetupToken).toBe('OAuth / токен настройки')
    expect(ru.admin.accounts.setupTokenLongLived).toBe('Токен настройки (долгоживущий)')
    expect(ru.admin.accounts.openai.responsesModeForceResponses).toBe('Принудительно Responses')
    expect(ru.admin.accounts.openai.responsesModeForceChatCompletions).toBe(
      'Принудительно Chat Completions'
    )
    expect(ru.admin.accounts.openai.compactMode).toBe('Режим Compact')
    expect(ru.admin.accounts.poolMode).toBe('Режим пула')
    expect(ru.admin.accounts.quotaControl.clientAffinity.label).toBe(
      'Маршрутизация с привязкой клиентов'
    )
    expect(ru.admin.accounts.affinitySection).toBe('Привязка клиентов')
    expect(ru.admin.accounts.affinityToggle).toBe('Включить привязку клиентов')
    expect(ru.admin.accounts.quotaControl.rpmLimit.baseRpm).toBe('Базовый RPM')
    expect(ru.admin.accounts.quotaControl.rpmLimit.stickyBuffer).toBe(
      'Буфер привязанных сессий'
    )
    expect(ru.admin.accounts.quotaControl.rpmLimit.umqModeOff).toBe('Выключен')
    expect(ru.admin.accounts.quotaControl.rpmLimit.umqModeThrottle).toBe('Ограничение')
    expect(ru.admin.accounts.quotaControl.rpmLimit.umqModeSerialize).toBe(
      'Последовательная обработка'
    )
    expect(ru.admin.accounts.quotaControl.customBaseUrl.urlHint).toBe(
      'URL сервиса ретрансляции (например, https://relay.example.com)'
    )
    expect(ru.admin.accounts.quotaControl.rpmLimit.strategyTieredHint).toBe(
      'Зелёная зона → жёлтая зона → только привязанные сессии → блокировка; ограничение усиливается постепенно'
    )
    expect(ru.admin.accounts.quotaControl.rpmLimit.strategyHint).toBe(
      'Многоуровневая: постепенно ограничивает при превышении; без ограничений для привязанных сессий: существующие сессии не ограничиваются'
    )
    expect(ru.admin.accounts.affinityBase).toBe('Базовый лимит (зелёная зона)')
    expect(ru.admin.accounts.affinityBaseHint).toBe(
      'Максимум клиентов в зелёной зоне (полный приоритет маршрутизации)'
    )
    expect(ru.admin.accounts.affinityBufferHint).toBe(
      'Дополнительные клиенты, разрешённые в жёлтой зоне (пониженный приоритет)'
    )
    expect(ru.admin.ops.alertEvents.status.manualResolved).toBe('УСТРАНЕНО ВРУЧНУЮ')
    expect(ru.admin.ops.realtime.offline).toBe('Realtime недоступен')
  })

  it('preserves the updated v0.1.170 upstream billing semantics in Russian', () => {
    expect(ru.admin.accounts.upstreamBilling.autoProbeHint).toBe(
      'Обновлять объявленный upstream-тариф с глобальным интервалом. Сам по себе этот переключатель не изменяет тариф аккаунта.'
    )
    expect(ru.admin.accounts.upstreamBilling.noEligibleAccounts).toBe(
      'Выберите аккаунты с API Key'
    )
    expect(ru.admin.settings.upstreamBillingProbe.description).toBe(
      'Периодически получать тарифы, объявленные upstream-сайтами Sub2API. Тарифы аккаунтов изменяются только при включённом отдельном переключателе синхронизации.'
    )
  })

  it('preserves the updated v0.1.171 quota and composite semantics in Russian', () => {
    expect(ru.admin.accounts.openaiQuotaReset.resetSuccess).toBe(
      'Сброшено окон: {windows}; reset-кредиты и состояние аккаунта обновлены'
    )
    expect(ru.admin.groups.form.maxReasoningEffortHint).toBe(
      'Ограничивает только явно заданный OpenAI reasoning effort. Для Composite-групп применяется только к запросам, направленным в OpenAI. Более высокие значения уменьшаются; отсутствующее значение не добавляется. Ограничение имеет приоритет над сопоставлениями.'
    )
  })

  it('preserves the updated v0.1.172 model-audit, Tencent site, and Codex identity semantics in Russian', () => {
    expect(ru.usage.sentUpstreamModel).toBe('Отправлено upstream')
    expect(ru.usage.upstreamResponseModel).toBe('Ответ upstream')
    expect(ru.usage.upstreamModelMismatch).toBe('Несоответствие модели в ответе')
    expect(ru.usage.modelVariant).toBe('Возможный вариант версии')
    expect(ru.usage.modelMismatch).toBe('Другая модель')
    expect(ru.admin.usage.upstreamModelAudit).toBe('Аудит модели upstream')
    expect(ru.admin.usage.allUpstreamModelAudit).toBe('Все состояния модели в ответе')
    expect(ru.admin.usage.upstreamModelMismatchOnly).toBe('Только несовпадения')
    expect(ru.admin.usage.upstreamModelMatchedOnly).toBe('Только совпадения')
    expect(ru.admin.settings.tencentCaptcha.region).toBe('Сайт сервиса')
    expect(ru.admin.settings.tencentCaptcha.regionCn).toBe('Материковый Китай')
    expect(ru.admin.settings.tencentCaptcha.regionIntl).toBe('Международный')
    expect(ru.admin.settings.tencentCaptcha.regionHint).toBe(
      'Выбирает SDK-скрипт и endpoint серверной проверки. Значение должно совпадать с сайтом, на котором выпущен CaptchaAppId; международные приложения создаются в консоли tencentcloud.com.'
    )
    expect(ru.admin.settings.gatewayForwarding.openaiCodexUserAgentPlaceholder).toBe(
      'codex-tui/0.146.1 (Ubuntu 22.4.0; x86_64) WindowsTerminal (codex-tui; 0.146.1)'
    )
    expect(ru.admin.settings.gatewayForwarding.openaiCodexUserAgentHint).toBe(
      'Полный User-Agent Codex для всех исходящих запросов; позволяет настраивать отпечаток ОС / архитектуры / терминала. Оставьте пустым, чтобы формировать стандартную идентичность codex-tui на основе версии ниже (рекомендуется). Если значение задано, версии в начале и в конце всё равно синхронизируются с версией ниже, поэтому UA не остаётся привязанным к введённому здесь релизу: при дефиците мощности upstream распределяет нагрузку по идентичности клиента и в первую очередь отклоняет устаревшие или неофициальные идентичности с ошибкой server_is_overloaded.'
    )
  })

  it('preserves the modified v0.1.173 monitor, registration, media, and client configuration semantics in Russian', () => {
    expect(ru.admin.accounts.imageTestHint).toBe(
      'Вызывает отдельный endpoint /v1/images/generations и показывает полученное изображение ниже.'
    )
    expect(ru.admin.settings.features.channelMonitor.description).toBe(
      'Выберите активные проверки V1 или пассивный мониторинг использования V2. При отключении останавливаются обе фоновые задачи, а пользовательский раздел скрывается.'
    )
    expect(ru.admin.settings.features.channelMonitor.enabledHint).toBe(
      'Отключение остановит планировщик V1 и агрегацию V2; конфигурация и история сохранятся.'
    )
    expect(ru.admin.settings.features.channelMonitor.defaultIntervalHint).toBe(
      'Только V1: интервал по умолчанию для новых мониторов (может быть переопределён для каждого монитора). Диапазон 15–3600 секунд.'
    )
    expect(ru.admin.settings.registration.emailSuffixWhitelistHint).toBe(
      "Регистрироваться могут только email-адреса из указанных доменов; оставьте пустым без ограничений (например, {'@'}qq.com, {'@'}gmail.com, *.edu.cn)"
    )
    expect(ru.keys.useKeyModal.grok.description).toBe(
      'Настройте Grok CLI, Claude Code, Codex или OpenCode для отправки запросов через группу Grok в Sub2API. Текстовые модели используют Responses, а image/video — идентификаторы Imagine на media endpoints.'
    )
    expect(ru.keys.useKeyModal.grok.configTomlHint).toBe(
      'Официальный путь: ~/.grok/config.toml (или $GROK_HOME). Заполните [endpoints] (models_base_url / models_list_url / xai_api_base_url / cli_chat_proxy_base_url), [auth] с preferred_method=api_key, [models], [session] и переопределения image/video в [features]. Предпочитайте env_key вместо api_key; для каждой текстовой модели требуется api_backend=responses. Перед объединением сделайте резервную копию, затем выполните grok inspect.'
    )
    expect(ru.keys.useKeyModal.grok.codexConfigTomlHint).toBe(
      'Официальный Codex: поддерживается только wire_api = "responses"; предпочитайте env_key вместо experimental_bearer_token; для шлюзов не OpenAI задайте supports_websockets = false (Sub2API всё равно может принимать WebSocket от клиента и преобразовывать его в HTTP/SSE). Перед объединением сохраните резервную копию ~/.codex/config.toml.'
    )
    expect(ru.keys.useKeyModal.grok.note).toBe(
      'Экспортируйте GROK_MODELS_BASE_URL и XAI_API_KEY, сохраните полный config.toml (endpoints/auth/models/session/features) как ~/.grok/config.toml, выполните grok inspect, затем выберите через /model grok-4.5 (или grok-build-0.1 для программирования).'
    )
    expect(ru.keys.useKeyModal.grok.noteWindows).toBe(
      'Задайте GROK_MODELS_BASE_URL и XAI_API_KEY, сохраните полный config.toml как %USERPROFILE%\\.grok\\config.toml, выполните grok inspect, затем выберите через /model grok-4.5 (или grok-build-0.1 для программирования).'
    )
    expect(ru.keys.useKeyModal.grok.claudeNote).toBe(
      'Выберите один способ: переменные окружения для текущей сессии терминала или ~/.claude/settings.json для постоянной настройки. Не добавляйте в репозиторий файлы с API Key.'
    )
    expect(ru.keys.useKeyModal.grok.codexNote).toBe(
      'Экспортируйте SUB2API_API_KEY, сохраните config.toml в ~/.codex (при необходимости выполните mkdir -p ~/.codex). Предпочитайте аутентификацию env_key; не добавляйте секреты в репозиторий.'
    )
    expect(ru.keys.useKeyModal.grok.codexNoteWindows).toBe(
      'Задайте $env:SUB2API_API_KEY, сохраните config.toml в %USERPROFILE%\\.codex. Предпочитайте аутентификацию env_key; не добавляйте секреты в репозиторий.'
    )
  })

  it('localizes user-facing v0.1.173 probe defaults and routing labels', () => {
    expect(ru.admin.accounts.grok.testModeSearch).toBe('Веб-поиск (/web_search)')
    expect(ru.admin.accounts.grok.ttsTextDefault).toBe(
      'Привет от проверки подключения аккаунта Sub2API.'
    )
    expect(ru.admin.accounts.grok.ttsTextPlaceholder).toBe(
      'Пример: Привет от проверки подключения Sub2API.'
    )
    expect(ru.admin.accounts.grok.searchTestHint).toBe(
      'Отдельная проверка web_search (как через gateway /v1/web_search). Это не произвольный чат с инструментами.'
    )
    expect(ru.admin.accounts.grok.testModeHint).toBe(
      'Текст, изображения и видео используют выбранную модель. Веб-поиск, TTS, STT и Realtime обращаются к отдельным эндпоинтам (а не к инструментам произвольного чата).'
    )
    expect(ru.admin.accounts.grok.realtimeTestHint).toBe(
      'Отдельное WebSocket-подключение к /v1/realtime (model=grok-voice-latest). Успешное установление соединения подтверждает доступность; также может быть показано первое событие сервера.'
    )
    expect(ru.admin.accounts.grok.imageUploadLabel).toBe(
      'Исходное изображение (необязательно, для редактирования)'
    )
    expect(ru.admin.accounts.grok.imageUploadHint).toBe(
      'Рекомендуются PNG/JPEG, обе стороны ≥ 8 px, для редактирования — менее ~4 МБ. Загрузка исходного изображения переключает на /images/edits (изображение-в-изображение). Оставьте пустым для генерации из текста через /images/generations.'
    )
    expect(ru.admin.accounts.grok.sttTestHint).toBe(
      'Отдельный вызов /v1/stt с синтетическим WAV-файлом тишины; успех означает, что эндпоинт доступен.'
    )
    expect(ru.admin.accounts.videoPromptDefault).toBe(
      'Красный шар один раз отскакивает от белого пола; короткое простое движение.'
    )
    expect(ru.admin.accounts.videoPromptPlaceholder).toBe(
      'Пример: красный шар один раз отскакивает от белого пола; короткое простое движение.'
    )
    expect(ru.auth.emailDomainRegistrationLimit).toBe(
      'Этот email-домен больше не может зарегистрировать аккаунт. Используйте распространённый почтовый сервис или обратитесь в поддержку, чтобы добавить корпоративный домен в разрешённый список.'
    )
    expect(ru.admin.accounts.usageWindow.grokOverage).toBe(
      'Перерасход onDemandUsed/onDemandCap'
    )
    expect(ru.admin.settings.gatewayForwarding.grokBaseURLModeAPI).toBe('Публичный API')
    expect(ru.admin.settings.gatewayForwarding.grokBaseURLModeCLI).toBe('CLI-прокси чата')
    expect(ru.admin.settings.gatewayForwarding.grokBaseURLModeEUWest1).toBe(
      'Региональный API (eu-west-1)'
    )
    expect(ru.admin.settings.gatewayForwarding.grokBaseURLModeUSEast1).toBe(
      'Региональный API (us-east-1)'
    )
    expect(ru.admin.settings.gatewayForwarding.grokBaseURLModeUSWest2).toBe(
      'Региональный API (us-west-2)'
    )
    expect(ru.admin.settings.gatewayForwarding.grokDefaultBaseURLModeHint).toBe(
      'Используется только тогда, когда у Grok-аккаунта не задан явный base URL. Медиа- и голосовые эндпоинты продолжат использовать свои официальные API-хосты.'
    )
    expect(ru.admin.settings.gatewayForwarding.grokCrossClientMapHint).toBe(
      'По умолчанию выключено. Когда включено, идентификаторы моделей GPT, Codex, o-series и Claude перенаправляются на указанную выше текстовую модель Grok по умолчанию.'
    )
    expect(ru.admin.settings.registration.emailDomainQuota).toBe(
      'Квота доменов вне разрешённого списка'
    )
    expect(ru.admin.settings.registration.emailDomainQuotaHint).toBe(
      'Когда включено и разрешённый список не пуст, каждый регистрируемый домен вне списка может зарегистрировать один аккаунт. Когда отключено, домены вне списка отклоняются. Не действует, пока разрешённый список пуст.'
    )
    expect(ru.admin.settings.scheduling.accountSchedulingThresholdsDescription).toBe(
      'Когда текущее нативное окно учёта использования аккаунта (сессия OpenAI Codex/Anthropic или использование запросов/токенов Grok) достигает этого процента, Sub2API временно исключает его из маршрутизации до сброса окна. Используйте 100, чтобы отключить.'
    )
    expect(ru.admin.settings.scheduling.accountSchedulingThresholdsGlobalHint).toBe(
      'Системный порог по умолчанию для каждого аккаунта этой платформы. Для отдельного аккаунта его можно переопределить в редакторе аккаунта.'
    )
    expect(ru.admin.groups.videoPricing.modelOverridesDescription).toBe(
      'Каждая заполненная ячейка переопределяет базовую цену разрешения для этого семейства моделей. Алиасы Preview и legacy для video-1.5 используют то же семейство; для пустых ячеек применяется базовая цена разрешения.'
    )
    expect(ru.channelMonitorV2.errorCategories.upstream_5xx).toBe('Ошибки upstream 5xx')
    expect(ru.channelMonitorV2.errorDetail.upstream).toBe('Ошибка upstream {code}')
    expect(ru.channelMonitorV2.filters.selectedCount).toBe('{count}')
    expect(ru.channelMonitorV2.matrix.healthyLegend).toBe('Норма (≥80)')
    expect(ru.channelMonitorV2.matrix.unknownLegend).toBe(
      'Нет трафика / недостаточно выборок'
    )
    expect(ru.channelMonitorV2.settings.fields.minimumSample).toBe('Минимум выборок')
    expect(ru.channelMonitorV2.settings.healthHint).toBe(
      'Управляет пользовательскими цветовыми зонами и общей оценкой. Значения по умолчанию достаточно мягкие, чтобы небольшая доля ошибок или низкая доля кэша не сразу приводили к статусу неисправности.'
    )
    expect(ru.channelMonitorV2.settings.modeV1).toBe('Активные проверки V1')
    expect(ru.channelMonitorV2.settings.modeV2).toBe('Пассивный мониторинг V2')
    expect(ru.channelMonitorV2.admin.descriptionV1).toBe(
      'Системный режим — активные проверки V1: управляйте мониторами и запускайте проверки вручную; агрегация V2 не выполняется.'
    )
    expect(ru.admin.settings.features.channelMonitor.modeV1Hint).toBe(
      'По умолчанию: запускает плановые проверки работоспособности upstream для настроенных мониторов каналов (создаётся тестовый трафик).'
    )
    expect(ru.admin.settings.features.channelMonitor.modeV2Hint).toBe(
      'Опционально: агрегирует метрики работоспособности из реального трафика gateway без тестовых запросов к upstream. В режиме V2 проверки V1 остановлены.'
    )
  })

  it('preserves the added v0.1.175 backup, response billing, scheduling, and Codex fingerprint semantics in Russian', () => {
    expect(ru.admin.backup.columns.parts).toBe('Части')
    expect(ru.admin.backup.actions.downloadParts).toBe('Скачать части')
    expect(ru.admin.backup.actions.downloadPartsHint).toContain('cat payload.part-* > backup.sql.gz')
    expect(ru.admin.backup.actions.downloadPartsHint).toContain('copy /b payload.part-000001+payload.part-000002 backup.sql.gz')
    expect(ru.admin.backup.actions.downloadPartsHint).toContain('свыше 4 ГиБ')
    expect(ru.admin.backup.actions.downloadPartsHint).toContain('полный локальный gzip-архив')
    expect(ru.admin.backup.actions.downloadPartsHint).toContain('двух сжатых копий')
    expect(ru.admin.backup.actions.downloadPartsHint).toContain('30 минут')
    expect(ru.admin.backup.actions.partLabel).toBe('Часть {index}')
    expect(ru.admin.backup.actions.downloadFailed).toBe('Ссылка для скачивания отсутствует')
    expect(ru.admin.channels.form.billingModelSourceResponse).toBe('Считать по модели в ответе upstream')
    expect(ru.admin.accounts.accountSchedulingThresholdOverride).toBe(
      'Переопределение порога авто-паузы аккаунта'
    )
    expect(ru.admin.accounts.accountSchedulingThresholdOverrideDisabledHint).toContain('100 отключает')
    expect(ru.admin.accounts.openai.codexFingerprintMode).toBe('Сведение отпечатков Codex')
    expect(ru.admin.accounts.openai.codexFingerprintDevice).toBe('Только устройство')
    expect(ru.admin.accounts.openai.codexFingerprintFull).toBe('Полное сведение')
  })

  it('preserves the added v0.1.176 group and video pricing semantics in Russian', () => {
    expect(ru.admin.groups.modelPricing.title).toBe('Цены группы по моделям')
    expect(ru.admin.groups.modelPricing.description).toContain('Переопределяют цены канала')
    expect(ru.admin.groups.modelPricing.longContext).toContain('длинного контекста')
    expect(ru.admin.groups.modelPricing.longContextHint).toContain('первая ступень')
    expect(ru.admin.groups.modelPricing.add).toBe('Добавить цену модели')
    expect(ru.admin.channels.billingMode.video).toBe('Видео (за секунду)')
    expect(ru.admin.channels.form.videoTiers).toContain('за секунду')
    expect(ru.admin.channels.form.defaultVideoPrice).toContain('за секунду')
  })

  it('preserves the modified v0.1.177 Codex defaults and group usage semantics in Russian', () => {
    expect(ru.admin.groups.usageYesterday).toBe('Вчера')
    expect(ru.admin.accounts.openai.codexFingerprintModeDesc).toContain('По умолчанию выключено')
    expect(ru.admin.accounts.openai.codexFingerprintModeDesc).toContain('сокращение доступной квоты')
    expect(ru.admin.accounts.openai.codexFingerprintOff).toBe(
      'Выключено (сквозная передача, по умолчанию)'
    )
    expect(ru.admin.accounts.openai.codexFingerprintSession).toBe('Устройство и сессия')
    expect(ru.admin.accounts.openai.codexFingerprintSession).not.toContain('рекоменду')
    expect(ru.admin.accounts.openai.compactProbeSuccess).toBe(
      'Проверка compact успешно выполнена (нативный remote compaction v2)'
    )
    expect(ru.admin.accounts.openai.compactProbeUnsupported).toContain(
      'эта цепочка не поддерживает нативный remote compaction v2'
    )
  })

  it('preserves the added v0.1.178 CN provider, quota monitor, time pricing, and Fast/Flex semantics in Russian', () => {
    expect(ru.admin.accounts.platforms.kimi).toBe('Kimi')
    expect(ru.admin.accounts.platforms.zhipu).toBe('Zhipu GLM')
    expect(ru.admin.accounts.platforms.deepseek).toBe('DeepSeek')
    expect(ru.admin.accounts.cnProviders.accountMode.paygDesc).toContain('тарифицируется по токенам')
    expect(ru.admin.accounts.cnProviders.accountMode.codingDesc).toContain('скользящим окнам расхода 5 часов / неделя')
    expect(ru.admin.accounts.cnProviders.apiProtocol.anthropicDesc).toContain('Native passthrough')
    expect(ru.admin.accounts.bulkEdit.longContextShadowHint).toContain('Long-context billing задаётся на родительском аккаунте')
    expect(ru.admin.accounts.status.expired).toBe('Истёк')

    expect(ru.admin.channelMonitor.form.checkModeQuotaHint).toContain('без probe-запросов')
    expect(ru.admin.channelMonitor.form.openAIQuotaProbeHint).toContain('Codex probe')
    expect(ru.admin.channelMonitor.form.openAIQuotaProbeHint).toContain('не чаще одного раза в 10 минут')
    expect(ru.admin.channelMonitor.linkedAccountRequired).toBe('Выберите связанный аккаунт')
    expect(ru.monitorCommon.quota.unavailable).toBe('Квота недоступна')
    expect(ru.monitorCommon.quota.windows['7dSonnet']).toBe('7 д Sonnet')

    expect(ru.admin.channels.form.timePricing).toBe('Цены по времени (time-based pricing, необязательно)')
    expect(ru.admin.channels.timePricingValidation.overlap).toBe('Периоды времени не должны пересекаться')
    expect(ru.admin.settings.features.channelMonitor.showQuotaHint).toContain('По умолчанию выключено')

    expect(ru.admin.settings.openaiFastPolicy.modelWhitelist).toBe('Целевые модели')
    expect(ru.admin.settings.openaiFastPolicy.modelWhitelistHint).toContain('Действие для других моделей')
    expect(ru.admin.settings.openaiFastPolicy.modelPatternPlaceholder).toBe('e.g., gpt-5.6-sol or gpt-5.6*')
    expect(ru.admin.settings.openaiFastPolicy.fallbackAction).toBe('Действие для других моделей')
    expect(ru.admin.settings.openaiFastPolicy.summaryTargetModels).toBe('Целевые модели')
  })

  it('preserves the added v0.1.179 adaptive API protocol and multiplier pricing semantics in Russian', () => {
    expect(ru.admin.accounts.cnProviders.apiProtocol.adaptive).toBe('Adaptive (автовыбор protocol)')
    expect(ru.admin.accounts.cnProviders.apiProtocol.adaptiveDesc).toContain('родной endpoint провайдера')
    expect(ru.admin.accounts.cnProviders.apiProtocol.adaptiveDesc).toContain('конвертирует только если endpoint недоступен')
    expect(ru.admin.accounts.cnProviders.apiProtocol.endpoints).toContain('endpoint-ы протоколов')
    expect(ru.admin.accounts.cnProviders.apiProtocol.responsesFallbackDesc).toContain('Responses-запросы')
    expect(ru.admin.accounts.cnProviders.apiProtocol.responsesFallbackDesc).toContain('Chat Completions')

    expect(ru.admin.channels.form.fastMultiplier).toContain('множитель быстрого tier')
    expect(ru.admin.channels.form.flexMultiplier).toContain('множитель экономичного tier')
    expect(ru.admin.channels.form.multiplierPositive).toContain('множители tier-ов')
    expect(ru.admin.channels.form.inputMultiplier).toContain('вход')
    expect(ru.admin.channels.form.outputMultiplier).toContain('выход')
    expect(ru.admin.channels.intervalValidation.multiplierPositive).toContain('должен быть больше 0')
    expect(ru.admin.channels.intervalValidation.price.inputMultiplier).toContain('входных токенов')
    expect(ru.admin.groups.modelPricing.longContextHint).toContain('интервалы канала')
    expect(ru.admin.groups.modelPricing.longContextHint).toContain('long-context billing явно включён на аккаунте')
  })

  it('does not expose source-language labels on Russian admin surfaces', () => {
    expect(ru.admin.availableChannels.description).toBe(
      'Сводный вид каждого канала, связанных групп и поддерживаемых моделей с раскрытыми шаблонами'
    )
    expect(ru.admin.availableChannels.columns.billingSource).toBe('Источник модели для биллинга')
    expect(ru.admin.availableChannels.columns.groups).toBe('Связанные группы')
    expect(ru.admin.availableChannels.noGroups).toBe('Нет связанных групп')
    expect(ru.admin.availableChannels.noModels).toBe('Маппинг моделей не настроен')
    expect(ru.admin.availableChannels.billingSource.requested).toBe('Запрошенная модель')
    expect(ru.admin.availableChannels.billingSource.upstream).toBe('Модель upstream')
    expect(ru.admin.availableChannels.billingSource.channel_mapped).toBe('Модель после маппинга канала')

    expect(ru.admin.riskControl.filters.search).toBe('Поиск по пользователю, ключу или сводке')
    expect(ru.admin.riskControl.filters.from).toBe('С')
    expect(ru.admin.riskControl.filters.to).toBe('По')
    expect(ru.admin.riskControl.filters.allEndpoints).toBe('Все endpoint-ы')
    expect(ru.admin.riskControl.table.result).toBe('Результат')
    expect(ru.admin.riskControl.table.input).toBe('Сводка ввода')
    expect(ru.admin.riskControl.result.all).toBe('Все результаты')
    expect(ru.admin.riskControl.result.hit).toBe('Срабатывание')
    expect(ru.admin.riskControl.result.blocked).toBe('Заблокировано')
    expect(ru.admin.riskControl.result.pass).toBe('Пропущено')

    expect(ru.admin.settings.emailTemplates.localeEn).toBe('Английский')
    expect(ru.admin.settings.emailTemplates.localeZh).toBe('Китайский')
    expect(ru.admin.settings.emailTemplates.html).toBe('HTML-шаблон')
    expect(ru.admin.settings.emailTemplates.placeholders).toBe('Доступные переменные')
    expect(ru.admin.settings.emailTemplates.placeholdersHelp).toContain('Сервер заменяет')
    expect(ru.admin.settings.emailTemplates.livePreview).toBe('Предпросмотр')
    expect(ru.admin.settings.emailTemplates.previewSecurityHint).toContain('endpoint предпросмотра сервера')
    expect(ru.admin.settings.emailTemplates.preview).toBe('Обновить предпросмотр')
    expect(ru.admin.settings.emailTemplates.previewing).toBe('Формируется предпросмотр...')
    expect(ru.admin.settings.emailTemplates.placeholderCopied).toBe('Переменная скопирована')
    expect(ru.admin.settings.emailTemplates.noPreview).toContain('предпросмотр')
  })

  it('does not expose the reviewed sentence-level English leaks in active Russian admin UI', () => {
    const reviewedRuntimeValues = [
      ru.admin.dataManagement.s3Profiles.editHint,
      ru.admin.accounts.openai.responsesStatusAutoUnknown,
      ru.admin.accounts.quotaControl.sessionLimit.idleTimeout,
      ru.admin.settings.features.affiliate.modal.userPlaceholder,
      ru.admin.settings.site.backendMode
    ]

    expect(reviewedRuntimeValues).toEqual([
      'Нажмите «Изменить», чтобы отредактировать параметры профиля в правой панели.',
      'Автопроверка: статус неизвестен',
      'Тайм-аут бездействия',
      'Поиск по email или имени пользователя',
      'Режим backend-а'
    ])
    expect(reviewedRuntimeValues.every((value) => /[А-Яа-яЁё]/.test(value))).toBe(true)
  })

  it('documents the v0.1.175 backup spool capacity contract for Russian operators', () => {
    const readme = readFileSync(resolve(process.cwd(), '../README_RU.md'), 'utf8')
    expect(readme).toContain('сначала создаёт полный локальный gzip-архив')
    expect(readme).toContain('свыше 4 ГиБ')
    expect(readme).toContain('примерно для двух сжатых копий')
    expect(readme).toContain('30 минут')
    expect(readme).toContain('TMPDIR')
    expect(readme).toContain('os.TempDir()')
  })

  it('localizes the reviewed reachable RU leaves and runtime call sites', () => {
    expect([
      ru.admin.accounts.refreshInterval5s,
      ru.admin.accounts.refreshInterval10s,
      ru.admin.accounts.refreshInterval15s,
      ru.admin.accounts.refreshInterval30s,
    ]).toEqual(['5 секунд', '10 секунд', '15 секунд', '30 секунд'])
    expect(ru.admin.accounts.openai.responsesStatusAutoSupported).toBe('Автопроверка: Responses')
    expect(ru.admin.accounts.openai.responsesStatusAutoUnsupported).toBe('Автопроверка: Chat Completions')
    expect(ru.admin.accounts.openai.responsesStatusForcedResponses).toBe('Принудительно: Responses')
    expect(ru.admin.accounts.openai.responsesStatusForcedChatCompletions).toBe('Принудительно: Chat Completions')
    expect(ru.auth.oauth.callbackTitle).toBe('Обратный вызов OAuth')
    expect(ru.auth.oauth.callbackHint).toContain('код и параметр состояния')
    expect(ru.admin.errorPassthrough.form.keywordsPlaceholder).toContain('Одно ключевое слово на строку')
    expect(ru.admin.errorPassthrough.form.skipMonitoring).toBe('Не учитывать в мониторинге')
    expect(ru.admin.accounts.imagePromptDefault).toContain('оранжевым котом-космонавтом')
    expect(ru.admin.accounts.imagePromptPlaceholder).toContain('оранжевый кот-космонавт')

    const sourceRoot = resolve(process.cwd(), 'src')
    const keyUsage = readFileSync(resolve(sourceRoot, 'views/KeyUsageView.vue'), 'utf8')
    const usage = readFileSync(resolve(sourceRoot, 'views/admin/UsageView.vue'), 'utf8')
    const customPage = readFileSync(resolve(sourceRoot, 'views/user/CustomPageView.vue'), 'utf8')
    const navigation = readFileSync(resolve(sourceRoot, 'components/common/NavigationProgress.vue'), 'utf8')
    const batchImage = readFileSync(resolve(sourceRoot, 'views/user/BatchImageGuideView.vue'), 'utf8')
    const versionBadge = readFileSync(resolve(sourceRoot, 'components/common/VersionBadge.vue'), 'utf8')
    const complianceDialog = readFileSync(resolve(sourceRoot, 'components/admin/AdminComplianceDialog.vue'), 'utf8')
    const settings = readFileSync(resolve(sourceRoot, 'views/admin/SettingsView.vue'), 'utf8')
    expect(keyUsage).not.toMatch(/statusText:\s*['"](?:Active|Quota Exhausted|Expired)['"]/)
    expect(keyUsage).not.toContain("|| 'Unknown'")
    expect(keyUsage).not.toContain('response?.data?.message')
    expect(keyUsage).not.toContain('(err as Error).message')
    expect(keyUsage).not.toContain('windowLabels[rl.window] || rl.window')
    expect(usage).toContain("appStore.showError(t('usage.exportFailed'))")
    expect(customPage).toContain("t('customPage.loadFailed')")
    expect(navigation).toContain(":aria-label=\"t('common.loading')\"")
    expect(batchImage).not.toContain('return message || fallback')
    expect(batchImage).not.toContain('return error.message || error.code')
    expect(batchImage).toContain("batchImageText('errorReference')")
    expect(versionBadge).not.toContain('err.response?.data?.message')
    expect(versionBadge).not.toContain('err.message || t(')
    expect(complianceDialog).not.toContain('showError(message)')
    expect(settings).not.toContain('Callback URL backend')
    expect(settings).not.toContain('Callback URL frontend')
  })

  it('localizes the v0.1.177 active RU controls, accessibility labels, and primary errors', () => {
    expect(ru.redeem.days).toBe(' дн.')
    expect(ru.auth.oauthCallbackPageTitle).toBe('Обратный вызов OAuth')
    expect(ru.admin.accounts.openai.compactModeAuto).toBe('Авто')
    expect(ru.admin.accounts.openai.compactModeForceOn).toBe('Принудительно включён')
    expect(ru.admin.accounts.openai.compactModeForceOff).toBe('Принудительно выключен')
    expect(ru.admin.accounts.openai.compactModelMapping).toBe('Сопоставление моделей только для Compact')
    expect(ru.admin.accounts.openai.wsModeOff).toBe('Выключен (off)')
    expect(ru.admin.accounts.openai.wsModeCtxPool).toBe('Пул контекста (ctx_pool)')
    expect(ru.admin.accounts.openai.wsModePassthrough).toBe('Сквозная передача (passthrough)')
    expect(ru.admin.accounts.openai.wsModeHttpBridge).toBe('HTTP-мост (http_bridge)')
    expect(ru.admin.accounts.openai.wsModeShared).toBe('Общий (shared)')
    expect(ru.admin.accounts.openai.wsModeDedicated).toBe('Выделенный (dedicated)')
    expect(ru.admin.accounts.openai.oauthResponsesWebsocketsV2).toBe('Режим WebSocket для OAuth')
    expect(ru.admin.accounts.openai.apiKeyResponsesWebsocketsV2).toBe('Режим WebSocket для API-ключа')
    expect(ru.admin.accounts.quotaControl.windowCost.stickyReserve).toBe('Резерв sticky-сессий')
    expect(ru.admin.accounts.quotaControl.rpmLimit.strategyTiered).toBe('Многоуровневая модель')
    expect(ru.admin.accounts.quotaControl.rpmLimit.strategyStickyExempt).toBe('Исключать sticky-сессии')
    expect(ru.admin.accounts.affinityBuffer).toBe('Буфер (жёлтая зона)')
    expect(ru.admin.settings.oidc.frontendRedirectUrl).toBe('Путь обратного вызова frontend')
    expect(ru.admin.settings.oidc.tokenAuthMethod).toBe('Метод аутентификации токена')
    expect(ru.admin.settings.oidc.clockSkewSeconds).toBe('Допуск расхождения часов (сек.)')
    expect(ru.admin.settings.oidc.allowedSigningAlgs).toBe('Разрешённые алгоритмы подписи')
    expect(ru.admin.settings.oidc.userinfoEmailPath).toBe('Путь email в UserInfo')
    expect(ru.admin.settings.oidc.userinfoIdPath).toBe('Путь ID в UserInfo')
    expect(ru.admin.settings.oidc.userinfoUsernamePath).toBe('Путь имени пользователя в UserInfo')
    expect(ru.admin.settings.oidc.userinfoEmailPathPlaceholder).toBe('например, data.email')
    expect(ru.admin.settings.oidc.userinfoIdPathPlaceholder).toBe('например, data.id')
    expect(ru.admin.settings.oidc.userinfoUsernamePathPlaceholder).toBe('например, data.username')
    expect(
      Array.from(ruLeaves.entries())
        .filter(([path]) => path.endsWith('.modelMapping'))
        .map(([, value]) => value)
    ).not.toContain('Model Mapping')

    const sourceRoot = resolve(process.cwd(), 'src')
    const usageFilters = readFileSync(resolve(sourceRoot, 'components/admin/usage/UsageFilters.vue'), 'utf8')
    expect(usageFilters).toContain("t('admin.usage.clearUserFilter')")
    expect(usageFilters).toContain("t('admin.usage.clearApiKeyFilter')")
    expect(usageFilters).toContain("t('admin.usage.clearAccountFilter')")
    expect(usageFilters).not.toContain('Clear user filter')
    expect(usageFilters).not.toContain('Clear API key filter')
    expect(usageFilters).not.toContain('Clear account filter')

    const primaryErrorFiles = [
      'components/admin/account/AccountTestModal.vue',
      'components/account/AccountTestModal.vue',
      'views/admin/GroupsView.vue',
      'views/admin/PromoCodesView.vue',
      'views/admin/BackupView.vue'
    ].map((path) => readFileSync(resolve(sourceRoot, path), 'utf8'))
    const groupsView = readFileSync(resolve(sourceRoot, 'views/admin/GroupsView.vue'), 'utf8')
    expectLocalizedCatchErrors(groupsView, {
      handleDuplicate: 'admin.groups.duplicateFailed',
      loadCompositeRoutes: 'admin.groups.compositeRoutes.failedToLoad',
      saveCompositeRoute: 'admin.groups.compositeRoutes.failedToSave',
      deleteCompositeRoute: 'admin.groups.compositeRoutes.failedToDelete',
      previewCompositeRoute: 'admin.groups.compositeRoutes.failedToPreview'
    })
    for (const source of primaryErrorFiles) {
      expect(source).not.toContain('errorMessage.value = event.error')
      expect(source).not.toContain('errorMessage.value = msg')
      expect(source).not.toContain('showError(error.response?.data?.message || t(')
      expect(source).not.toContain('showError(error.response?.data?.detail || t(')
      expect(source).not.toContain('showError(error.message || t(')
      expect(source).not.toContain('showError(err.response?.data?.message || t(')
      expect(source).not.toContain('showError(err.message || t(')
      expect(source).not.toContain('showError(result.error || t(')
      expect(source).not.toContain('showError(record.error_message || t(')
      expect(source).not.toContain('error.response?.data?.detail ||')
      expect(source).not.toContain('error.response?.data?.message ||')
    }
  })
})
