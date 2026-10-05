import { describe, expect, it } from 'vitest'

import ru from '../locales/ru'

function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[key]
  }, value)
}

const expectedAdded: Record<string, string> = {
  'admin.accounts.cnProviders.windowMonthly': '30 дн.',
  'admin.accounts.openai.wsModeCtxPoolHint':
    'Шлюз получает и повторно использует upstream WS-соединения из пула; лимит пула определяется конфигурацией шлюза.',
  'admin.accounts.openai.wsModeHttpBridgeHint':
    'Шлюз преобразует клиентские WS-запросы в upstream HTTP-запросы, а потоковые SSE-ответы — обратно в WS-сообщения.',
  'admin.accounts.opencodeGo.accountMode.go': 'GO',
  'admin.accounts.opencodeGo.accountMode.goDesc':
    'Шлюз по подписке с лимитами расхода в 5-часовом, недельном и месячном окнах.',
  'admin.accounts.opencodeGo.accountMode.zen': 'Zen',
  'admin.accounts.opencodeGo.accountMode.zenDesc':
    'Шлюз с оплатой по мере использования. Расходует средства аккаунта, тарификация — за токены.',
  'admin.accounts.opencodeGo.protocolRules.add': 'Добавить правило',
  'admin.accounts.opencodeGo.protocolRules.fallback':
    'Несопоставленные модели → Chat Completions (/v1/chat/completions)',
  'admin.accounts.opencodeGo.protocolRules.hint':
    'В адаптивном режиме каждая модель отправляется по нативному upstream-протоколу. Укажите точный ID или glob с * в конце (например, grok-* или qwen*). Применяется первое совпавшее правило; для несопоставленных моделей используется Chat Completions.',
  'admin.accounts.opencodeGo.protocolRules.patternPlaceholder': 'grok-* или deepseek-v4-flash',
  'admin.accounts.opencodeGo.protocolRules.remove': 'Удалить правило',
  'admin.accounts.opencodeGo.protocolRules.restoreDefaults': 'Восстановить значения по умолчанию',
  'admin.accounts.opencodeGo.protocolRules.title': 'Маршрутизация протокола модели',
  'admin.accounts.platforms.opencode_go': 'OpenCode',
  'admin.groups.platforms.opencode_go': 'OpenCode',
  'admin.settings.customMenu.hideOpenButton': 'Скрыть кнопку «Открыть в новой вкладке»',
  'admin.settings.features.siteBillingMode.description':
    'Определяет доступные пользователям варианты покупки. По умолчанию — «Пополнение и подписка».',
  'admin.settings.features.siteBillingMode.hints.rechargeAndSubscription':
    'Пользователи могут пополнять баланс и покупать планы подписки.',
  'admin.settings.features.siteBillingMode.hints.rechargeOnly':
    'Скрывает «Мои подписки», вкладку подписки на странице покупки, значок подписки в шапке и фильтр типа биллинга в расходе; прямой переход в «Мои подписки» возвращает на панель. В боковом меню администратора также скрывается «Управление подписками» (страница остаётся доступна по URL). Существующий биллинг подписок и подписки по кодам активации не затрагиваются.',
  'admin.settings.features.siteBillingMode.hints.subscriptionOnly':
    'На странице покупки доступны только планы подписки, а пункт бокового меню называется «Подписка»; заказы на пополнение баланса отклоняются. Коды активации, партнёрские выплаты и другие зачисления на баланс не затрагиваются.',
  'admin.settings.features.siteBillingMode.label': 'Варианты покупки',
  'admin.settings.features.siteBillingMode.options.rechargeAndSubscription': 'Пополнение и подписка',
  'admin.settings.features.siteBillingMode.options.rechargeOnly': 'Только пополнение',
  'admin.settings.features.siteBillingMode.options.subscriptionOnly': 'Только подписка',
  'admin.settings.features.siteBillingMode.title': 'Режим биллинга сайта',
  'admin.settings.openaiFastPolicy.tierMissing': 'Tier не указан',
  'admin.subscriptions.batchAssign.enable': 'Назначить нескольким пользователям',
  'admin.subscriptions.batchAssign.hint':
    'Найдите и добавьте до 100 пользователей, чтобы назначить им одну группу и срок действия.',
  'admin.subscriptions.batchAssign.removeUser': 'Удалить {email}',
  'admin.subscriptions.batchAssign.result':
    'Назначение завершено: успешно — {success}, с ошибкой — {failed}',
  'admin.subscriptions.batchAssign.retryHint':
    'Успешно обработанные пользователи удалены из списка. Исправьте ошибки и снова отправьте оставшихся пользователей.',
  'admin.subscriptions.batchAssign.selected': 'Добавлено пользователей: {count}',
  'admin.subscriptions.bulk.clearSelection': 'Очистить выбор',
  'admin.subscriptions.bulk.confirm': 'Подтвердить действие',
  'admin.subscriptions.bulk.confirmTargets': 'Действие обработает следующие подписки ({count})',
  'admin.subscriptions.bulk.extend': 'Массово изменить срок действия',
  'admin.subscriptions.bulk.extendHint':
    'Введите положительное целое число для продления или отрицательное для сокращения, максимум 36500 дней. Истёкшие подписки продлеваются от текущего момента и не могут быть сокращены. Новый срок действия должен быть в будущем.',
  'admin.subscriptions.bulk.groupFallback': 'Группа #{id}',
  'admin.subscriptions.bulk.invalidDays':
    'Введите ненулевое целое число дней от -36500 до 36500',
  'admin.subscriptions.bulk.itemFailed': 'Не удалось выполнить действие',
  'admin.subscriptions.bulk.requestFailed': 'Массовый запрос завершился ошибкой. Повторите попытку.',
  'admin.subscriptions.bulk.resetHint':
    'Расход в выбранных окнах будет обнулён и начнёт учитываться заново с сегодняшнего дня.',
  'admin.subscriptions.bulk.resetWindows': 'Выберите окна квоты для сброса',
  'admin.subscriptions.bulk.reset_quota': 'Массово сбросить квоту',
  'admin.subscriptions.bulk.restore': 'Массово восстановить',
  'admin.subscriptions.bulk.restoreHint':
    'Эти подписки будут снова включены. Подписки, исходный срок действия которых закончился, восстановятся как истёкшие.',
  'admin.subscriptions.bulk.result': 'Завершено: успешно — {success}, с ошибкой — {failed}',
  'admin.subscriptions.bulk.retry': 'Повторить исходное действие',
  'admin.subscriptions.bulk.retryHint':
    'Результат ещё не подтверждён. Повтор продолжит исходную операцию и не создаст дублирующих изменений. Можно также закрыть диалог, затем снова выбрать те же подписки и настройки.',
  'admin.subscriptions.bulk.revoke': 'Массово отозвать',
  'admin.subscriptions.bulk.revokeHint':
    'Эти подписки станут недоступны. Позже их можно восстановить из списка отозванных.',
  'admin.subscriptions.bulk.selectSubscription': 'Выбрать подписку #{id}',
  'admin.subscriptions.bulk.selectWindow': 'Выберите хотя бы одно окно квоты',
  'admin.subscriptions.bulk.selected': 'Выбрано подписок: {count}',
  'admin.subscriptions.bulk.selectionHint':
    'На этой странице можно выбрать до 100 подписок. При смене страницы или фильтров выбор сбрасывается. Каждое действие обрабатывает только подписки с подходящим статусом.',
  'admin.subscriptions.bulk.selectionLimit': 'За один раз можно обработать до 100 подписок',
  'admin.subscriptions.bulk.selectionRequired': 'Выберите хотя бы одну подписку',
  'admin.users.bulkDelete.action': 'Удалить выбранных ({count})',
  'admin.users.bulkDelete.confirm':
    'Удалить выбранных пользователей ({count})? Это действие нельзя отменить. Аккаунты администраторов удалить нельзя.',
  'admin.users.bulkDelete.failed':
    'Не удалось удалить пользователей: {count}. Они остаются выбранными для повторной попытки.',
  'admin.users.bulkDelete.success': 'Удалено пользователей: {count}',
  'admin.users.bulkDelete.title': 'Удалить выбранных пользователей',
  'admin.users.platformQuota.reset.unavailable':
    'Для этой платформы лимит не задан, поэтому сбрасывать окно расхода нечего',
  'keyUsage.billingType': 'Тип биллинга',
  'keys.bulkEdit.apply': 'Применить к ключам ({count})',
  'keys.bulkEdit.clearSelection': 'Очистить выбор',
  'keys.bulkEdit.failureHint':
    'Не удалось обновить эти ключи. Измените настройки и повторите попытку. Повторно обрабатываются только ключи с ошибкой.',
  'keys.bulkEdit.hint':
    'Отметьте поля, которые нужно обновить. В неотмеченных полях сохранятся текущие значения.',
  'keys.bulkEdit.invalidExpiration':
    'Выберите корректную дату истечения или вариант «Никогда».',
  'keys.bulkEdit.invalidLimit': 'Введите корректное значение не меньше 0.',
  'keys.bulkEdit.ipHint':
    'Один IP или CIDR на строку. Оставьте пустым, чтобы очистить этот список у выбранных ключей.',
  'keys.bulkEdit.limitHint': 'Введите 0, чтобы снять лимит. Текущий расход сохранится.',
  'keys.bulkEdit.partialFailure': 'Обновлено ключей: {success}; с ошибкой: {failed}',
  'keys.bulkEdit.selectKey': 'Выбрать ключ {name}',
  'keys.bulkEdit.selectedCount': 'Выбрано ключей: {count}',
  'keys.bulkEdit.success': 'Обновлено ключей: {count}',
  'keys.bulkEdit.title': 'Массовое изменение',
  'keys.providerHints.anthropic': 'Выберите доступную группу Anthropic / Claude',
  'keys.providerHints.domestic': 'Включает DeepSeek, Kimi, Zhipu GLM и MiniMax',
  'keys.providerHints.openai': 'Выберите доступную группу OpenAI / GPT',
  'keys.providerHints.other': 'Включает Gemini, Grok, Antigravity, OpenCode и смешанные группы',
  'keys.providerLabel': 'Провайдер',
  'keys.providers.anthropic': 'Anthropic',
  'keys.providers.domestic': 'Китайские AI',
  'keys.providers.openai': 'OpenAI',
  'keys.providers.other': 'Другие',
  'monitorCommon.providers.opencode_go': 'OpenCode',
  'monitorCommon.quota.windows.monthly': 'Месяц',
  'nav.recharge': 'Пополнение',
  'nav.subscribe': 'Подписка',
  'payment.billingUnavailable':
    'Сейчас недоступны ни пополнение, ни подписки. Обратитесь к администратору.',
  'purchase.rechargeDescription': 'Пополнить баланс на встроенной странице',
  'purchase.subscriptionDescription': 'Купить подписку на встроенной странице',
  'redeem.userRefreshFailed':
    'Код успешно активирован, но не удалось обновить данные аккаунта.',
}

