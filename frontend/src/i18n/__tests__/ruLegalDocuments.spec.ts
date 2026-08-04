import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(process.cwd(), '..')

function source(path: string): string {
  return readFileSync(resolve(root, path), 'utf8')
}

describe('Russian legal document integration', () => {
  it('bundles the versioned Russian compliance document', () => {
    const documentPath = resolve(root, 'docs/legal/admin-compliance.ru.md')
    expect(existsSync(documentPath)).toBe(true)
    if (!existsSync(documentPath)) return

    const document = readFileSync(documentPath, 'utf8')
    expect(document).toMatch(/^# Обязательство по соблюдению требований при развёртывании и эксплуатации Sub2API$/m)
    expect(document).toContain('Версия: v2026.06.10')
    expect(document).toContain('## 6. Электронное подтверждение')
  })

  it('selects Russian content on the public legal page', () => {
    const view = source('frontend/src/views/public/LegalDocumentView.vue')
    expect(view).toContain('admin-compliance.ru.md?raw')
    expect(view).toContain("if (locale === 'ru')")
    expect(view).toContain('return ruAdminCompliance')
  })

  it('selects Russian content and fork URL in the blocking admin dialog', () => {
    const dialog = source('frontend/src/components/admin/AdminComplianceDialog.vue')
    expect(dialog).toContain('admin-compliance.ru.md?raw')
    expect(dialog).toContain("if (locale === 'ru')")
    expect(dialog).toContain('document_url_ru')
    expect(dialog).toContain('YLeon2007/sub2api')
    expect(dialog).toContain('/blob/v0.1.171-ru.1/')
  })
})
