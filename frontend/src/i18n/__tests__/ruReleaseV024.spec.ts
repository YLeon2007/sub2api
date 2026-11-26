import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import ru from '../locales/ru'

const { t } = createI18n({ legacy: false, locale: 'ru', messages: { ru } }).global

// These messages are consumed by the account menu, the accounts/settings pages,
// the catalog's accessible copy button and the usage-window progress bar.
describe('Russian operator copy for v0.2.24', () => {
  it('warns about concurrent token rotation without presenting the warning as a lockout', () => {
    expect(t('admin.accounts.refreshTokenHint')).toMatch(/автоматически.*частое ручное.*недействительным.*приостановке/i)
    expect(t('admin.accounts.refreshTokenFrequentWarning')).toMatch(/меньше минуты.*фоновым.*недействительным.*только при необходимости/i)
  })

  it('keeps the exact catalog model ID and distinguishes estimated from actual spend', () => {
    expect(t('modelPlaza.table.copyModelId', { model: 'vendor/model:latest' })).toBe('Скопировать ID модели vendor/model:latest')
    expect(t('admin.accounts.usageWindow.estimatedTotalCost', { cost: '24.50' })).toBe('Оценка итого: $24.50')
    expect(t('admin.accounts.usageWindow.estimatedTotalCostTooltip')).toContain('при 100% использования')
    expect(t('admin.accounts.usageWindow.fiveHourLabel')).toBe('5 ч')
    expect(t('admin.accounts.usageWindow.sevenDayLabel')).toBe('7 д')
  })

  it('describes the current quota, cache and OpenAI tier scope', () => {
    expect(t('admin.settings.defaults.defaultPlatformQuotas')).toContain('при создании пользователя')
    expect(t('admin.settings.defaults.defaultPlatformQuotasHint')).toMatch(/администратор.*регистрируются.*существующих.*нет лимита/i)
    expect(t('admin.settings.gatewayForwarding.anthropicCacheTTL1hInjectionHint')).toMatch(/1h.*Claude Code.*5m.*по умолчанию.*5m.*приоритет/i)
    expect(t('admin.groups.openaiFast.ultrafastHint')).toContain('service_tier=ultrafast')
  })
})
