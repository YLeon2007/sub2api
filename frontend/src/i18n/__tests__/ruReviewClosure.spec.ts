import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import en from '../locales/en'
import zh from '../locales/zh'
import ru from '../locales/ru'

const source = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

describe('Russian release review closure', () => {
  it('translates active account status presets and scheduled-test controls', () => {
    expect(ru.admin.accounts.tempUnschedulable.presets.overloadLabel).toBe('529 Перегрузка')
    expect(ru.admin.accounts.tempUnschedulable.presets.rateLimitLabel).toBe('429 Ограничение частоты')
    expect(ru.admin.accounts.tempUnschedulable.presets.unavailableLabel).toBe('503 Недоступен')
    expect(ru.admin.accounts.openai.testModeCompact).toBe('Проверка compact')
    expect(ru.admin.accounts.openai.compactAuto).toBe('Compact: авто')
    expect(ru.admin.accounts.openai.compactUnknown).toBe('Compact: авто')
    expect(ru.admin.accounts.openai.compactLastChecked).toBe('Последняя проверка compact')
    expect(ru.admin.scheduledTests.cronExpression).toBe('Выражение cron')
  })

  it('binds shared select and toast accessibility labels to translated common keys', () => {
    expect(ru.common.selectOption).toBe('Выберите вариант')
    expect(ru.common.clear).toBe('Очистить')
    expect(ru.common.close).toBe('Закрыть')
    const select = source('src/components/common/Select.vue')
    const toast = source('src/components/common/Toast.vue')
    expect(select).toContain(":aria-label=\"ariaLabel ?? t('common.selectOption')\"")
    expect(select).toContain(":aria-label=\"t('common.clear')\"")
    expect(toast).toContain(":aria-label=\"t('common.close')\"")
    expect(select).not.toContain('aria-label="Clear selection"')
    expect(toast).not.toContain('aria-label="Close notification"')
  })

  it('localizes active payment and scheduler controls without changing machine values', () => {
    const payment = ru.admin.settings.payment
    expect(payment.modeRedirect).toBe('Перенаправление')
    expect(payment.modeQRCode).toBe('QR-код')
    expect(payment.modePopup).toBe('Всплывающее окно')
    expect(payment.field_notifyUrl).toBe('URL уведомлений')
    expect(payment.field_returnUrl).toBe('URL возврата')
    expect(payment.strategyRoundRobin).toBe('По очереди')
    expect(ru.admin.settings.gatewayForwarding.codexFingerprintSignals).toBe('Признаки отпечатка движка Codex')
    expect(ru.admin.settings.openaiExperimentalScheduler.errorRateWeight).toBe('Доля ошибок')
  })

  it('binds shared dialog, tooltip, and pagination accessible text to locale keys', () => {
    expect(en.pagination.navigation).toBe('Pagination navigation')
    expect(zh.pagination.navigation).toBe('分页导航')
    expect(ru.pagination.navigation).toBe('Навигация по страницам')
    expect(source('src/components/common/BaseDialog.vue')).toContain(':aria-label="t(\'common.close\')"')
    expect(source('src/components/common/HelpTooltip.vue')).toContain(':aria-label="t(\'common.close\')"')
    expect(source('src/components/common/Pagination.vue')).toContain(':aria-label="t(\'pagination.navigation\')"')
  })
})
