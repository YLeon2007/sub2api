import { describe, expect, it } from 'vitest'
import ru from '../locales/ru'
import en from '../locales/en'
import zh from '../locales/zh'

describe('v0.2.23 pricing copy', () => {
  it('labels the distinct Ultra Fast channel override and includes it in positive-multiplier validation', () => {
    expect(en.admin.channels.form.ultrafastMultiplier).toBe('Ultrafast Multiplier')
    expect(zh.admin.channels.form.ultrafastMultiplier).toBe('Ultra Fast 倍率')
    expect(ru.admin.channels.form.ultrafastMultiplier).toBe('Множитель Ultra Fast')
    for (const locale of [en, zh, ru]) expect(locale.admin.channels.form.multiplierPositive).toContain('Ultra Fast')
  })

  it('states entitlement, fallback precedence, promotional expiry and Free Fast exclusion separately', () => {
    expect(en.admin.groups.openaiFast.ultrafastHint).toContain('Pro 500 includes both Sol and Astra Ultrafast')
    expect(zh.admin.groups.openaiFast.ultrafastHint).toContain('若同时开启强制 Fast 则使用 Fast，否则跟随客户端')
    const hint = ru.admin.groups.openaiFast.ultrafastHint
    for (const clause of [
      'Принудительно задаёт service_tier=ultrafast для поддерживаемых моделей.',
      'В Pro 200 Ultra Fast доступен только для GPT-6.2 Sol, в Pro 500 — для Sol и Astra.',
      'Для других аккаунтов используются только режимы, указанные в их каталоге.',
      'Если Ultra Fast недоступен, включённая настройка «Принудительный Fast» задаёт priority; иначе сохраняется режим, выбранный клиентом.',
      'Для GPT-6.2 Sol и Astra до 1 марта 2027 года, 00:00 по тихоокеанскому времени, действует тариф ×3 к Standard, затем — ×6.',
      'Для GPT-6 Astra и GPT-6.1 Sol действует тариф ×6.',
      '«Бесплатный Fast» не распространяется на Ultra Fast.',
    ]) expect(hint).toContain(clause)
  })
})
