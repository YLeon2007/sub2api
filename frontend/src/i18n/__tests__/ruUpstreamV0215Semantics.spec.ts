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

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(match => match[1]!).sort()
}

// v0.2.14 -> v0.2.15 upstream locale delta:
// added: moreFilters/moreFiltersActive, protocolRules.alsoSupports(+Hint), protocolRules.catalogFallback,
// opencodeGo.errors.forbidden, ops outputTps/outputTpsSamples/tooltips.outputTps,
// resources longContext/longContextPricingTooltip, dashboard outputTps/outputTpsHint.
// modified: opencodeGo.protocolRules.hint (passthrough semantics), OPENCODE_GO_USAGE_REFRESH_RATE_LIMITED (trailing comma only — text unchanged).
const expected = {
  "added": {
    "admin.accounts.moreFilters": {
      "en": "More filters",
      "zh": "更多筛选",
      "ru": "Ещё фильтры"
    },
    "admin.accounts.moreFiltersActive": {
      "en": "More filters ({count} active)",
      "zh": "更多筛选（已启用 {count} 项）",
      "ru": "Ещё фильтры (активно: {count})"
    },
    "admin.accounts.opencodeGo.protocolRules.alsoSupports": {
      "en": "Also supports",
      "zh": "也支持",
      "ru": "Также поддерживает"
    },
    "admin.accounts.opencodeGo.protocolRules.alsoSupportsHint": {
      "en": "Requests arriving on one of these protocols are passed through unchanged, avoiding protocol conversion",
      "zh": "以这些协议进来的请求同协议直通，免去协议转换",
      "ru": "Запросы, приходящие по одному из этих протоколов, проходят без изменений, без конвертации протоколов"
    },
    "admin.accounts.opencodeGo.protocolRules.catalogFallback": {
      "en": "Unmatched models → protocols from the upstream model list (supported_endpoints in /models); Chat Completions when unavailable",
      "zh": "未命中以上规则 → 按上游模型列表（/models 的 supported_endpoints）选协议；列表不可用时走 Chat Completions",
      "ru": "Несопоставленные модели → протоколы из списка моделей удалённого сервиса (supported_endpoints в /models); при недоступности — Chat Completions"
    },
    "admin.accounts.opencodeGo.errors.forbidden": {
      "en": "Upstream returned 403: could be a missing/expired OpenCode Go subscription or a WAF/access-policy block; check the network path and HTTP status.",
      "zh": "上游返回 403：可能是订阅缺失/失效，也可能是 WAF 或访问策略拦截，请结合网络路径与 HTTP 状态排查。",
      "ru": "Удалённый сервис вернул 403: возможно, подписка OpenCode Go отсутствует или истекла, либо запрос заблокирован WAF/политикой доступа; проверьте сетевой путь и HTTP-статус."
    },
    "admin.ops.outputTps": {
      "en": "Per-request output TPS",
      "zh": "单次输出 TPS",
      "ru": "TPS вывода на запрос"
    },
    "admin.ops.outputTpsSamples": {
      "en": "Valid samples: {count}",
      "zh": "有效样本：{count}",
      "ru": "Валидных образцов: {count}"
    },
    "admin.ops.tooltips.outputTps": {
      "en": "Percentiles of each valid usage record’s output tokens / total duration, including first-token wait, within the selected time, platform and group. Output may include reasoning tokens; they are not added again. P50 is the median; P5/P10 show slower requests. Higher is faster. Excludes images, Live and records without positive output or duration. Samples come from retained usage logs; — means no samples or temporarily unavailable statistics.",
      "zh": "每条有效用量记录的输出 Token ÷ 总耗时（含首字等待），再按当前时间、平台和分组计算分位数。输出可含推理 Token，不重复相加。P50 为中位数，P5/P10 反映较慢请求；数值越高越快。排除图片、Live、无有效输出或耗时的记录。样本来自仍保留的使用明细；无样本或统计暂不可用时显示 —。",
      "ru": "Перцентили отношения выходных токенов к общей длительности (включая ожидание первого токена) для каждой валидной записи расхода в выбранном окне, на платформе и в группе. Вывод может включать токены рассуждений; они не учитываются повторно. P50 — медиана; P5/P10 — более медленные запросы. Выше — быстрее. Исключаются изображения, Live и записи без положительного вывода или длительности. Образцы берутся из сохранённых журналов расхода; — означает отсутствие образцов или временную недоступность статистики."
    },
    "admin.usage.longContext": {
      "en": "Long context",
      "zh": "长上下文",
      "ru": "Длинный контекст"
    },
    "admin.usage.longContextPricingTooltip": {
      "en": "Long-context pricing was applied. Input and output rates depend on the pricing tier, not a uniform multiplier.",
      "zh": "已应用长上下文计费。输入和输出费率取决于定价档位，并非统一倍率。",
      "ru": "Применено ценообразование для длинного контекста. Тарифы на вход и выход зависят от ценового уровня, а не от единого множителя."
    },
    "usage.outputTps": {
      "en": "Output TPS",
      "zh": "输出 TPS",
      "ru": "TPS вывода"
    },
    "usage.outputTpsHint": {
      "en": "Output tokens divided by total duration, including first-token wait, in tok/s. Output tokens may include reasoning tokens.",
      "zh": "输出 Token ÷ 总耗时（包含首字等待），单位 tok/s。输出 Token 可能包含推理 Token。",
      "ru": "Выходные токены, делённые на общую длительность (включая ожидание первого токена), в ток/с. Выходные токены могут включать токены рассуждений."
    }
  },
  "modified": {
    "admin.accounts.opencodeGo.protocolRules.hint": {
      "en": "In adaptive mode, each model is sent to a native upstream protocol. Use an exact ID or a trailing * glob (e.g. grok-*, qwen*). The first matching rule wins. If the inbound protocol is one the model also supports, the request passes through on that protocol without conversion; otherwise the selected protocol is used.",
      "zh": "自适应模式下按模型匹配上游协议。支持精确 ID 或末尾 * 通配（如 grok-*、qwen*）；自上而下第一条命中生效。入站协议是模型也支持的协议时同协议直通、不做转换，否则走所选协议。",
      "ru": "В адаптивном режиме каждая модель отправляется по её исходному протоколу удалённого сервера. Укажите точный ID модели или шаблон с * в конце (например, grok-* или qwen*). Применяется первое совпавшее правило. Если входящий протокол также поддерживается моделью, запрос проходит по нему без конвертации; иначе используется выбранный протокол."
    }
  }
}

