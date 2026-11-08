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

const expected = {
  "added": {
    "admin.accounts.claudeResetCredits.confirmMessage": {
      "en": "This will consume 1 reset credit to immediately restore the {windows} window(s) ({count} remaining). This action cannot be undone. Continue?",
      "zh": "将消耗 1 次重置次数，立即恢复 {windows} 窗口，剩余 {count} 次。此操作不可撤销，确定继续吗？",
      "ru": "Будет израсходован 1 reset-кредит для немедленного восстановления окон {windows} (останется {count}). Это действие нельзя отменить. Продолжить?"
    },
    "admin.accounts.claudeResetCredits.confirmTitle": {
      "en": "Confirm Claude Reset",
      "zh": "确认使用 Claude 重置",
      "ru": "Подтвердите сброс Claude"
    },
    "admin.accounts.claudeResetCredits.outcome.alreadyUsed": {
      "en": "This reset was already used; refreshing to confirm",
      "zh": "该重置已被使用，正在刷新确认",
      "ru": "Этот сброс уже использован; обновляем данные для проверки"
    },
    "admin.accounts.claudeResetCredits.outcome.busy": {
      "en": "Another reset is in progress; try again later",
      "zh": "另一个重置正在进行中，请稍后再试",
      "ru": "Другой сброс уже выполняется; повторите позже"
    },
    "admin.accounts.claudeResetCredits.outcome.cooldown": {
      "en": "Resets are cooling down; try again later",
      "zh": "重置处于冷却中，请稍后再试",
      "ru": "Сбросы на паузе; повторите позже"
    },
    "admin.accounts.claudeResetCredits.outcome.cooldownUntil": {
      "en": "Resets are cooling down until {time}",
      "zh": "重置处于冷却中，冷却至 {time}",
      "ru": "Сбросы на паузе до {time}"
    },
    "admin.accounts.claudeResetCredits.outcome.failed": {
      "en": "Reset request failed",
      "zh": "重置请求失败",
      "ru": "Не удалось выполнить запрос на сброс"
    },
    "admin.accounts.claudeResetCredits.outcome.inProgress": {
      "en": "This reset request is still processing; check again shortly",
      "zh": "该重置请求仍在处理中，请稍后查询结果",
      "ru": "Запрос на сброс ещё обрабатывается; проверьте результат чуть позже"
    },
    "admin.accounts.claudeResetCredits.outcome.ineligible": {
      "en": "This account cannot use resets right now",
      "zh": "此账号当前不可使用重置",
      "ru": "Этот аккаунт сейчас не может использовать сбросы"
    },
    "admin.accounts.claudeResetCredits.outcome.notAvailable": {
      "en": "No reset can be used right now; no credit was used",
      "zh": "当前没有可立即使用的重置，未消耗次数",
      "ru": "Сейчас нет доступного сброса; кредит не израсходован"
    },
    "admin.accounts.claudeResetCredits.outcome.notLimited": {
      "en": "Not at a limit, so nothing was reset and no credit was used",
      "zh": "当前未达到限额，无需重置，未消耗次数",
      "ru": "Лимит не достигнут: ничего не сброшено, кредит не израсходован"
    },
    "admin.accounts.claudeResetCredits.outcome.reset": {
      "en": "Reset applied; cleared: {windows}",
      "zh": "重置成功，已清除：{windows}",
      "ru": "Сброс применён; очищено: {windows}"
    },
    "admin.accounts.claudeResetCredits.outcome.retryBackoff": {
      "en": "This reset request just failed; retry after a moment",
      "zh": "该重置请求刚刚失败，请稍后再试",
      "ru": "Этот запрос на сброс только что завершился ошибкой; повторите через некоторое время"
    },
    "admin.accounts.claudeResetCredits.outcome.unavailable": {
      "en": "Reset service is temporarily unavailable; retry after a while",
      "zh": "重置服务暂时不可用，未确认消耗，请稍后再试",
      "ru": "Сервис сброса временно недоступен; повторите позже"
    },
    "admin.accounts.claudeResetCredits.outcome.unknown": {
      "en": "Result unconfirmed; further redemption is blocked for now. Check again later",
      "zh": "结果未确认，已阻止再次兑换，请稍后查询",
      "ru": "Результат не подтверждён; дальнейшее использование сброса пока заблокировано. Проверьте позже"
    },
    "admin.accounts.claudeResetCredits.reset": {
      "en": "Reset",
      "zh": "重置",
      "ru": "Сбросить"
    },
    "admin.accounts.claudeResetCredits.resetTooltipNeedQuery": {
      "en": "Check the count first; reset is available once a usable credit is found",
      "zh": "请先点「次数」查询；查询到可用的重置后才能使用",
      "ru": "Сначала проверьте число; сброс доступен после обнаружения пригодного кредита"
    },
    "admin.accounts.claudeResetCredits.resetTooltipNone": {
      "en": "No reset can be used right now",
      "zh": "当前没有可立即使用的重置",
      "ru": "Сейчас нет доступного сброса"
    },
    "admin.accounts.claudeResetCredits.resetTooltipReady": {
      "en": "Consume 1 reset to clear limit windows (asks for confirmation)",
      "zh": "消耗 1 次重置，清除限额窗口（需确认）",
      "ru": "Израсходовать 1 reset-кредит для очистки окон лимитов (требуется подтверждение)"
    },
    "admin.accounts.claudeResetCredits.windows.fiveHour": {
      "en": "5h",
      "zh": "5h",
      "ru": "5 ч"
    },
    "admin.accounts.claudeResetCredits.windows.sevenDay": {
      "en": "7d",
      "zh": "7d",
      "ru": "7 дн."
    },
    "admin.accounts.claudeResetCredits.windows.sevenDayOverage": {
      "en": "7d overage",
      "zh": "7d 超额",
      "ru": "Перерасход за 7 дн."
    },
    "admin.accounts.platforms.typesafe": {
      "en": "TypeSafe / Jev",
      "zh": "TypeSafe / Jev",
      "ru": "TypeSafe / Jev"
    },
    "admin.accounts.priorityQuick.editHint": {
      "en": "Click to type a value; lower is used first",
      "zh": "点击直接输入；数值越小越优先",
      "ru": "Нажмите, чтобы ввести значение; меньшие значения используются первыми"
    },
    "admin.accounts.priorityQuick.failed": {
      "en": "Failed to update priority",
      "zh": "更新优先级失败",
      "ru": "Не удалось обновить приоритет"
    },
    "admin.accounts.priorityQuick.lower": {
      "en": "Lower priority (value +1)",
      "zh": "降低优先级（数值 +1）",
      "ru": "Понизить приоритет (значение +1)"
    },
    "admin.accounts.priorityQuick.raise": {
      "en": "Raise priority (value -1)",
      "zh": "提高优先级（数值 -1）",
      "ru": "Повысить приоритет (значение -1)"
    },
    "admin.groups.platforms.typesafe": {
      "en": "TypeSafe / Jev",
      "zh": "TypeSafe / Jev",
      "ru": "TypeSafe / Jev"
    },
    "admin.settings.payment.rechargeBonus.addTier": {
      "en": "Add Tier",
      "zh": "添加档位",
      "ru": "Добавить уровень"
    },
    "admin.settings.payment.rechargeBonus.duplicateMinAmount": {
      "en": "This threshold already exists",
      "zh": "该金额档位已存在",
      "ru": "Такой порог уже существует"
    },
    "admin.settings.payment.rechargeBonus.empty": {
      "en": "No promotion tiers configured; top-ups are credited at face value.",
      "zh": "尚未配置优惠档位，充值按原价到账。",
      "ru": "Уровни акций не настроены; пополнения зачисляются без акции, с применением настроенного множителя пополнения баланса."
    },
    "admin.settings.payment.rechargeBonus.hint": {
      "en": "Balance top-ups match a tier by the amount the user enters (highest threshold not above it). Leave empty for no promotion. Subscriptions are not affected.",
      "zh": "余额充值按用户输入的金额命中档位（取不超过该金额的最大档）；不配置则无优惠。订阅订单不参与。",
      "ru": "Пополнение баланса выбирает уровень по введённой пользователем сумме (максимальный порог, не превышающий её). Оставьте пустым, чтобы отключить акцию. На подписки не влияет."
    },
    "admin.settings.payment.rechargeBonus.incompleteRow": {
      "en": "Fill in both amount and percent for this tier to take effect",
      "zh": "金额与百分比都填写后该档位才会生效",
      "ru": "Для применения уровня укажите и сумму, и процент"
    },
    "admin.settings.payment.rechargeBonus.invalidDiscountPercent": {
      "en": "Discount percent must be below 100",
      "zh": "折扣模式下百分比必须小于 100",
      "ru": "Процент скидки должен быть меньше 100"
    },
    "admin.settings.payment.rechargeBonus.invalidMinAmount": {
      "en": "Amount must be a number ≥ 0 with at most 2 decimals",
      "zh": "金额需为 ≥ 0 且最多两位小数的数字",
      "ru": "Сумма должна быть числом ≥ 0 не более чем с 2 знаками после запятой"
    },
    "admin.settings.payment.rechargeBonus.invalidPercent": {
      "en": "Percent must be between 0 and 1000 with at most 2 decimals",
      "zh": "百分比需在 0 ~ 1000 之间，最多两位小数",
      "ru": "Процент должен быть от 0 до 1000 и содержать не более 2 знаков после запятой"
    },
    "admin.settings.payment.rechargeBonus.label": {
      "en": "Recharge Promotion Tiers",
      "zh": "充值优惠阶梯",
      "ru": "Уровни акций пополнения"
    },
    "admin.settings.payment.rechargeBonus.minAmountLabel": {
      "en": "Amount ≥",
      "zh": "充值金额 ≥",
      "ru": "Сумма ≥"
    },
    "admin.settings.payment.rechargeBonus.modeBonus": {
      "en": "Bonus",
      "zh": "赠金",
      "ru": "Бонус"
    },
    "admin.settings.payment.rechargeBonus.modeBonusHint": {
      "en": "Bonus: the payment stays the same and the credited base (amount × multiplier) gets the percentage added on top.",
      "zh": "赠金：实付不变，在到账基数（输入金额 × 充值倍率）之上额外赠送对应百分比的余额。",
      "ru": "Бонус: сумма платежа не меняется, а к базе зачисления (сумма × множитель) добавляется указанный процент."
    },
    "admin.settings.payment.rechargeBonus.modeDiscount": {
      "en": "Discount OFF",
      "zh": "折扣 OFF",
      "ru": "Скидка"
    },
    "admin.settings.payment.rechargeBonus.modeDiscountHint": {
      "en": "Discount: the credit stays the same (amount × multiplier) and the payment is reduced by the percentage; must be below 100.",
      "zh": "折扣：到账不变（输入金额 × 充值倍率），实付金额按对应百分比打折；百分比必须小于 100。",
      "ru": "Скидка: зачисление не меняется (сумма × множитель), а платёж уменьшается на указанный процент; он должен быть меньше 100."
    },
    "admin.settings.payment.rechargeBonus.modeLabel": {
      "en": "Promotion type",
      "zh": "优惠方式",
      "ru": "Тип акции"
    },
    "admin.settings.payment.rechargeBonus.noticeHint": {
      "en": "Markdown supported. Shown at the top of the amount picker on the recharge page; leave empty to hide.",
      "zh": "支持 Markdown，展示在充值页金额选择区顶部；留空则不展示。",
      "ru": "Поддерживается Markdown. Показывается вверху выбора суммы на странице пополнения; оставьте пустым, чтобы скрыть."
    },
    "admin.settings.payment.rechargeBonus.noticeLabel": {
      "en": "Recharge Bonus Notice",
      "zh": "充值赠送活动文案",
      "ru": "Уведомление о бонусе пополнения"
    },
    "admin.settings.payment.rechargeBonus.noticePlaceholder": {
      "en": "e.g. 🎁 Limited offer: get 20% extra on top-ups of $100+, 30% on $500+ …",
      "zh": "例如：🎁 限时活动：单笔充值满 $100 送 20%，满 $500 送 30%……",
      "ru": "например: 🎁 Ограниченное предложение: +20% к пополнениям от $100, +30% от $500 …"
    },
    "admin.settings.payment.rechargeBonus.percentLabel": {
      "en": "Bonus",
      "zh": "赠送",
      "ru": "Бонус"
    },
    "admin.settings.payment.rechargeBonus.percentLabelDiscount": {
      "en": "Discount",
      "zh": "优惠",
      "ru": "Скидка"
    },
    "admin.settings.payment.rechargeBonus.previewOpen": {
      "en": "≥ {from}: {percent}% bonus",
      "zh": "≥ {from}：赠送 {percent}%",
      "ru": "≥ {from}: бонус {percent}%"
    },
    "admin.settings.payment.rechargeBonus.previewOpenDiscount": {
      "en": "≥ {from}: {percent}% OFF",
      "zh": "≥ {from}：{percent}% OFF",
      "ru": "≥ {from}: скидка {percent}%"
    },
    "admin.settings.payment.rechargeBonus.previewOpenNone": {
      "en": "≥ {from}: no bonus",
      "zh": "≥ {from}：不赠送",
      "ru": "≥ {from}: без бонуса"
    },
    "admin.settings.payment.rechargeBonus.previewRange": {
      "en": "{from} ~ {to}: {percent}% bonus",
      "zh": "{from} ~ {to}：赠送 {percent}%",
      "ru": "{from} ~ {to}: бонус {percent}%"
    },
    "admin.settings.payment.rechargeBonus.previewRangeDiscount": {
      "en": "{from} ~ {to}: {percent}% OFF",
      "zh": "{from} ~ {to}：{percent}% OFF",
      "ru": "{from} ~ {to}: скидка {percent}%"
    },
    "admin.settings.payment.rechargeBonus.previewRangeNone": {
      "en": "{from} ~ {to}: no bonus",
      "zh": "{from} ~ {to}：不赠送",
      "ru": "{from} ~ {to}: без бонуса"
    },
    "admin.settings.payment.rechargeBonus.previewTitle": {
      "en": "Range preview",
      "zh": "区间预览",
      "ru": "Предпросмотр диапазонов"
    },
    "admin.settings.payment.rechargeBonus.removeTier": {
      "en": "Remove tier",
      "zh": "删除档位",
      "ru": "Удалить уровень"
    },
    "keys.useKeyModal.cliTabs.systemOne": {
      "en": "System One",
      "zh": "System One",
      "ru": "System One"
    },
    "keys.useKeyModal.codexModelCatalog.local": {
      "en": "Local file (older clients)",
      "zh": "本地文件（旧版客户端）",
      "ru": "Локальный файл (старые клиенты)"
    },
    "keys.useKeyModal.codexModelCatalog.mode": {
      "en": "Catalog source",
      "zh": "目录来源",
      "ru": "Источник каталога"
    },
    "keys.useKeyModal.codexModelCatalog.oversized": {
      "en": "The complete catalog exceeds the 1 MiB remote limit. Local file mode is selected; download it to the configured path.",
      "zh": "完整目录超过远程加载的 1 MiB 限制，已改为本地文件。请下载目录并保存到配置中的路径。",
      "ru": "Полный каталог превышает удалённый лимит 1 MiB. Выбран режим локального файла; скачайте каталог по настроенному пути."
    },
    "keys.useKeyModal.codexModelCatalog.remote": {
      "en": "Remote catalog (Codex 0.156.0+)",
      "zh": "远程目录（Codex 0.156.0+）",
      "ru": "Удалённый каталог (Codex 0.156.0+)"
    },
    "keys.useKeyModal.typesafe.description": {
      "en": "Call Jev through the native TypeSafe System One endpoint.",
      "zh": "通过 TypeSafe 原生 System One 端点调用 Jev。",
      "ru": "Вызвать Jev через нативную конечную точку TypeSafe System One."
    },
    "keys.useKeyModal.typesafe.note": {
      "en": "System One is non-streaming and is not compatible with Chat Completions, Responses, Claude Code, or Codex clients.",
      "zh": "System One 不支持流式请求，也不兼容 Chat Completions、Responses、Claude Code 或 Codex 客户端。",
      "ru": "System One не поддерживает потоковую передачу и несовместим с Chat Completions, Responses, Claude Code или клиентами Codex."
    },
    "payment.orders.bonusAmount": {
      "en": "Bonus",
      "zh": "赠送额度",
      "ru": "Бонус"
    },
    "payment.orders.bonusIncluded": {
      "en": "incl. bonus {amount}",
      "zh": "含赠送 {amount}",
      "ru": "включая бонус {amount}"
    },
    "payment.rechargeBonus.amountLabel": {
      "en": "Bonus",
      "zh": "赠送额度",
      "ru": "Бонус"
    },
    "payment.rechargeBonus.amountLabelWithPercent": {
      "en": "Bonus (+{percent}%)",
      "zh": "赠送额度 (+{percent}%)",
      "ru": "Бонус (+{percent}%)"
    },
    "payment.rechargeBonus.creditedShort": {
      "en": "Get {amount}",
      "zh": "到账 {amount}",
      "ru": "Зачислится {amount}"
    },
    "payment.rechargeBonus.discountLabelWithPercent": {
      "en": "Discount ({percent}% OFF)",
      "zh": "优惠 ({percent}% OFF)",
      "ru": "Скидка ({percent}%)"
    },
    "payment.rechargeBonus.payShort": {
      "en": "Pay {amount}",
      "zh": "实付 {amount}",
      "ru": "Оплатить {amount}"
    }
  },
  "modified": {
    "admin.accounts.customErrorCodesWarning": {
      "en": "Custom error codes only filter normal account-error handling (such as stopping scheduling or marking rate limits). They do not decide whether a request is retried or switched to another account. Unselected errors may still trigger a retry or an account switch, and the status returned to the client depends on the gateway path and error-passthrough rules; it is not always 500. An empty list applies no filtering.",
      "zh": "自定义错误码仅用于筛选常规的账号错误处理（如停止调度、限流标记），不决定请求是否重试或切换账号。未选中的错误仍可能触发重试或切换账号，最终返回给客户端的状态码取决于网关路径和错误透传规则，并非统一返回 500。列表为空时不做筛选。",
      "ru": "Пользовательские коды ошибок фильтруют только обычную обработку ошибок аккаунта (например, остановку маршрутизации или отметку лимита). Они не определяют, будет ли запрос повторён или переключён на другой аккаунт. Не выбранные ошибки всё ещё могут вызвать повтор или переключение аккаунта, а статус клиента зависит от пути шлюза и правил передачи ошибки; это не всегда 500. Пустой список не применяет фильтрацию."
    },
    "keys.useKeyModal.codexModelCatalog.description": {
      "en": "Codex loads and refreshes the remote catalog using your configured authentication. For local file mode, fetch the catalog below and save it at the configured path.",
      "zh": "Codex 会使用配置中的认证信息加载并刷新远程目录。使用本地文件模式时，请在下方获取目录并保存到配置中的路径。",
      "ru": "Codex загружает и обновляет удалённый каталог с настроенной аутентификацией. В режиме локального файла получите каталог ниже и сохраните его по настроенному пути."
    },
    "keys.useKeyModal.composite.codexConfigTomlHint": {
      "en": "Save config.toml and restart Codex to load the remote catalog. In local file mode, also download the catalog to the configured path.",
      "zh": "保存 config.toml 后重启 Codex，客户端会加载远程目录。使用本地文件模式时，还需下载目录并保存到配置中的路径。",
      "ru": "Сохраните config.toml и перезапустите Codex, чтобы загрузить удалённый каталог. В режиме локального файла также скачайте каталог по настроенному пути."
    },
    "keys.useKeyModal.deepseek.codexConfigTomlHint": {
      "en": "Save config.toml and restart Codex to load the remote catalog. In local file mode, also download the catalog to the configured path.",
      "zh": "保存 config.toml 后重启 Codex，客户端会加载远程目录。使用本地文件模式时，还需下载目录并保存到配置中的路径。",
      "ru": "Сохраните config.toml и перезапустите Codex, чтобы загрузить удалённый каталог. В режиме локального файла также скачайте каталог по настроенному пути."
    },
    "keys.useKeyModal.minimax.codexConfigTomlHint": {
      "en": "Save config.toml and restart Codex to load the remote catalog. In local file mode, also download the catalog to the configured path.",
      "zh": "保存 config.toml 后重启 Codex，客户端会加载远程目录。使用本地文件模式时，还需下载目录并保存到配置中的路径。",
      "ru": "Сохраните config.toml и перезапустите Codex, чтобы загрузить удалённый каталог. В режиме локального файла также скачайте каталог по настроенному пути."
    },
    "keys.useKeyModal.routedCodex.configTomlHint": {
      "en": "Save config.toml and restart Codex to load the remote catalog. In local file mode, also download the catalog to the configured path.",
      "zh": "保存 config.toml 后重启 Codex，客户端会加载远程目录。使用本地文件模式时，还需下载目录并保存到配置中的路径。",
      "ru": "Сохраните config.toml и перезапустите Codex, чтобы загрузить удалённый каталог. В режиме локального файла также скачайте каталог по настроенному пути."
    }
  }
} as const

