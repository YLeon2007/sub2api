export type OpsAlertTranslate = (
  key: string,
  params?: Record<string, string | number>
) => string

export const SEEDED_OPS_ALERT_RULE_SOURCES = [
  {
    key: 'highErrorRate',
    name: '错误率过高',
    description: '当错误率超过 5% 且持续 5 分钟时触发告警'
  },
  {
    key: 'lowSuccessRate',
    name: '成功率过低',
    description: '当成功率低于 95% 且持续 5 分钟时触发告警（服务可用性下降）'
  },
  {
    key: 'highP99Latency',
    name: 'P99延迟过高',
    description: '当 P99 延迟超过 3000ms 且持续 10 分钟时触发告警'
  },
  {
    key: 'highP95Latency',
    name: 'P95延迟过高',
    description: '当 P95 延迟超过 2000ms 且持续 10 分钟时触发告警'
  },
  {
    key: 'highCpuUsage',
    name: 'CPU使用率过高',
    description: '当 CPU 使用率超过 85% 且持续 10 分钟时触发告警'
  },
  {
    key: 'highMemoryUsage',
    name: '内存使用率过高',
    description: '当内存使用率超过 90% 且持续 10 分钟时触发告警（可能导致 OOM）'
  },
  {
    key: 'concurrencyQueueBacklog',
    name: '并发队列积压',
    description: '当并发队列深度超过 100 且持续 5 分钟时触发告警（系统处理能力不足）'
  },
  {
    key: 'criticalErrorRate',
    name: '错误率极高',
    description: '当错误率超过 20% 且持续 1 分钟时触发告警（服务严重异常）'
  }
] as const

const SEEDED_RULE_BY_NAME: ReadonlyMap<string, (typeof SEEDED_OPS_ALERT_RULE_SOURCES)[number]> = new Map(
  SEEDED_OPS_ALERT_RULE_SOURCES.map((rule) => [rule.name, rule] as const)
)

const OPS_ALERT_METRIC_TYPES = new Set([
  'success_rate',
  'error_rate',
  'upstream_error_rate',
  'p99_latency_ms',
  'p95_latency_ms',
  'cpu_usage_percent',
  'memory_usage_percent',
  'concurrency_queue_depth',
  'group_available_accounts',
  'group_available_ratio',
  'group_rate_limit_ratio',
  'account_rate_limited_count',
  'account_error_count',
  'account_error_ratio',
  'account_temp_unscheduled_count',
  'overload_account_count'
])

const GENERATED_EVENT_DESCRIPTION = /^(\w+) (>=|<=|==|!=|>|<) (-?\d+\.\d{2}) \(current (-?\d+\.\d{2})\) over last ([1-9]\d*)m \((overall|platform=[A-Za-z0-9][A-Za-z0-9._:-]*)( group_id=[1-9]\d*)?\)$/

export function localizeSeededOpsAlertRule(
  name: string,
  description: string | undefined,
  t: OpsAlertTranslate
): { name: string; description: string | undefined } {
  const seededRule = SEEDED_RULE_BY_NAME.get(name)
  if (!seededRule) return { name, description }

  return {
    name: t(`admin.ops.alertRules.seeded.${seededRule.key}.name`),
    description:
      description === seededRule.description
        ? t(`admin.ops.alertRules.seeded.${seededRule.key}.description`)
        : description
  }
}

export function localizeOpsAlertEventTitle(title: string | undefined, t: OpsAlertTranslate): string | undefined {
  if (title == null) return title
  const bareSeededRule = SEEDED_RULE_BY_NAME.get(title)
  if (bareSeededRule) {
    return t(`admin.ops.alertRules.seeded.${bareSeededRule.key}.name`)
  }

  const match = /^(P[0-3]): (.+)$/.exec(title)
  if (!match) return title

  const seededRule = SEEDED_RULE_BY_NAME.get(match[2])
  if (!seededRule) return title
  return `${match[1]}: ${t(`admin.ops.alertRules.seeded.${seededRule.key}.name`)}`
}

export function localizeOpsAlertEventDescription(
  description: string | undefined,
  t: OpsAlertTranslate
): string | undefined {
  if (description == null) return description
  const match = GENERATED_EVENT_DESCRIPTION.exec(description)
  if (!match || !OPS_ALERT_METRIC_TYPES.has(match[1])) return description

  const scope = match[6] === 'overall'
    ? t('admin.ops.alertEvents.generated.overall')
    : match[6]

  return t('admin.ops.alertEvents.generated.description', {
    metric: match[1],
    operator: match[2],
    threshold: match[3],
    current: match[4],
    minutes: match[5],
    scope: `${scope}${match[7] || ''}`
  })
}