describe('Russian v0.2.15 upstream locale delta', () => {
  it('matches every added EN/ZH source leaf and its explicit Russian translation', () => {
    expect(ru).toBe(ruOverrides)
    expect(Object.keys(expected.added)).toHaveLength(13)
    for (const [path, values] of Object.entries(expected.added)) {
      expect(readPath(en, path), `EN ${path}`).toBe(values.en)
      expect(readPath(zh, path), `ZH ${path}`).toBe(values.zh)
      expect(readPath(ruOverrides, path), `RU ${path}`).toBe(values.ru)
      expect(placeholders(values.ru), `RU placeholders ${path}`).toEqual(placeholders(values.en))
    }
  })

  it('matches the modified protocolRules.hint source leaf and updates Russian meaning', () => {
    expect(Object.keys(expected.modified)).toHaveLength(1)
    for (const [path, values] of Object.entries(expected.modified)) {
      expect(readPath(en, path), `EN ${path}`).toBe(values.en)
      expect(readPath(zh, path), `ZH ${path}`).toBe(values.zh)
      expect(readPath(ruOverrides, path), `RU ${path}`).toBe(values.ru)
      expect(placeholders(values.ru), `RU placeholders ${path}`).toEqual(placeholders(values.en))
    }
  })

  it('documents that OPENCODE_GO_USAGE_REFRESH_RATE_LIMITED text is unchanged upstream', () => {
    // v0.2.15 touched the line only to add a trailing comma; EN/ZH/RU text is identical.
    expect(readPath(en, 'admin.accounts.opencodeGo.errors.OPENCODE_GO_USAGE_REFRESH_RATE_LIMITED'))
      .toBe('Refresh is limited. Try again in {retry_after_seconds} seconds.')
    expect(readPath(ruOverrides, 'admin.accounts.opencodeGo.errors.OPENCODE_GO_USAGE_REFRESH_RATE_LIMITED'))
      .toBe('Обновление ограничено. Повторите через {retry_after_seconds} с.')
  })

  it('output TPS RU copy keeps tok/s unit and reasoning-token caveat translated', () => {
    expect((ruOverrides as any).usage.outputTpsHint).toContain('ток/с')
    expect((ruOverrides as any).usage.outputTpsHint).toContain('токены рассуждений')
    expect((ruOverrides as any).admin.ops.tooltips.outputTps).toContain('P50')
    expect((ruOverrides as any).admin.ops.tooltips.outputTps).toContain('—')
  })
})
