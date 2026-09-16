import { describe, expect, it } from 'vitest'

import ru from '../locales/ru'

function leaf(path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (!value || typeof value !== 'object') return undefined
    return (value as Record<string, unknown>)[key]
  }, ru)
}

const expectedAddedLeaves = [
  ['admin.accounts.grokMediaEligibility.auto', 'Автоматическое определение'],
  [
    'admin.accounts.grokMediaEligibility.autoHint',
    'Автоматическое определение только удаляет ручное переопределение и не отправляет запрос на генерацию медиа.'
  ],
  ['admin.accounts.grokMediaEligibility.current', 'Текущее решение:'],
  ['admin.accounts.grokMediaEligibility.disabled', 'Принудительно отключить'],
  ['admin.accounts.grokMediaEligibility.eligible', 'Доступно'],
  ['admin.accounts.grokMediaEligibility.enabled', 'Принудительно включить'],
  [
    'admin.accounts.grokMediaEligibility.forceEnableWarning',
    'Принудительное включение обходит автоматические проверки доступности. Используйте только для аккаунтов с подтверждённой поддержкой генерации изображений и видео.'
  ],
  [
    'admin.accounts.grokMediaEligibility.hint',
    'Определяет, можно ли выбирать этот аккаунт Grok OAuth для генерации изображений и видео.'
  ],
  ['admin.accounts.grokMediaEligibility.ineligible', 'Недоступно'],
  [
    'admin.accounts.grokMediaEligibility.loadFailed',
    'Не удалось загрузить данные о доступности генерации медиа'
  ],
  ['admin.accounts.grokMediaEligibility.loading', 'Загрузка данных о доступности…'],
  [
    'admin.accounts.grokMediaEligibility.partialSave',
    'Другие настройки аккаунта могли сохраниться, но доступ к генерации медиа не обновлён. Повторите попытку.'
  ],
  [
    'admin.accounts.grokMediaEligibility.reasons.billing_forbidden',
    'Endpoint биллинга запретил доступ'
  ],
  [
    'admin.accounts.grokMediaEligibility.reasons.billing_free_tier',
    'Аккаунт бесплатного уровня'
  ],
  [
    'admin.accounts.grokMediaEligibility.reasons.billing_inconclusive',
    'Недостаточно данных о биллинге'
  ],
  [
    'admin.accounts.grokMediaEligibility.reasons.billing_unobserved',
    'Данные биллинга ещё не получены'
  ],
  [
    'admin.accounts.grokMediaEligibility.reasons.eligible',
    'Подтверждено платное право доступа'
  ],
  [
    'admin.accounts.grokMediaEligibility.reasons.override_disabled',
    'Принудительно отключено вручную'
  ],
  [
    'admin.accounts.grokMediaEligibility.reasons.override_enabled',
    'Принудительно включено вручную'
  ],
  ['admin.accounts.grokMediaEligibility.title', 'Доступ к генерации медиа'],
  ['admin.accounts.platforms.minimax', 'MiniMax'],
  ['admin.accounts.usageWindow.estimatedTotalCost', 'Оценка итого: ${cost}'],
  [
    'admin.accounts.usageWindow.estimatedTotalCostTooltip',
    'Оценка общей стоимости при 100% использования на основе текущих затрат и доли использования окна'
  ],
  ['admin.groups.platforms.minimax', 'MiniMax'],
  ['admin.ops.systemLogs.persistAccessLogs', 'Сохранять журналы доступа в базе данных'],
  [
    'admin.ops.systemLogs.persistAccessLogsHint',
    'По умолчанию выключено, поскольку журналы доступа добавляют по одной индексированной строке в базу данных на каждый запрос. Предупреждения, ошибки и записи аудита сохраняются всегда.'
  ],
  [
    'admin.ops.systemLogs.retentionDaysHint',
    'Применяется плановым заданием очистки данных.'
  ],
  [
    'admin.settings.features.channelMonitor.hideUserRanking',
    'Скрыть рейтинг пользователей в пользовательском интерфейсе'
  ],
  [
    'admin.settings.features.channelMonitor.hideUserRankingHint',
    'Когда включено, на пользовательской странице «Мониторинг каналов V2» скрывается вкладка рейтинга пользователей, а пользовательский API не возвращает строки рейтинга. Администраторы по-прежнему видят рейтинг.'
  ],
  [
    'keys.useKeyModal.minimax.codexConfigTomlHint',
    'Скачайте каталог моделей ниже, сохраните оба файла в каталоге конфигурации Codex и перезапустите Codex.'
  ],
  [
    'keys.useKeyModal.minimax.codexDescription',
    'Настройте Codex с аутентификацией по API-ключу для работы через текущую группу MiniMax.'
  ],
  [
    'keys.useKeyModal.minimax.codexNote',
    'Перед запуском Codex экспортируйте SUB2API_API_KEY. Скачанный каталог содержит только метаданные моделей, но не API-ключ.'
  ],
  [
    'keys.useKeyModal.minimax.description',
    'Настройте Claude Code, Codex или OpenCode для работы через текущую группу MiniMax.'
  ],
  ['monitorCommon.providers.minimax', 'MiniMax']
] as const

describe('Russian v0.2.4 upstream locale delta', () => {
  it('translates every added English leaf with reviewed Russian semantics', () => {
    expect(expectedAddedLeaves).toHaveLength(34)
    for (const [path, expected] of expectedAddedLeaves) {
      expect(leaf(path), path).toBe(expected)
    }
  })
})
