import { describe, expect, it } from 'vitest'
import { baseCompile } from '@intlify/message-compiler'

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
})
