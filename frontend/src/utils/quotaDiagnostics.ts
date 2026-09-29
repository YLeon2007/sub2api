type Translate = (key: string, values?: Record<string, string | number>) => string

function firstHttpStatus(message: string): string {
  return message.match(/\bHTTP\s+(\d{3})\b/i)?.[1]
    || message.match(/\bstatus(?:\s+code)?\s+(\d{3})\b/i)?.[1]
    || ''
}

function localizedWithOptionalStatus(
  t: Translate,
  key: string,
  statusKey: string,
  status: string,
): string {
  return status ? t(statusKey, { status }) : t(key)
}

/**
 * Convert known quota/balance probe diagnostics into localized, user-facing text.
 *
 * Backend keeps machine/API semantics and raw upstream snippets in logs/API fields;
 * UI surfaces should not expose English operational diagnostics as primary text in
 * non-English locales. Unknown details deliberately collapse to a generic message
 * instead of leaking provider/source-language prose into the dashboard.
 */
export function localizeQuotaDiagnostic(message: string | null | undefined, t: Translate): string {
  const raw = String(message || '').trim()
  if (!raw) return ''

  const lower = raw.toLowerCase()
  const status = firstHttpStatus(raw)

  if (lower.includes('authentication failed')) {
    return localizedWithOptionalStatus(
      t,
      'monitorCommon.quota.errors.authenticationFailed',
      'monitorCommon.quota.errors.authenticationFailedHttp',
      status,
    )
  }

  if (lower.startsWith('api error')) {
    return localizedWithOptionalStatus(
      t,
      'monitorCommon.quota.errors.apiError',
      'monitorCommon.quota.errors.apiErrorHttp',
      status,
    )
  }

  if (lower.includes('coding plan account has no balance endpoint')) {
    return t('monitorCommon.quota.errors.codingPlanNoBalanceEndpoint')
  }
  if (lower.includes('account provider has no balance endpoint')) {
    return t('monitorCommon.quota.errors.noBalanceEndpoint')
  }
  if (lower.includes('linked account not found')) {
    return t('monitorCommon.quota.errors.linkedAccountNotFound')
  }
  if (lower.includes('account api_key is empty')) {
    return t('monitorCommon.quota.errors.apiKeyEmpty')
  }
  if (lower.includes('account not found')) {
    return t('monitorCommon.quota.errors.accountNotFound')
  }
  if (lower.includes('account is not a cn provider account')) {
    return t('monitorCommon.quota.errors.invalidPlatform')
  }
  if (lower.includes('account is not a coding plan account') || lower.includes('account is not a kimi/zhipu coding plan account')) {
    return t('monitorCommon.quota.errors.notCodingPlan')
  }
  if (lower.includes('quota snapshot missing')) {
    return t('monitorCommon.quota.errors.snapshotMissing')
  }

  const quotaHigh = raw.match(/quota high:\s*(.+?)\s+at\s+([0-9]+(?:\.[0-9]+)?)%/i)
  if (quotaHigh) {
    return t('monitorCommon.quota.errors.quotaHigh', {
      window: quotaHigh[1],
      percent: quotaHigh[2],
    })
  }

  const balanceDepleted = raw.match(/balance depleted\s*\(([^)]+)\)/i)
  if (balanceDepleted) {
    return t('monitorCommon.quota.errors.balanceDepleted', { currency: balanceDepleted[1] })
  }

  if (lower.includes('service is not configured')) {
    return t('monitorCommon.quota.errors.serviceNotConfigured')
  }
  if (lower.includes('build request:')) {
    return t('monitorCommon.quota.errors.requestBuildFailed')
  }
  if (lower.includes('upstream request failed')) {
    return t('monitorCommon.quota.errors.upstreamRequestFailed')
  }
  if (lower.includes('returned no data')) {
    return t('monitorCommon.quota.errors.noData')
  }
  if (lower.includes('probe failed')) {
    return t('monitorCommon.quota.errors.probeFailed')
  }

  return t('monitorCommon.quota.errors.generic')
}
