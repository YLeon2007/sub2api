import { describe, expect, it } from 'vitest'

import en from '../locales/en'
import zh from '../locales/zh'
import ru, { ruOverrides } from '../locales/ru'

function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[key]
  }, value)
}

// Exactly the 16 leaves introduced in the upstream v0.2.9 → v0.2.10 EN/ZH delta.
const expectedAdded: Record<string, string> = {
  'admin.accounts.claudeResetCredits.clears': 'Сбрасываемые окна: {windows}',
  'admin.accounts.claudeResetCredits.cooldown': 'Период ожидания до {time}',
  'admin.accounts.claudeResetCredits.count': 'Сбросы',
  'admin.accounts.claudeResetCredits.countTooltipLoad':
    'Проверить оставшиеся сбросы Claude (только чтение, ни один reset-кредит не расходуется)',
  'admin.accounts.claudeResetCredits.countTooltipRefresh':
    'Обновить число оставшихся сбросов Claude (только чтение, ни один reset-кредит не расходуется)',
  'admin.accounts.claudeResetCredits.error': 'Не удалось проверить reset-кредиты',
  'admin.accounts.claudeResetCredits.expiresAt': 'Истекает {time}',
  'admin.accounts.claudeResetCredits.expiresAtFull': 'Reset-кредит истекает: {time}',
  'admin.accounts.claudeResetCredits.fetched': 'Проверено: {time}',
  'admin.accounts.claudeResetCredits.ineligible': 'Сейчас этот аккаунт не может использовать сбросы',
  'admin.accounts.claudeResetCredits.notUsableNow': 'Сейчас недоступен',
  'admin.accounts.claudeResetCredits.requiresLimit': 'Можно использовать только после достижения лимита',
  'admin.accounts.modelMappingConflict':
    'Для {from} → {to} уже есть сопоставление. Измените или удалите его в разделе «Сопоставление моделей», прежде чем добавлять эту модель в разрешённый список',
  'admin.dashboard.actualSpending': 'Фактический расход ($)',
  'admin.settings.features.riskControl.riskControlUserAllowlist':
    'Разрешённый список пользователей риск-контроля',
  'admin.settings.features.riskControl.riskControlUserAllowlistHint':
    'Введите любую часть email-адреса для поиска пользователей. Для пользователей из разрешённого списка не срабатывают автобан и локальная блокировка, но ограничения upstream продолжают действовать. Обычно используется для доверенных шлюзов нижнего уровня.'
}

describe('Russian v0.2.10 upstream locale delta', () => {
  it('explicitly translates exactly the 16 added EN/ZH source leaves', () => {
    expect(ru).toBe(ruOverrides)
    expect(Object.keys(expectedAdded)).toHaveLength(16)
    for (const [path, expected] of Object.entries(expectedAdded)) {
      expect.soft(typeof readPath(en, path), `EN ${path}`).toBe('string')
      expect.soft(typeof readPath(zh, path), `ZH ${path}`).toBe('string')
      expect.soft(readPath(ruOverrides, path), `RU ${path}`).toBe(expected)
    }
  })

  it('retains the read-only reset query, eligibility, expiry and cooldown qualifications', () => {
    const reset = ruOverrides.admin.accounts.claudeResetCredits
    expect(reset.countTooltipLoad).toContain('только чтение')
    expect(reset.countTooltipRefresh).toContain('только чтение')
    expect(reset.countTooltipLoad).toContain('не расходуется')
    expect(reset.countTooltipRefresh).toContain('не расходуется')
    expect(reset.requiresLimit).toContain('только после достижения лимита')
    expect(reset.ineligible).toContain('Сейчас')
    expect(reset.cooldown).toContain('{time}')
    expect(reset.expiresAtFull).toContain('{time}')
    expect(reset.clears).toContain('{windows}')
  })

  it('keeps allowlist scope and mapping conflict distinct from upstream restrictions', () => {
    const hint = ruOverrides.admin.settings.features.riskControl.riskControlUserAllowlistHint
    expect(hint).toContain('часть email-адреса')
    expect(hint).toContain('автобан и локальная блокировка')
    expect(hint).toContain('ограничения upstream продолжают действовать')
    expect(hint).toContain('доверенных шлюзов нижнего уровня')
    const conflict = ruOverrides.admin.accounts.modelMappingConflict
    expect(conflict).toContain('{from} → {to}')
    expect(conflict).toContain('прежде чем добавлять эту модель в разрешённый список')
    expect(ruOverrides.admin.dashboard.actualSpending).toBe('Фактический расход ($)')
  })
})
