import type { LoginAgreementDocument } from '@/types'

const defaultTitles = [
  ['terms', '服务条款', 'Условия обслуживания'],
  ['usage-policy', '使用政策', 'Политика использования'],
  ['supported-regions', '支持的国家和地区', 'Поддерживаемые страны и регионы'],
  ['service-specific-terms', '服务特定条款', 'Специальные условия сервиса'],
] as const

/** Localize canonical defaults at the display boundary, never in stored policy data. */
export function localizeLoginAgreementDocumentTitle(
  doc: Pick<LoginAgreementDocument, 'id' | 'title'>,
  locale: string,
): string {
  if (locale.toLowerCase().split(/[-_]/)[0] !== 'ru') return doc.title

  const match = defaultTitles.find(([id, zh]) =>
    doc.id === id && doc.title === zh,
  )
  return match?.[2] ?? doc.title
}
