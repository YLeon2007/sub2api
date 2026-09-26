import { describe, expect, it } from 'vitest'

import ru from '../locales/ru'

function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[key]
  }, value)
}

const expectedAdded: Record<string, string> = {
  'admin.accounts.openaiQuotaReset.points': 'Баллы',
  'admin.accounts.openaiQuotaReset.pointsAvailable': 'Доступно',
  'admin.accounts.openaiQuotaReset.pointsCachePersistFailed':
    'Показаны актуальные баллы, но сохранить кэш не удалось. Запросите ещё раз.',
  'admin.accounts.openaiQuotaReset.pointsTooltip': 'Нажмите, чтобы запросить баллы Codex и reset-кредиты',
  'admin.accounts.openaiQuotaReset.pointsUnlimited': 'Без лимита',
  'admin.accounts.openaiQuotaReset.pointsUpdatedAt': 'Баланс проверен: {time}',
  'admin.accounts.openaiReferral.alreadyInvited':
    'Приглашение для этого email уже существует. Проверьте его статус в Codex.',
  'admin.accounts.openaiReferral.available': 'Осталось приглашений',
  'admin.accounts.openaiReferral.cacheFailed':
    'Актуальная ёмкость получена, но сохранить кэш не удалось. Запросите ещё раз.',
  'admin.accounts.openaiReferral.checkedAt': 'Проверено: {time}. Нажмите, чтобы обновить.',
  'admin.accounts.openaiReferral.consent': 'У меня есть согласие этого человека на отправку ему приглашения.',
  'admin.accounts.openaiReferral.consentRequired': 'Сначала подтвердите, что у вас есть согласие получателя.',
  'admin.accounts.openaiReferral.email': 'Email получателя',
  'admin.accounts.openaiReferral.fromAccount': 'Приглашающий аккаунт:',
  'admin.accounts.openaiReferral.invalidEmail': 'Введите один корректный email-адрес.',
  'admin.accounts.openaiReferral.invite': 'Пригласить пользователя',
  'admin.accounts.openaiReferral.personal': 'Пригласить друга',
  'admin.accounts.openaiReferral.programChanged':
    'Реферальная программа аккаунта изменилась. Обновите доступность перед отправкой.',
  'admin.accounts.openaiReferral.queryHint': 'Нажмите, чтобы запросить оставшиеся приглашения',
  'admin.accounts.openaiReferral.rateLimited':
    'Достигнут лимит частоты или количества приглашений. Повторите попытку позже.',
  'admin.accounts.openaiReferral.refreshFailed':
    'Приглашение отправлено, но обновить оставшуюся ёмкость не удалось. Запросите ещё раз.',
  'admin.accounts.openaiReferral.rejected':
    'Приглашение отклонено. Проверьте email и условия участия в предложении.',
  'admin.accounts.openaiReferral.send': 'Отправить приглашение',
  'admin.accounts.openaiReferral.sendUnknown':
    'Результат приглашения неизвестен. Проверьте его статус в Codex, прежде чем решать, повторять ли отправку.',
  'admin.accounts.openaiReferral.sending': 'Отправка…',
  'admin.accounts.openaiReferral.sent': 'Приглашение отправлено: {email}',
  'admin.accounts.openaiReferral.shadowHint': 'Отправляйте приглашения с родительского аккаунта.',
  'admin.accounts.openaiReferral.unavailable':
    'Приглашения недоступны. Возможно, не выполнены условия участия или достигнут лимит.',
  'admin.accounts.openaiReferral.workspace': 'Пригласить коллегу',
  'admin.accounts.opencodeGo.autoRefresh': 'Автоматическое обновление расхода',
  'admin.accounts.opencodeGo.autoRefreshFailed': 'Не удалось обновить автоматическое обновление расхода',
  'admin.accounts.opencodeGo.autoRefreshHint':
    'Работает, только когда включены и переключатель аккаунта, и глобальный переключатель.',
  'admin.accounts.opencodeGo.errors.OPENCODE_GO_USAGE_REFRESH_RATE_LIMITED':
    'Обновление ограничено. Повторите через {retry_after_seconds} с.',
  'admin.accounts.opencodeGo.failed': 'Ошибка обновления',
  'admin.accounts.opencodeGo.loadFailed': 'Не удалось загрузить настройки расхода OpenCode Go',
  'admin.accounts.opencodeGo.monthly': 'Месяц',
  'admin.accounts.opencodeGo.monthlyShort': '1 мес',
  'admin.accounts.opencodeGo.notRefreshed': 'Не обновлено',
  'admin.accounts.opencodeGo.ok': 'Актуально',
  'admin.accounts.opencodeGo.panelHint':
    'Окна расхода, которые сообщает upstream-аккаунт OpenCode Go. Обновляются по запросу или автоматически, если включено.',
  'admin.accounts.opencodeGo.refreshFailed': 'Не удалось обновить расход OpenCode Go',
  'admin.accounts.opencodeGo.refreshNow': 'Обновить расход',
  'admin.accounts.opencodeGo.refreshSuccess': 'Расход OpenCode Go обновлён',
  'admin.accounts.opencodeGo.rolling': '5 часов',
  'admin.accounts.opencodeGo.rollingShort': '5 ч',
  'admin.accounts.opencodeGo.status': 'Статус',
  'admin.accounts.opencodeGo.title': 'Использование OpenCode Go',
  'admin.accounts.opencodeGo.unauthorized': 'Сессия истекла',
  'admin.accounts.opencodeGo.updatedAt': 'Обновлено',
  'admin.accounts.opencodeGo.weekly': 'Неделя',
  'admin.accounts.opencodeGo.weeklyShort': '7 д',
  'admin.accounts.opencodeGo.windowWithReset': 'Использовано {percent}, сброс {reset}',
  'admin.channels.form.clearReasoningEffortMultipliers': 'Очистить множители',
  'admin.channels.form.reasoningEffortLevelInvalid': 'Неподдерживаемый reasoning effort: {effort}',
  'admin.channels.form.reasoningEffortMultiplierDefault': 'По умолчанию: 1',
  'admin.channels.form.reasoningEffortMultiplierLabel': 'Множитель reasoning effort {effort}',
  'admin.channels.form.reasoningEffortMultiplierPositive':
    'Множитель reasoning effort {effort} должен быть конечным числом больше 0',
  'admin.channels.form.reasoningEffortMultipliers': 'Свои множители Reasoning Effort (необязательно)',
  'admin.channels.form.reasoningEffortMultipliersHint':
    'Применяет множитель итогового пересылаемого reasoning effort ко всей стоимости запроса и расходу квоты. Для ненастроенных уровней используется 1×. Перемножаются с другими множителями биллинга.',
  'admin.availableChannels.pricing.unitPerSecond': '/ секунда',
  'admin.availableChannels.pricing.videoPrice': 'Цена видео',
  'admin.riskControl.activeEngine': 'Активный движок: {engine}',
  'admin.riskControl.auditSource': 'Источник аудита',
  'admin.riskControl.engine': 'Движок аудита',
  'admin.riskControl.engineUnavailable':
    'Нет пригодного ключа для активного движка. API-аудит недоступен; неудачные проверки пропускаются (fail open) согласно действующей политике.',
  'admin.riskControl.legacyAuditSource': 'OpenAI (версия модели аудита не записана)',
  'admin.riskControl.skippedImages': 'Неаудированных изображений: {count}',
  'admin.riskControl.typeSafeNotice':
    'TypeSafe AI аудирует только текст. Изображения не отправляются и не аудируются. Пороги не откалиброваны; смена движка не отключает общие блокировки, уведомления и автоматические баны.',
  'admin.riskControl.typeSafeThresholds':
    'Пороги по умолчанию совпадают с OpenAI, но оценки невзаимозаменяемы. Настройте каждую категорию по фактическим результатам аудита.',
  'admin.affiliates.errors.AFFILIATE_QUOTA_INSUFFICIENT': 'Недостаточно доступной affiliate-квоты',
  'admin.affiliates.errors.AFFILIATE_WITHDRAW_AMOUNT_INVALID': 'Некорректная сумма вывода',
  'admin.affiliates.outflowTypes.transfer': 'На баланс',
  'admin.affiliates.outflowTypes.withdraw': 'Офлайн-вывод',
  'admin.affiliates.records.outflowType': 'Тип',
  'admin.affiliates.withdraw.amount': 'Сумма вывода (USD)',
  'admin.affiliates.withdraw.amountExceeds': 'Сумма не может превышать доступную квоту',
  'admin.affiliates.withdraw.amountHint': 'Введите сумму, уже выплаченную этому пользователю вне сайта',
  'admin.affiliates.withdraw.amountRequired': 'Введите сумму больше 0',
  'admin.affiliates.withdraw.availableQuota': 'Доступная квота',
  'admin.affiliates.withdraw.button': 'Записать офлайн-вывод',
  'admin.affiliates.withdraw.changeUser': 'Сменить пользователя',
  'admin.affiliates.withdraw.fillAll': 'Всё',
  'admin.affiliates.withdraw.frozenHint':
    'Вознаграждения, ещё находящиеся в периоде заморозки, не входят в доступную квоту',
  'admin.affiliates.withdraw.noUserFound': 'Подходящих пользователей не найдено',
  'admin.affiliates.withdraw.replayed':
    'Этот офлайн-вывод {amount} уже был записан и повторно не вычитался; после него доступно оставалось: {remaining}',
  'admin.affiliates.withdraw.submit': 'Подтвердить',
  'admin.affiliates.withdraw.submitting': 'Запись...',
  'admin.affiliates.withdraw.success': 'Записан офлайн-вывод {amount}; доступно осталось: {remaining}',
  'admin.affiliates.withdraw.title': 'Записать офлайн-вывод',
  'admin.affiliates.withdraw.uncertainHint':
    'Последняя отправка не вернула результат и, возможно, уже записана. Пользователь и сумма заблокированы; повторная отправка повторяет ту же регистрацию и никогда не вычитает дважды.',
  'admin.affiliates.withdraw.user': 'Пользователь',
  'admin.affiliates.withdraw.userPlaceholder': 'Поиск по email или имени пользователя',
  'admin.affiliates.withdraw.warning':
    'Запись вычитает эту сумму из доступной affiliate-квоты пользователя и не может быть отменена. Убедитесь, что выплата вне сайта завершена.',
  'availableChannels.pricing.unitPerSecond': '/ секунда',
  'availableChannels.pricing.videoPrice': 'Цена видео',
  'admin.backup.archive.badge': 'Месячный архив',
  'admin.backup.archive.copies': 'копий',
  'admin.backup.archive.count': 'Число хранимых архивов',
  'admin.backup.archive.countHint':
    'Непостоянные архивы по всем выбранным датам считаются вместе; при превышении лимита удаляются самые старые.',
  'admin.backup.archive.dates': 'Даты архивации (можно выбрать несколько)',
  'admin.backup.archive.datesHint':
    'Архивируется первая успешная резервная копия по расписанию для каждой выбранной даты — по дате её начала и часовому поясу расписания.',
  'admin.backup.archive.day': 'День {day}',
  'admin.backup.archive.deleteConfirm':
    'Это месячный архив. Снять защиту архива и безвозвратно удалить эту резервную копию? Действие нельзя отменить.',
  'admin.backup.archive.disabledHint':
    'Отключение останавливает создание новых архивов. Существующие архивы сохраняют прежнюю политику хранения.',
  'admin.backup.archive.done': 'Готово',
  'admin.backup.archive.enabled': 'Включить',
  'admin.backup.archive.fallbackHint':
    'Если в выбранную дату успешной копии нет, используется следующая успешная копия в том же месяце. Пропущенные даты используют конец месяца. Каждая копия учитывается только один раз.',
  'admin.backup.archive.forever': 'Хранить всегда',
  'admin.backup.archive.foreverHint':
    'Хранить все новые архивы постоянно. Существующие постоянные архивы остаются защищёнными после изменения настроек.',
  'admin.backup.archive.independentHint':
    'Архивы переиспользуют резервные копии по расписанию и не учитываются в хранении обычных копий. Архив не создаётся, если в месяце нет более поздней успешной копии.',
  'admin.backup.archive.invalidRetention':
    'Дни и количество хранения должны быть неотрицательными целыми числами. Для непостоянных архивов нужна хотя бы 1 копия.',
  'admin.backup.archive.monthEnd': 'Конец месяца',
  'admin.backup.archive.preview': 'Архивировать одну резервную копию {dates} каждый месяц: {retention}.',
  'admin.backup.archive.retainLatest': 'хранить в сумме последние {count} архивов',
  'admin.backup.archive.retention': 'Хранение архивов',
  'admin.backup.archive.selectDates': 'Выберите хотя бы одну дату архивации',
  'admin.backup.archive.selectedDates': 'Выбрано дат: {count}',
  'admin.backup.archive.title': 'Месячные архивы',
  'admin.backup.schedule.ordinaryHint':
    'Самые старые обычные резервные копии очищаются при достижении любого из лимитов. Месячные архивы хранятся отдельно.',
  'admin.backup.schedule.ordinaryRetention': 'Хранение обычных резервных копий',
  'admin.backup.schedule.preview': 'Предпросмотр хранения',
  'admin.backup.schedule.previewBoth': 'Хранить до {count} обычных резервных копий за последние {days} дней.',
  'admin.backup.schedule.previewCount':
    'Хранить последние {count} обычных резервных копий без лимита по возрасту.',
  'admin.backup.schedule.previewDays':
    'Хранить обычные резервные копии за последние {days} дней без лимита по количеству.',
  'admin.backup.schedule.previewUnlimited': 'Обычные резервные копии не удаляются автоматически.',
  'modelPlaza.table.reasoningMultiplierBadge': '{effort} ×{multiplier}',
  'modelPlaza.table.reasoningMultiplierHint':
    'Если передаваемый reasoning effort равен {effort}, тарификация и расход квоты для запроса умножаются на {multiplier}. Для ненастроенных уровней используется 1×',
  'admin.ops.systemLogs.requestRetentionDays': 'Дней хранения журнала запросов',
  'admin.ops.systemLogs.requestRetentionDaysHint':
    'Записи расхода запросов очищаются каждые 6 часов. Изменения применяются при следующей очистке. Бессрочное хранение записей требует всё больше места.',
  'admin.ops.systemLogs.retentionDaysCustom': 'Свое число дней',
  'admin.ops.systemLogs.retentionDaysInvalid':
    'Храните журналы операций 1–3650 дней; журналы запросов — 1–3650 дней или выберите «Всегда».',
  'admin.ops.systemLogs.retentionDaysOption': '{days} дней',
  'admin.ops.systemLogs.retentionForever': 'Всегда',
  'admin.ops.systemLogs.runtimeConfigLoadFailed':
    'Не удалось загрузить конфигурацию логов. Обновите страницу и попробуйте снова.',
  'admin.settings.gatewayForwarding.claudeCodeClientVersion': 'Версия клиента Claude Code',
  'admin.settings.gatewayForwarding.claudeCodeClientVersionHint':
    'Версия клиента, которую этот шлюз объявляет upstream, impersonируя официальный Claude Code CLI. Оставьте пустым, чтобы использовать автоматически синхронизируемую последнюю официальную версию; заданное значение фиксирует её и прекращает отслеживание авто-синхронизации. Переменная окружения SUB2API_CLAUDE_CLI_VERSION или встроенная версия используется, только когда недействительны и ручное, и синхронизированное значения.',
  'admin.settings.gatewayForwarding.claudeCodeVersionAutoSync': 'Авто-синхронизация версии Claude Code',
  'admin.settings.gatewayForwarding.claudeCodeVersionAutoSyncHint':
    'Каждый час получает последнюю версию клиента Claude Code из официального канала релизов, поэтому не нужно обновлять этот сервис только ради актуальной версии. Когда выключено, получение прекращается, но ранее синхронизированная версия остаётся доступной. Ручная версия выше всегда имеет приоритет.',
  'admin.settings.gatewayForwarding.claudeCodeVersionSyncedValue': 'Сейчас синхронизировано: {version}',
  'admin.settings.openaiExperimentalScheduler.oauthRateInvalid':
    'Опорный тариф планирования OAuth должен быть неотрицательным числом или пустым — тогда используются тарифы аккаунтов.',
  'admin.settings.opencodeGoUsage.debounceHint':
    'Диапазон: 1–60 минут, должно быть меньше интервала обновления. Обновление выполняется после того, как последний запрос к модели затих на это время.',
  'admin.settings.opencodeGoUsage.debounceMinutes': 'Тихий период после последнего запроса (минуты)',
  'admin.settings.opencodeGoUsage.description':
    'Обновляет окна расхода, которые сообщает upstream-аккаунт OpenCode Go, для аккаунтов с индивидуально включённой опцией. По умолчанию выключено.',
  'admin.settings.opencodeGoUsage.enabled': 'Включить глобальное автоматическое обновление',
  'admin.settings.opencodeGoUsage.enabledHint':
    'Обновляются только аккаунты с включённым собственным переключателем автоматического обновления. Ручное обновление остаётся доступным.',
  'admin.settings.opencodeGoUsage.intervalHint':
    'Диапазон: 5–1440 минут. Если непрерывные запросы продолжают сдвигать debounce, принудительно обновлять после этого ожидания.',
  'admin.settings.opencodeGoUsage.intervalMinutes':
    'Максимальное ожидание при продолжающихся запросах (минуты)',
  'admin.settings.opencodeGoUsage.saveFailed':
    'Не удалось сохранить настройки обновления расхода OpenCode Go',
  'admin.settings.opencodeGoUsage.saved': 'Настройки обновления расхода OpenCode Go сохранены',
  'admin.settings.opencodeGoUsage.title': 'Обновление расхода OpenCode Go',
}

