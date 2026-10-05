import { describe, expect, it } from 'vitest'

import { localizeQuotaDiagnostic } from '../quotaDiagnostics'

const t = (key: string, values?: Record<string, string | number>) => {
  if (!values) return key
  return `${key}:${JSON.stringify(values)}`
}

describe('localizeQuotaDiagnostic', () => {
  it('maps known CN provider and quota monitor diagnostics to i18n keys', () => {
    expect(localizeQuotaDiagnostic('Authentication failed (HTTP 401)', t)).toBe(
      'monitorCommon.quota.errors.authenticationFailedHttp:{"status":"401"}',
    )
    expect(localizeQuotaDiagnostic('API error (HTTP 500): upstream says nope', t)).toBe(
      'monitorCommon.quota.errors.apiErrorHttp:{"status":"500"}',
    )
    expect(localizeQuotaDiagnostic('account provider has no balance endpoint', t)).toBe(
      'monitorCommon.quota.errors.noBalanceEndpoint',
    )
    expect(localizeQuotaDiagnostic('coding plan account has no balance endpoint; use quota probe', t)).toBe(
      'monitorCommon.quota.errors.codingPlanNoBalanceEndpoint',
    )
    expect(localizeQuotaDiagnostic('linked account not found', t)).toBe(
      'monitorCommon.quota.errors.linkedAccountNotFound',
    )
    expect(localizeQuotaDiagnostic('quota snapshot missing', t)).toBe(
      'monitorCommon.quota.errors.snapshotMissing',
    )
    expect(localizeQuotaDiagnostic('quota high: pro/7d at 93.4%', t)).toBe(
      'monitorCommon.quota.errors.quotaHigh:{"window":"pro/7d","percent":"93.4"}',
    )
    expect(localizeQuotaDiagnostic('balance depleted (CNY)', t)).toBe(
      'monitorCommon.quota.errors.balanceDepleted:{"currency":"CNY"}',
    )
  })

  it('does not expose unknown source-language diagnostics as primary dashboard text', () => {
    expect(localizeQuotaDiagnostic('some upstream English sentence with internal host details', t)).toBe(
      'monitorCommon.quota.errors.generic',
    )
  })
})