describe('Russian v0.2.13 upstream locale delta', () => {
  it('matches every added EN/ZH source leaf and its explicit Russian translation', () => {
    expect(ru).toBe(ruOverrides)
    expect(Object.keys(expected.added)).toHaveLength(70)
    for (const [path, values] of Object.entries(expected.added)) {
      expect(readPath(en, path), `EN ${path}`).toBe(values.en)
      expect(readPath(zh, path), `ZH ${path}`).toBe(values.zh)
      expect(readPath(ruOverrides, path), `RU ${path}`).toBe(values.ru)
      expect(placeholders(values.ru), `RU placeholders ${path}`).toEqual(placeholders(values.en))
    }
  })

  it('matches every modified EN/ZH source leaf and updates Russian meaning', () => {
    expect(Object.keys(expected.modified)).toHaveLength(6)
    for (const [path, values] of Object.entries(expected.modified)) {
      expect(readPath(en, path), `EN ${path}`).toBe(values.en)
      expect(readPath(zh, path), `ZH ${path}`).toBe(values.zh)
      expect(readPath(ruOverrides, path), `RU ${path}`).toBe(values.ru)
      expect(placeholders(values.ru), `RU placeholders ${path}`).toEqual(placeholders(values.en))
    }
  })

  it('states that Claude reset confirmation consumes one irreversible credit', () => {
    const reset = ruOverrides.admin.accounts.claudeResetCredits
    expect(reset.confirmMessage).toContain('1 reset-кредит')
    expect(reset.confirmMessage).toContain('нельзя отменить')
    expect(reset.resetTooltipReady).toContain('1 reset-кредит')
    expect(reset.outcome.notAvailable).toContain('кредит не израсходован')
    expect(reset.outcome.notLimited).toContain('кредит не израсходован')
  })

  it('blocks redemption after an unknown reset result', () => {
    const unknown = ruOverrides.admin.accounts.claudeResetCredits.outcome.unknown
    expect(unknown).toContain('Результат не подтверждён')
    expect(unknown).toContain('заблокировано')
    expect(unknown).toContain('Проверьте позже')
  })

  it('RU-PAYMENT-EMPTY keeps the configured balance multiplier when no promotion tiers exist', () => {
    // quoteRechargeBonus applies BalanceRechargeMultiplier before returning the no-tier quote.
    const empty = ruOverrides.admin.settings.payment.rechargeBonus.empty
    expect(empty).toContain('Уровни акций не настроены')
    expect(empty).toContain('без акции')
    expect(empty).toContain('с применением настроенного множителя пополнения баланса')
    expect(empty).not.toContain('по номиналу')
  })

  it('keeps bonus and discount tier modes semantically distinct', () => {
    const tiers = ruOverrides.admin.settings.payment.rechargeBonus
    expect(tiers.modeBonusHint).toContain('сумма платежа не меняется')
    expect(tiers.modeBonusHint).toContain('к базе зачисления')
    expect(tiers.modeDiscountHint).toContain('зачисление не меняется')
    expect(tiers.modeDiscountHint).toContain('платёж уменьшается')
    expect(tiers.modeDiscountHint).toContain('меньше 100')
    expect(tiers.invalidDiscountPercent).toContain('меньше 100')
  })

  it('preserves Codex remote-version and local-size fallback semantics', () => {
    const codex = ruOverrides.keys.useKeyModal.codexModelCatalog
    expect(codex.remote).toBe('Удалённый каталог (Codex 0.156.0+)')
    expect(codex.local).toContain('старые клиенты')
    expect(codex.oversized).toContain('1 MiB')
    expect(codex.oversized).toContain('режим локального файла')
  })

  it('does not promise that custom error codes guarantee HTTP 500', () => {
    const warning = ruOverrides.admin.accounts.customErrorCodesWarning
    expect(warning).toContain('повтор')
    expect(warning).toContain('переключение аккаунта')
    expect(warning).toContain('не всегда 500')
    expect(warning).toContain('Пустой список')
  })
})
