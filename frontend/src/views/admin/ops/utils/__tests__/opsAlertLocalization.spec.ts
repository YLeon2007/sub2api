import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import en from '@/i18n/locales/en'
import ru from '@/i18n/locales/ru'
import zh from '@/i18n/locales/zh'
import {
  SEEDED_OPS_ALERT_RULE_SOURCES,
  localizeOpsAlertEventDescription,
  localizeOpsAlertEventTitle,
  localizeSeededOpsAlertRule
} from '../opsAlertLocalization'

type Messages = Record<string, unknown>
type Translate = (key: string, params?: Record<string, string | number>) => string

function translator(messages: Messages): Translate {
  return (key, params = {}) => {
    const value = key.split('.').reduce<unknown>((node, part) => {
      return node && typeof node === 'object' ? (node as Messages)[part] : undefined
    }, messages)
    if (typeof value !== 'string') throw new Error(`Missing test locale key: ${key}`)
    return value.replace(/\{(\w+)\}/g, (_, token: string) => String(params[token] ?? `{${token}}`))
  }
}

const seededRules = [
  {
    name: '错误率过高',
    description: '当错误率超过 5% 且持续 5 分钟时触发告警',
    enName: 'High error rate',
    enDescription: 'Triggers when the error rate exceeds 5% for 5 consecutive minutes.',
    ruName: 'Высокая доля ошибок',
    ruDescription: 'Срабатывает, когда доля ошибок превышает 5% в течение 5 минут.'
  },
  {
    name: '成功率过低',
    description: '当成功率低于 95% 且持续 5 分钟时触发告警（服务可用性下降）',
    enName: 'Low success rate',
    enDescription: 'Triggers when the success rate stays below 95% for 5 minutes (service availability is degraded).',
    ruName: 'Низкая доля успешных запросов',
    ruDescription: 'Срабатывает, когда доля успешных запросов остаётся ниже 95% в течение 5 минут (доступность сервиса снижена).'
  },
  {
    name: 'P99延迟过高',
    description: '当 P99 延迟超过 3000ms 且持续 10 分钟时触发告警',
    enName: 'P99 latency too high',
    enDescription: 'Triggers when P99 latency exceeds 3000 ms for 10 minutes.',
    ruName: 'Слишком высокая задержка P99',
    ruDescription: 'Срабатывает, когда задержка P99 превышает 3000 мс в течение 10 минут.'
  },
  {
    name: 'P95延迟过高',
    description: '当 P95 延迟超过 2000ms 且持续 10 分钟时触发告警',
    enName: 'P95 latency too high',
    enDescription: 'Triggers when P95 latency exceeds 2000 ms for 10 minutes.',
    ruName: 'Слишком высокая задержка P95',
    ruDescription: 'Срабатывает, когда задержка P95 превышает 2000 мс в течение 10 минут.'
  },
  {
    name: 'CPU使用率过高',
    description: '当 CPU 使用率超过 85% 且持续 10 分钟时触发告警',
    enName: 'High CPU usage',
    enDescription: 'Triggers when CPU usage exceeds 85% for 10 minutes.',
    ruName: 'Высокая загрузка CPU',
    ruDescription: 'Срабатывает, когда загрузка CPU превышает 85% в течение 10 минут.'
  },
  {
    name: '内存使用率过高',
    description: '当内存使用率超过 90% 且持续 10 分钟时触发告警（可能导致 OOM）',
    enName: 'High memory usage',
    enDescription: 'Triggers when memory usage exceeds 90% for 10 minutes (may cause OOM).',
    ruName: 'Высокое использование памяти',
    ruDescription: 'Срабатывает, когда использование памяти превышает 90% в течение 10 минут (возможен OOM).'
  },
  {
    name: '并发队列积压',
    description: '当并发队列深度超过 100 且持续 5 分钟时触发告警（系统处理能力不足）',
    enName: 'Concurrency queue backlog',
    enDescription: 'Triggers when concurrency queue depth exceeds 100 for 5 minutes (insufficient processing capacity).',
    ruName: 'Переполнение очереди параллельных запросов',
    ruDescription: 'Срабатывает, когда глубина очереди параллельных запросов превышает 100 в течение 5 минут (недостаточная производительность системы).'
  },
  {
    name: '错误率极高',
    description: '当错误率超过 20% 且持续 1 分钟时触发告警（服务严重异常）',
    enName: 'Critically high error rate',
    enDescription: 'Triggers when the error rate exceeds 20% for 1 minute (serious service degradation).',
    ruName: 'Критически высокая доля ошибок',
    ruDescription: 'Срабатывает, когда доля ошибок превышает 20% в течение 1 минуты (серьёзный сбой сервиса).'
  }
] as const

