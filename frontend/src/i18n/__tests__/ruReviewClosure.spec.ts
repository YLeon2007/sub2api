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

  it('translates active usage, monitoring, account, and admin control labels', () => {
    expect(ru.usage.errors.categories.rate_limit).toBe('Ограничение частоты')
    expect(ru.monitorCommon.endpointPing).toBe('Пинг эндпоинта')
    expect(ru.admin.groups.columns.userNotes).toBe('Заметки')
    expect(ru.admin.channelMonitor.advanced.bodyJson).toBe('Тело JSON')
    expect(ru.admin.accounts.cnProviders.accountMode.payg).toBe('Оплата по факту')
    expect(ru.admin.accounts.cnProviders.accountMode.coding).toBe('Тариф Coding')
    expect(ru.admin.accounts.usageWindow.passiveSampled).toBe('Пассивная выборка')
    expect(ru.admin.proxies.qualityStatusChallenge).toBe('Проверка доступа')
    expect(ru.admin.ops.jobs).toBe('Задания')
    expect(ru.admin.ops.queryMode.raw).toBe('Прямой запрос')
    expect(ru.admin.announcements.notifyModeLabels.popup).toBe('Всплывающее окно')
    expect(ru.admin.settings.payment.guideFallbackLabel).toBe('Запасной вариант: ')
    expect(ru.admin.ops.queryMode.preagg).toBe('Предварительная агрегация')
    expect(ru.admin.ops.alertEvents.status.firing).toBe('СРАБОТАЛО')
    expect(ru.admin.ops.errorDetail.tabResponse).toBe('Ответ')
    expect(ru.admin.accounts.openai.responsesModeAuto).toBe('Авто')
    expect(ru.admin.users.attributes.placeholder).toBe('Текст подсказки')
    expect(ru.admin.settings.smtp.host).toBe('Сервер SMTP')
    expect(ru.admin.settings.oidc.issuerUrl).toBe('URL издателя')
    expect(ru.admin.settings.gatewayForwarding.metadataPassthrough).toBe('Передача метаданных без изменений')
  })

  it('keeps protocol and brand names while localizing their visible labels', () => {
    expect(ru.admin.groups.platforms.anthropic).toBe('Anthropic')
    expect(ru.admin.accounts.openai.capabilityResponsesAuto).toBe('Responses (автопроверка)')
    expect(ru.admin.groups.compositeRoutes.endpoints.chatCompletions).toBe('Chat Completions')
    expect(ru.admin.accounts.grok.testModeRealtime).toBe('В реальном времени (WS /realtime)')
    expect(ru.admin.accounts.cnProviders.apiProtocol.adaptiveDesc).toContain('родной эндпоинт провайдера')
    expect(ru.monitorCommon.quota.errors.noBalanceEndpoint).toBe('У этого провайдера нет эндпоинта для проверки баланса')
    expect(ru.monitorCommon.quota.errors.quotaHigh).toContain('{window} — {percent}%')
    const accountForm = source('src/components/account/CreateAccountModal.vue')
    expect(accountForm).toContain("@click=\"accountMode = 'payg'\"")
    expect(accountForm).toContain("@click=\"accountMode = 'coding'\"")
  })

  it('translates active upstream, registration, callback and error-log labels', () => {
    expect(ru.admin.accounts.upstream.baseUrl).toBe('Базовый URL вышестоящего сервиса')
    expect(ru.admin.accounts.upstream.apiKey).toBe('API-ключ вышестоящего сервиса')
    expect(ru.admin.settings.registration.frontendUrl).toBe('URL фронтенда')
    expect(ru.admin.settings.wechatConnect.frontendRedirectUrlLabel).toBe('URL перенаправления фронтенда')
    expect(ru.admin.ops.errorLog.commonErrors.contextDeadlineExceeded).toBe('Превышено время ожидания')
    expect(ru.admin.ops.errorLog.commonErrors.connectionRefused).toBe('В соединении отказано')
    expect(ru.admin.ops.errorLog.commonErrors.rateLimit).toBe('Превышен лимит запросов')
    const errorLog = source('src/views/admin/ops/components/OpsErrorLogTable.vue')
    expect(errorLog).toContain("msg.includes('context deadline exceeded')")
    expect(errorLog).toContain("msg.includes('connection refused')")
    expect(errorLog).toContain("msg.toLowerCase().includes('rate limit')")
  })

  it('localizes the active Codex PAT option and missing-token error', () => {
    expect(ru.admin.accounts.oauth.openai.codexPatAuth).toBe('Персональный токен доступа Codex')
    expect(ru.admin.accounts.oauth.openai.codexPatEmpty).toBe('Введите персональный токен доступа Codex')
    expect(source('src/components/account/OAuthAuthorizationFlow.vue')).toContain("t('admin.accounts.oauth.openai.codexPatAuth')")
    expect(source('src/components/account/CreateAccountModal.vue')).toContain("t('admin.accounts.oauth.openai.codexPatEmpty')")
  })

  it('localizes the shared OAuth method label and copy-URL tooltip', () => {
    const flow = source('src/components/account/OAuthAuthorizationFlow.vue')
    expect(ru.admin.accounts.oauth.authMethod).toBe('Способ авторизации')
    expect(ru.admin.accounts.oauth.copyUrl).toBe('Скопировать ссылку')
    expect(flow).not.toContain("default: 'Authorization Method'")
    expect(flow).toContain("methodLabel || t('admin.accounts.oauth.authMethod')")
    expect(flow).not.toContain('title="Copy URL"')
    expect(flow).toContain(":title=\"t('admin.accounts.oauth.copyUrl')\"")
  })

  it('does not promote raw backend failures in active account OAuth flows', () => {
    const modal = source('src/components/account/CreateAccountModal.vue')
    expect(modal).not.toMatch(/error\.response\?\.data\?\.(?:detail|message)\s*\|\|/)
    expect(modal).not.toMatch(/error\.message\s*\|\|/)
    expect(modal).not.toContain("'Unknown error'")
    expect(modal).not.toContain("'Validation failed'")
    expect(modal).not.toContain('item.error ||')
    expect(modal).toMatch(/mixedChannelWarningRawMessage\.value\s*=\s*extractApiErrorMessage\(/)
    expect(modal).not.toContain('return `#${item.index}${name}: ${item.message}`')
    const antigravity = source('src/composables/useAntigravityOAuth.ts')
    const gemini = source('src/composables/useGeminiOAuth.ts')
    expect(antigravity).not.toMatch(/err\.response\?\.data\?\.detail\s*\|\|/)
    expect(gemini).not.toMatch(/error\.value = (?:err|error)\.(?:message|response)/)
  })

  it('keeps OAuth failure and token instructions in Russian', () => {
    expect(ru.admin.accounts.oauth.gemini.failedToGenerateUrl).toBe('Не удалось создать ссылку авторизации Gemini')
    expect(ru.admin.accounts.oauth.antigravity.failedToValidateRT).toBe('Не удалось проверить токен обновления Antigravity')
    expect(JSON.stringify(ru.admin.accounts.oauth)).not.toMatch(/\b(?:auth URL|auth code|authorization code|refresh token)\b/i)
  })

  it('localizes the active Vertex service-account choice', () => {
    const modal = source('src/components/account/CreateAccountModal.vue')
    expect(ru.admin.accounts.vertexDesc).toBe('Сервисный аккаунт')
    expect(modal).toContain("t('admin.accounts.vertexDesc')")
    expect(modal).not.toContain('>Service Account</span>')
  })

  it('localizes common active configuration labels without changing API identifiers', () => {
    const text = JSON.stringify(ru)
    expect(text).not.toMatch(/"(?:baseUrl|apiKey|requestId|clientId|clientSecret|redirectUrl|siteKey|secretKey|appIdLabel|appSecretLabel)":"(?:Base URL|API Key|Request ID|Client ID|Client Secret|Redirect URL|Site Key|Secret Key|App ID|App Secret)"/)
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
