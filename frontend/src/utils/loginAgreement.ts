import type { LoginAgreementDocument } from '@/types'

const defaultTitles = [
  ['terms', '服务条款', 'Terms of Service', 'Условия обслуживания'],
  ['usage-policy', '使用政策', 'Usage Policy', 'Политика использования'],
  ['supported-regions', '支持的国家和地区', 'Supported Countries and Regions', 'Поддерживаемые страны и регионы'],
  ['service-specific-terms', '服务特定条款', 'Service-Specific Terms', 'Специальные условия сервиса'],
] as const

/** Localize canonical defaults at the display boundary, never in stored policy data. */
export function localizeLoginAgreementDocumentTitle(
  doc: Pick<LoginAgreementDocument, 'id' | 'title'>,
  locale: string,
): string {
  if (locale.toLowerCase().split(/[-_]/)[0] !== 'ru') return doc.title

  const match = defaultTitles.find(([id, zh, en]) =>
    doc.id === id && (doc.title === zh || doc.title === en),
  )
  return match?.[3] ?? doc.title
}
