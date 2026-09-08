import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { getAccountExpiryTimestamp } from '@/components/account/accountExpiry'
import { resolveIntervalPrices } from '@/utils/pricing'
import ru from '../locales/ru'
import en from '../locales/en'
import zh from '../locales/zh'

const repositoryRoot = resolve(process.cwd(), '..')

function source(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), 'utf8')
}

describe('Russian v0.2.2 upstream semantics', () => {
  it('describes the model allowlist as both listing and ingress enforcement', () => {
    expect(ru.admin.groups.modelAllowlist.title).toBe('Список разрешённых моделей')
    expect(ru.admin.groups.modelAllowlist.hint).toContain('отклоняются с ошибкой 404 model_not_found')
    expect(ru.admin.groups.modelAllowlist.hint).toContain('списки моделей показывают только разрешённые модели')
    expect(ru.admin.groups.modelAllowlist.hint).toContain('/messages/count_tokens')
    expect(ru.admin.groups.modelAllowlist.hint).toContain('символом * в конце')
    expect(ru.admin.groups.modelAllowlist.emptySelectionError).toContain('выберите или добавьте')
    expect(ru.admin.groups.modelAllowlist.errors.invalidWildcard).toContain('только в конце')
    expect(ru.admin.groups).not.toHaveProperty('modelsList')
  })

  it('keeps migration 235 data while enforcing the allowlist in listings and ingress', () => {
    const migration = source('backend/migrations/235_group_model_allowlist.sql')
    const ingress = source('backend/internal/server/middleware/group_model_allowlist.go')
    const listing = source('backend/internal/service/openai_models_list.go')

    expect(migration).toContain(
      'ALTER TABLE groups RENAME COLUMN models_list_config TO model_allowlist;'
    )
    expect(migration).not.toMatch(/DROP\s+COLUMN/i)
    expect(migration).not.toMatch(/UPDATE\s+groups/i)
    expect(ingress).toContain('!allowlist.Allows(candidate)')
    expect(ingress).toContain('http.StatusNotFound')
    expect(ingress).toContain('IngressRejectModelNotAllowed')
    expect(listing).toContain('group.ModelAllowlist.FilterForListing(modelIDs)')
  })

  it('explains deny-valued reasoning mappings without weakening matching precedence', () => {
    expect(ru.admin.groups.form.reasoningEffortToDeny).toBe('Отклонить запрос')
    expect(ru.admin.groups.form.reasoningEffortMappingsHint).toContain(
      'выберите «Отклонить запрос» как передаваемое значение'
    )
    expect(ru.admin.groups.form.reasoningEffortMappingsHint).toContain(
      'Точное совпадение имеет приоритет'
    )

    const fields = source('frontend/src/components/admin/group/ReasoningEffortPolicyFields.vue')
    expect(fields).toContain('t("admin.groups.form.reasoningEffortToDeny")')
  })

  it('keeps basic groups available in simple mode while hiding advanced group controls', () => {
    const sidebar = source('frontend/src/components/layout/AppSidebar.vue')
    const groups = source('frontend/src/views/admin/GroupsView.vue')
    const createAccount = source('frontend/src/components/account/CreateAccountModal.vue')
    const editAccount = source('frontend/src/components/account/EditAccountModal.vue')
    const sidebarGroup = sidebar.match(/\{ path: '\/admin\/groups'[^\n]+\}/)?.[0]

    expect(sidebarGroup).toBeDefined()
    expect(sidebarGroup).not.toContain('hideInSimpleMode')
    expect(groups).toContain('<template v-if="!authStore.isSimpleMode">')
    expect(groups).toContain('option.value !== "composite"')
    expect(groups).toContain('const payload = authStore.isSimpleMode')
    expect(groups).toContain('const requestData = authStore.isSimpleMode')
    expect(createAccount.match(/<GroupSelector[\s\S]*?\/>/)?.[0]).not.toContain('isSimpleMode')
    expect(editAccount.match(/<GroupSelector[\s\S]*?\/>/)?.[0]).not.toContain('isSimpleMode')
    expect(ru.nav.groups).toBe('Группы')
  })

  it('labels calendar-month expiry shortcuts in Russian and clamps month ends', () => {
    expect(ru.payment.oneMonth).toBe('1 месяц')
    expect(ru.payment.oneYear).toBe('1 год')
    expect(getAccountExpiryTimestamp(1, new Date('2026-01-31T12:34:56'))).toBe(
      new Date('2026-02-28T12:34:56').getTime() / 1000
    )
    expect(getAccountExpiryTimestamp(12, new Date('2028-02-29T12:34:56'))).toBe(
      new Date('2029-02-28T12:34:56').getTime() / 1000
    )
  })

  it('localizes ops thresholds and preserves ingress versus scheduler fallback attribution', () => {
    expect(ru.admin.ops.runtime.metricThresholds).toBe('Пороговые значения метрик')
    expect(ru.admin.ops.runtime.slaMinPercentHint).toContain('99,5%')
    expect(ru.admin.ops.runtime.ttftP99MaxMsHint).toContain('500 мс')
    expect(ru.admin.ops.runtime.requestErrorRateMaxPercentHint).toContain('5%')
    expect(ru.admin.ops.runtime.upstreamErrorRateMaxPercentHint).toContain('5%')

    const logger = source('backend/internal/handler/ops_error_logger.go')
    expect(logger).toContain('localModelConfiguration && !ingressModelNotAllowed')
    expect(logger).toContain('reason == middleware2.IngressRejectModelNotAllowed')
  })

  it('preserves explicit cache prices and pricing time in interval fallback paths', () => {
    const base = {
      input_price: 10,
      output_price: 50,
      cache_write_price: 12.5,
      cache_write_1h_price: 30,
      cache_read_price: 2,
    }
    const interval = {
      min_tokens: 272000,
      max_tokens: null,
      input_price: null,
      output_price: null,
      cache_write_price: 20,
      cache_write_1h_price: null,
      cache_read_price: null,
      per_request_price: null,
      cache_write_multiplier: 2,
    }

    expect(resolveIntervalPrices(interval, base)).toMatchObject({
      cache_write_price: 20,
      cache_write_1h_price: 20,
      cache_read_price: 2,
    })
    expect(ru.admin.channels.form.cacheWrite1hPrice).toContain('1 ч')
    expect(ru.admin.channels.form.timePricing).toContain('Цены по времени')

    const accountStats = source('backend/internal/service/account_stats_pricing.go')
    expect(accountStats).toContain('PricingAt:       pricingAt')
    expect(accountStats).toContain('Resolver:        NewModelPricingResolver(nil, billingService)')
  })

  it('covers all newly visible v0.2.2 labels and changed fallback copy', () => {
    expect(ru.admin.accounts.fromModel).toBe('Модель в запросе')
    expect(ru.admin.accounts.toModel).toBe('Целевая модель')
    expect(ru.admin.channels.noGroupsSelected).toBe(
      'Выберите хотя бы одну группу для платформы {platform}'
    )
    expect(ru.admin.channels.emptyModelsInPricing).toBe(
      'Добавьте хотя бы одну модель в правило цен для платформы {platform}'
    )
    expect(ru.admin.users.passwordCopied).toBe('Пароль скопирован')
    expect(ru.admin.groups.accountsUnit).toBe('акк.')
    expect(ru.common).toMatchObject({
      apply: 'Применить',
      clear: 'Очистить',
      creating: 'Создание...',
      required: 'Обязательно',
      sending: 'Отправка...',
      tryAgain: 'Попробуйте ещё раз',
    })
    const settings = source('backend/internal/service/setting_parse.go')
    expect(settings).toContain('SettingKeyGrokCrossClientModelMapEnabled: "false"')
    expect(settings).toContain(
      'GrokCrossClientModelMapEnabled = settings[SettingKeyGrokCrossClientModelMapEnabled] == "true"'
    )
    expect(ru.admin.settings.gatewayForwarding.grokCrossClientMapHint).toBe(
      'По умолчанию выключено. Когда включено, идентификаторы моделей GPT, Codex, o-series и Claude перенаправляются на указанную выше текстовую модель Grok по умолчанию.'
    )
    expect(en.admin.settings.gatewayForwarding.grokCrossClientMapHint).toContain('Disabled by default.')
    expect(zh.admin.settings.gatewayForwarding.grokCrossClientMapHint).toContain('默认关闭')
  })

  it('updates pinned-account discovery from Codex-only manifests to ordinary model lists too', () => {
    expect(ru.admin.groups.codexModelsManifest.title).toBe(
      'Закреплённые аккаунты для списков моделей'
    )
    expect(ru.admin.groups.codexModelsManifest.hint).toContain('обычные списки моделей')
    expect(ru.admin.groups.codexModelsManifest.hint).toContain('Codex Model Manifest')
    expect(ru.admin.groups.codexModelsManifest.hint).toContain('маппинга аккаунта')
    expect(ru.admin.groups.codexModelsManifest.hint).toContain(
      'списка разрешённых моделей группы'
    )
    expect(ru.admin.groups.codexModelsManifest.disabledHint).toContain(
      'обычные списки используют локальные маппинги или модели по умолчанию'
    )
    expect(ru.admin.groups.codexModelsManifest.disabledHint).toContain(
      'Codex использует локальный каталог'
    )
  })
})