const expectedModified: Record<string, string> = {
  'admin.accounts.openaiQuotaReset.count': 'Сбросы',
  'admin.accounts.openaiQuotaReset.countTooltipLoad':
    'Нажмите, чтобы загрузить доступное число reset-кредитов и баланс баллов',
  'admin.accounts.openaiQuotaReset.countTooltipRefresh':
    'Нажмите, чтобы обновить доступное число reset-кредитов и баланс баллов',
  'admin.accounts.openaiQuotaReset.resetTooltipNeedQuery':
    'Сначала нажмите «Сбросы», чтобы загрузить доступное число',
  'admin.channels.form.multiplierPositive':
    'Fast/Flex multipliers (множители tier-ов) должны быть конечными числами больше 0',
  'admin.riskControl.apiKey': 'API Key',
  'admin.riskControl.apiKeyTestFailed': 'Не удалось проверить API-ключи аудита',
  'admin.riskControl.apiKeyTestNoInput': 'Сначала введите API-ключи для проверки',
  'admin.riskControl.apiKeys': 'API Keys',
  'admin.riskControl.baseUrl': 'Base URL',
  'admin.riskControl.configHint':
    'Используйте выбранный движок аудита для оценки контента запроса и обработки срабатываний порогов по режиму.',
  'admin.riskControl.proxyHint':
    'Отправлять запросы аудита через выбранный прокси (Управление IP — Прокси-серверы). По умолчанию используется прямое подключение.',
  'admin.riskControl.riskThresholdsHint':
    'Настройте пороги категорий для выбранного движка. Оценки больше или равные порогу считаются срабатываниями.',
  'admin.affiliates.rebatesDescription':
    'Просмотр всех начислений affiliate-вознаграждений с заказов пополнения, кодов активации и пополнений администратором',
  'admin.affiliates.transfersDescription': 'Просмотр переводов affiliate-квоты на баланс и офлайн-выводов',
  'admin.backup.schedule.retainCountHint':
    'Максимальное число хранимых обычных резервных копий; 0 = без лимита по количеству',
  'admin.backup.schedule.retainDaysHint':
    'Обычные резервные копии удаляются через указанное число дней; 0 = без лимита по возрасту',
  'admin.ops.systemLogs.retentionDays': 'Дней хранения журнала операций',
  'admin.ops.systemLogs.retentionDaysHint':
    'Применяется по расписанию очистки данных, когда очистка включена в настройках операций.',
  'admin.settings.openaiExperimentalScheduler.oauthRatePriorityDescription':
    'OAuth-аккаунты используют этот опорный тариф для упорядочения «сначала низкий тариф». Оставьте пустым, чтобы использовать собственный тариф каждого аккаунта. API Key аккаунты используют действительный обнаруженный (probed) тариф, если он есть, иначе — тариф аккаунта.',
  'admin.settings.openaiExperimentalScheduler.oauthRateWeightedDescription':
    'OAuth-аккаунты используют этот опорный тариф для оценки по тарифу биллинга. Оставьте пустым, чтобы использовать собственный тариф каждого аккаунта. API Key аккаунты используют действительный обнаруженный (probed) тариф, если он есть, иначе — тариф аккаунта.',
}

