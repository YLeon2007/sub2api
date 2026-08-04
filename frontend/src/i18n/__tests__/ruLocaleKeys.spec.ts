import { describe, expect, it } from 'vitest'
import { baseCompile } from '@intlify/message-compiler'

import en from '../locales/en'
import ru, { ruOverrides } from '../locales/ru'

type LeafMap = Map<string, unknown>

const NODE_NAMED = 4
const NODE_LIST = 5

function flattenLeaves(value: unknown, prefix = '', out: LeafMap = new Map()): LeafMap {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      flattenLeaves(child, prefix ? `${prefix}.${key}` : key, out)
    }
    return out
  }

  if (prefix) {
    out.set(prefix, value)
  }
  return out
}

function extractPlaceholders(message: string): string[] {
  const placeholders = new Set<string>()
  const result = baseCompile(message, {
    onError: () => {
      // localesMessageCompile.spec.ts reports compile errors with the full path.
    }
  })

  function visit(node: unknown): void {
    if (!node || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    if (record.type === NODE_NAMED && typeof record.key === 'string') {
      placeholders.add(`named:${record.key}`)
    }
    if (record.type === NODE_LIST && typeof record.index === 'number') {
      placeholders.add(`list:${record.index}`)
    }
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) {
        value.forEach(visit)
      } else if (value && typeof value === 'object') {
        visit(value)
      }
    }
  }

  visit(result.ast)
  return Array.from(placeholders).sort()
}

describe('Russian locale key coverage', () => {
  const enLeaves = flattenLeaves(en)
  const ruLeaves = flattenLeaves(ruOverrides)

  it('uses the explicit Russian override tree as the runtime export', () => {
    expect(ru).toBe(ruOverrides)
  })

  it('explicitly translates every English leaf key without relying on English fallback', () => {
    const missing = Array.from(enLeaves.keys()).filter((key) => !ruLeaves.has(key))

    expect(missing).toEqual([])
  })

  it('does not keep stale Russian-only leaf keys absent from English', () => {
    const stale = Array.from(ruLeaves.keys()).filter((key) => !enLeaves.has(key))

    expect(stale).toEqual([])
  })

  it('keeps named and list placeholder parity with English messages', () => {
    const mismatches = Array.from(enLeaves.entries()).flatMap(([key, enValue]) => {
      const ruValue = ruLeaves.get(key)
      if (typeof enValue !== 'string' || typeof ruValue !== 'string') {
        return []
      }

      const enPlaceholders = extractPlaceholders(enValue)
      const ruPlaceholders = extractPlaceholders(ruValue)
      return JSON.stringify(enPlaceholders) === JSON.stringify(ruPlaceholders)
        ? []
        : [`${key}: en(${enPlaceholders.join(', ')}) ru(${ruPlaceholders.join(', ')})`]
    })

    expect(mismatches).toEqual([])
  })

  it('preserves the updated v0.1.170 upstream billing semantics in Russian', () => {
    expect(ru.admin.accounts.upstreamBilling.autoProbeHint).toBe(
      'Обновлять объявленный upstream-тариф с глобальным интервалом. Сам по себе этот переключатель не изменяет тариф аккаунта.'
    )
    expect(ru.admin.accounts.upstreamBilling.noEligibleAccounts).toBe(
      'Выберите аккаунты с API Key'
    )
    expect(ru.admin.settings.upstreamBillingProbe.description).toBe(
      'Периодически получать тарифы, объявленные upstream-сайтами Sub2API. Тарифы аккаунтов изменяются только при включённом отдельном переключателе синхронизации.'
    )
  })

  it('preserves the updated v0.1.171 quota, composite, and Codex identity semantics in Russian', () => {
    expect(ru.admin.accounts.openaiQuotaReset.resetSuccess).toBe(
      'Сброшено окон: {windows}; reset-кредиты и состояние аккаунта обновлены'
    )
    expect(ru.admin.groups.form.maxReasoningEffortHint).toBe(
      'Ограничивает только явно заданный OpenAI reasoning effort. Для Composite-групп применяется только к запросам, направленным в OpenAI. Более высокие значения уменьшаются; отсутствующее значение не добавляется. Ограничение имеет приоритет над сопоставлениями.'
    )
    expect(ru.admin.settings.gatewayForwarding.openaiCodexUserAgentPlaceholder).toBe(
      'codex_cli_rs/0.146.0 (Ubuntu 22.4.0; x86_64) xterm-256color'
    )
    expect(ru.admin.settings.gatewayForwarding.openaiCodexUserAgentHint).toBe(
      'Полный User-Agent Codex для всех исходящих запросов; позволяет настраивать отпечаток ОС / архитектуры / терминала. Оставьте пустым, чтобы формировать стандартную идентичность codex_cli_rs на основе версии ниже (рекомендуется). Если значение задано, его сегмент версии всё равно заменяется версией ниже, поэтому UA не остаётся привязанным к релизу, на котором его ввели: при дефиците мощности upstream распределяет нагрузку по идентичности клиента и в первую очередь отклоняет устаревшие или неофициальные идентичности с ошибкой server_is_overloaded.'
    )
  })
})