const expectedModified: Record<string, string> = {
  'admin.accounts.openai.wsModeDesc':
    'Применяется только к текущему типу аккаунта OpenAI. Выберите «Выкл.», чтобы отключить WS. Другие режимы используют выбранный способ соединения, только когда gateway.openai_ws.mode_router_v2_enabled=true; иначе используется пул контекста.',
  'admin.accounts.openai.wsModePassthroughHint':
    'Шлюз открывает отдельное upstream WS-соединение для каждой клиентской сессии, не используя пул соединений.',
  'admin.ops.openaiTokenStats.empty': 'Нет статистики запросов токенов для текущих фильтров',
  'admin.ops.openaiTokenStats.failedToLoad': 'Не удалось загрузить статистику запросов токенов',
  'admin.ops.openaiTokenStats.title': 'Статистика запросов токенов',
  'admin.ops.settings.displayOpenAITokenStats': 'Показывать статистику запросов токенов',
  'admin.ops.settings.displayOpenAITokenStatsHint':
    'Показывать статистику запросов токенов по моделям для всех платформ с фильтрами по платформе и группе. По умолчанию скрыто.',
  'admin.riskControl.processed': 'Обработано асинхронно',
  'admin.settings.defaults.defaultPlatformQuotasHint':
    'Применяется к новым пользователям при регистрации; существующих пользователей не затрагивает. Пусто = нет лимита для этой платформы и окна.',
  'admin.settings.openaiFastPolicy.description':
    'Перехватывает, фильтрует или пропускает запросы OpenAI fast(priority), ultrafast или flex на основе поля service_tier в теле запроса. Применяется только к шлюзу OpenAI. «Все значения tier» включает только явно переданные tier.',
  'admin.settings.payment.validationEasyPayCustomMethodUpstreamTypeInvalid':
    'EasyPay upstream types могут содержать только строчные буквы, цифры, точки, подчёркивания и дефисы',
}

describe('Russian v0.2.5 upstream locale delta', () => {
  it('translates every added source leaf with reviewed semantics', () => {
    expect(Object.keys(expectedAdded)).toHaveLength(95)
    for (const [path, expected] of Object.entries(expectedAdded)) {
      expect.soft(readPath(ru, path), path).toBe(expected)
    }
  })

  it('updates every modified-existing source leaf with reviewed semantics', () => {
    expect(Object.keys(expectedModified)).toHaveLength(11)
    for (const [path, expected] of Object.entries(expectedModified)) {
      expect.soft(readPath(ru, path), path).toBe(expected)
    }
  })

  it('removes the deleted WS concurrency hint', () => {
    expect(readPath(ru, 'admin.accounts.openai.wsModeConcurrencyHint')).toBeUndefined()
  })
})