describe('Russian v0.2.8 upstream locale delta', () => {
  it('translates every added source leaf with reviewed semantics', () => {
    expect(Object.keys(expectedAdded)).toHaveLength(150)
    for (const [path, expected] of Object.entries(expectedAdded)) {
      expect.soft(readPath(ru, path), path).toBe(expected)
    }
  })

  it('updates every modified-existing source leaf with reviewed semantics', () => {
    expect(Object.keys(expectedModified)).toHaveLength(21)
    for (const [path, expected] of Object.entries(expectedModified)) {
      expect.soft(readPath(ru, path), path).toBe(expected)
    }
  })

  it('removes the deleted reasoning-effort multiplier keys', () => {
    expect(readPath(ru, 'admin.channels.form.fable51DefaultMaxReasoningMultiplier')).toBeUndefined()
    expect(readPath(ru, 'admin.channels.form.maxReasoningEffortMultiplier')).toBeUndefined()
    expect(readPath(ru, 'modelPlaza.table.maxReasoningMultiplierBadge')).toBeUndefined()
    expect(readPath(ru, 'modelPlaza.table.maxReasoningMultiplierHint')).toBeUndefined()
  })

  it('renames quota reset count from credits to resets with points alongside', () => {
    const quota = ru.admin.accounts.openaiQuotaReset
    expect(quota.count).toBe('Сбросы')
    expect(quota.points).toBe('Баллы')
    expect(quota.count).not.toBe('Кредиты')
    expect(quota.resetTooltipNeedQuery).toContain('«Сбросы»')
    expect(quota.resetTooltipNeedQuery).not.toContain('«Кредиты»')
    expect(quota.countTooltipLoad).toContain('баланс баллов')
    expect(quota.countTooltipRefresh).toContain('баланс баллов')
  })

  it('describes risk control via the selected audit engine instead of OpenAI Moderations', () => {
    const rc = ru.admin.riskControl
    expect(rc.engine).toBe('Движок аудита')
    expect(rc.configHint).toContain('выбранный движок аудита')
    expect(rc.configHint).not.toContain('OpenAI Moderations')
    expect(rc.riskThresholdsHint).toContain('выбранного движка')
    expect(rc.riskThresholdsHint).not.toContain('OpenAI Moderations')
    expect(rc.apiKey).toBe('API Key')
    expect(rc.apiKeys).toBe('API Keys')
    expect(rc.baseUrl).toBe('Base URL')
    expect(rc.apiKeyTestNoInput).not.toContain('OpenAI')
    expect(rc.apiKeyTestFailed).not.toContain('OpenAI')
    expect(rc.proxyHint).not.toContain('OpenAI')
  })

  it('covers opencodeGo usage windows and openaiReferral invitations', () => {
    const go = ru.admin.accounts.opencodeGo
    expect(go.windowWithReset).toBe('Использовано {percent}, сброс {reset}')
    expect(go.rollingShort).toBe('5 ч')
    expect(go.weeklyShort).toBe('7 д')
    expect(go.monthlyShort).toBe('1 мес')
    expect(go.errors.OPENCODE_GO_USAGE_REFRESH_RATE_LIMITED).toContain('{retry_after_seconds}')
    const ref = ru.admin.accounts.openaiReferral
    expect(ref.sent).toBe('Приглашение отправлено: {email}')
    expect(ref.checkedAt).toContain('{time}')
  })

  it('distinguishes ordinary backups from monthly archives in retention copy', () => {
    const schedule = ru.admin.backup.schedule
    expect(schedule.retainCountHint).toContain('обычных резервных копий')
    expect(schedule.retainDaysHint).toContain('Обычные резервные копии')
    expect(schedule.ordinaryHint).toContain('Месячные архивы хранятся отдельно')
    const archive = ru.admin.backup.archive
    expect(archive.badge).toBe('Месячный архив')
    expect(archive.independentHint).toContain('не учитываются в хранении обычных копий')
  })

  it('separates operations and request log retention', () => {
    const logs = ru.admin.ops.systemLogs
    expect(logs.retentionDays).toBe('Дней хранения журнала операций')
    expect(logs.requestRetentionDays).toBe('Дней хранения журнала запросов')
    expect(logs.retentionForever).toBe('Всегда')
  })

  it('describes the OAuth scheduling reference rate for both policies', () => {
    const scheduler = ru.admin.settings.openaiExperimentalScheduler
    expect(scheduler.oauthRatePriorityDescription).toContain('опорный тариф')
    expect(scheduler.oauthRatePriorityDescription).toContain('probed')
    expect(scheduler.oauthRateWeightedDescription).toContain('опорный тариф')
    expect(scheduler.oauthRateWeightedDescription).toContain('probed')
    expect(scheduler.oauthRateInvalid).toContain('неотрицательным числом')
  })
})
