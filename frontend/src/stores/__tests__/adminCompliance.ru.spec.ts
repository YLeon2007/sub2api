import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const { localeRef, acceptCompliance } = vi.hoisted(() => ({
  localeRef: { value: 'ru' },
  acceptCompliance: vi.fn()
}))

vi.mock('@/i18n', () => ({
  getLocale: () => localeRef.value
}))

vi.mock('@/api/admin/compliance', () => ({
  default: {
    getStatus: vi.fn(),
    accept: acceptCompliance
  }
}))

import { useAdminComplianceStore } from '@/stores/adminCompliance'

const RU_PHRASE =
  'Я прочитал, понял и принимаю обязательство по соблюдению требований при развёртывании и эксплуатации Sub2API'

function status(required = true) {
  return {
    required,
    version: 'v2026.06.10',
    document_path_zh: 'docs/legal/admin-compliance.zh.md',
    document_path_en: 'docs/legal/admin-compliance.en.md',
    document_path_ru: 'docs/legal/admin-compliance.ru.md',
    document_url_zh: 'https://github.com/YLeon2007/sub2api/blob/v0.1.176-ru.1/docs/legal/admin-compliance.zh.md',
    document_url_en: 'https://github.com/YLeon2007/sub2api/blob/v0.1.176-ru.1/docs/legal/admin-compliance.en.md',
    document_url_ru: 'https://github.com/YLeon2007/sub2api/blob/v0.1.176-ru.1/docs/legal/admin-compliance.ru.md',
    ack_phrase_zh: 'zh phrase',
    ack_phrase_en: 'en phrase',
    ack_phrase_ru: RU_PHRASE
  }
}

describe('Russian admin compliance contract', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localeRef.value = 'ru'
    acceptCompliance.mockReset()
    acceptCompliance.mockResolvedValue(status(false))
  })

  it('selects the Russian phrase and keeps Russian document metadata', () => {
    const store = useAdminComplianceStore()
    store.requireAcknowledgement(status())

    expect(store.expectedPhrase).toBe(RU_PHRASE)
    expect(store.status?.document_path_ru).toBe('docs/legal/admin-compliance.ru.md')
    expect(store.status?.document_url_ru).toContain('/blob/v0.1.176-ru.1/')
  })

  it('pins fallback document URLs to the immutable RU release', () => {
    const store = useAdminComplianceStore()
    store.requireAcknowledgement({ version: 'v2026.06.10' })

    expect(store.status?.document_url_zh).toContain('/blob/v0.1.176-ru.1/')
    expect(store.status?.document_url_en).toContain('/blob/v0.1.176-ru.1/')
    expect(store.status?.document_url_ru).toContain('/blob/v0.1.176-ru.1/')
  })

  it('submits the Russian locale and phrase', async () => {
    const store = useAdminComplianceStore()
    await store.accept(RU_PHRASE)

    expect(acceptCompliance).toHaveBeenCalledWith({ phrase: RU_PHRASE, language: 'ru' })
  })
})