function readSeededRulesFromMigration(): Array<{ name: string; description: string }> {
  const sql = readFileSync(resolve(process.cwd(), '../backend/migrations/033_ops_monitoring_vnext.sql'), 'utf8')
  const seedSection = sql.slice(sql.indexOf('-- 036_ops_seed_default_alert_rules.sql'))
  const insertPattern = /INSERT INTO ops_alert_rules\s*\([\s\S]*?\) VALUES \(\s*'([^']+)',\s*'([^']+)',/g
  return Array.from(seedSection.matchAll(insertPattern), ([, name, description]) => ({ name, description }))
}

describe('Ops alert localization', () => {
  it('localizes the complete seeded-rule inventory from the real EN/RU/ZH locale trees without mutating source values', () => {
    const migrationRules = readSeededRulesFromMigration()
    expect(migrationRules).toEqual(
      SEEDED_OPS_ALERT_RULE_SOURCES.map(({ name, description }) => ({ name, description }))
    )
    expect(migrationRules).toEqual(
      seededRules.map(({ name, description }) => ({ name, description }))
    )

    const sourceSnapshot = structuredClone(migrationRules)

    for (const rule of seededRules) {
      expect(localizeSeededOpsAlertRule(rule.name, rule.description, translator(en))).toEqual({
        name: rule.enName,
        description: rule.enDescription
      })
      expect(localizeSeededOpsAlertRule(rule.name, rule.description, translator(ru))).toEqual({
        name: rule.ruName,
        description: rule.ruDescription
      })
      expect(localizeSeededOpsAlertRule(rule.name, rule.description, translator(zh))).toEqual({
        name: rule.name,
        description: rule.description
      })
    }

    expect(migrationRules).toEqual(sourceSnapshot)
  })

  it('localizes historical seeded titles and strictly generated descriptions while preserving machine values', () => {
    const scopedDescription = 'error_rate > 5.00 (current 12.34) over last 5m (platform=openai group_id=42)'
    const legacyP99Description = 'p99_latency_ms > 3000.00 (current 3456.78) over last 10m (overall)'
    const legacyP95Description = 'p95_latency_ms > 2000.00 (current 2345.67) over last 10m (overall)'
    const groupOnlyDescription = 'error_rate > 5.00 (current 12.34) over last 5m (overall group_id=42)'
    const overallDescription = 'memory_usage_percent > 90.00 (current 93.25) over last 5m (overall)'

    for (const rule of seededRules) {
      expect(localizeOpsAlertEventTitle(rule.name, translator(ru))).toBe(rule.ruName)
      expect(localizeOpsAlertEventTitle(rule.name, translator(en))).toBe(rule.enName)
      expect(localizeOpsAlertEventTitle(rule.name, translator(zh))).toBe(rule.name)
      expect(localizeOpsAlertEventTitle(`P1: ${rule.name}`, translator(ru))).toBe(`P1: ${rule.ruName}`)
      expect(localizeOpsAlertEventTitle(`P1: ${rule.name}`, translator(en))).toBe(`P1: ${rule.enName}`)
      expect(localizeOpsAlertEventTitle(`P1: ${rule.name}`, translator(zh))).toBe(`P1: ${rule.name}`)
    }

    expect(localizeOpsAlertEventDescription(scopedDescription, translator(ru))).toBe(
      'error_rate > 5.00 (текущее значение 12.34) за последние 5 мин (platform=openai group_id=42)'
    )
    expect(localizeOpsAlertEventDescription(scopedDescription, translator(zh))).toBe(
      'error_rate > 5.00（当前值 12.34），最近 5 分钟（platform=openai group_id=42）'
    )
    expect(localizeOpsAlertEventDescription(legacyP99Description, translator(ru))).toBe(
      'p99_latency_ms > 3000.00 (текущее значение 3456.78) за последние 10 мин (вся система)'
    )
    expect(localizeOpsAlertEventDescription(legacyP95Description, translator(ru))).toBe(
      'p95_latency_ms > 2000.00 (текущее значение 2345.67) за последние 10 мин (вся система)'
    )
    expect(localizeOpsAlertEventDescription(groupOnlyDescription, translator(ru))).toBe(
      'error_rate > 5.00 (текущее значение 12.34) за последние 5 мин (вся система group_id=42)'
    )
    expect(localizeOpsAlertEventDescription(overallDescription, translator(ru))).toBe(
      'memory_usage_percent > 90.00 (текущее значение 93.25) за последние 5 мин (вся система)'
    )
  })

  it('preserves custom or malformed event text verbatim', () => {
    const customTitles = [
      'P1: Клиентское правило',
      'warning: 错误率过高',
      'P1 : 错误率过高',
      'P1: 错误率过高 ',
      'prefix错误率过高suffix'
    ]
    const customDescriptions = [
      'custom description',
      'error_rate > 5 (current 12.34) over last 5m (overall)',
      'error_rate ~~ 5.00 (current 12.34) over last 5m (overall)',
      'unknown_metric > 5.00 (current 12.34) over last 5m (overall)',
      'error_rate > 5.00 (current 12.34) over last 0m (overall)',
      'error_rate > 5.00 (current 12.34) over last 5m (platform=open ai)'
    ]

    for (const title of customTitles) {
      expect(localizeOpsAlertEventTitle(title, translator(ru))).toBe(title)
    }
    for (const description of customDescriptions) {
      expect(localizeOpsAlertEventDescription(description, translator(ru))).toBe(description)
    }
  })
})
