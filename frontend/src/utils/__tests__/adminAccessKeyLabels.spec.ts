import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { adminAccessPermissionLabel, adminAccessCategoryLabel, adminAccessAccountTypeLabel, RU_ADMIN_PERMISSION_LABELS } from '../adminAccessKeyLabels'

describe('scoped admin access catalog RU display boundary', () => {
  it('covers the complete backend catalog without changing permission IDs', () => {
    const catalog = readFileSync(resolve(process.cwd(), '../backend/internal/pkg/adminaccess/catalog.go'), 'utf8')
    const rows = Array.from(catalog.matchAll(/Permission\{"([^"]+)", "([^"]+)", "([^"]+)", "([^"]+)"\}/g))
    expect(rows.length).toBeGreaterThan(40)
    expect(Object.keys(RU_ADMIN_PERMISSION_LABELS).sort()).toEqual(rows.map(row => row[1]).sort())
    for (const [, id, label, category] of rows) {
      expect(adminAccessPermissionLabel({ id, label }, 'ru-RU')).toMatch(/[А-Яа-яЁё]/)
      expect(adminAccessPermissionLabel({ id, label }, 'ru')).not.toMatch(/[\u4e00-\u9fff]/)
      expect(adminAccessCategoryLabel(category, 'ru')).toMatch(/[А-Яа-яЁё]/)
      expect(adminAccessPermissionLabel({ id, label }, 'zh')).toBe(label)
      expect(adminAccessCategoryLabel(category, 'en')).toBe(category)
    }
  })
  it('preserves write-only credentials, whole-group effects and sensitive/global scope', () => {
    expect(RU_ADMIN_PERMISSION_LABELS['accounts.credentials']).toContain('без чтения')
    expect(RU_ADMIN_PERMISSION_LABELS['groups.models.write']).toContain('всю группу')
    expect(RU_ADMIN_PERMISSION_LABELS['users.balance.write']).toContain('любого пользователя')
    expect(RU_ADMIN_PERMISSION_LABELS['ops.errors.read']).toContain('конфиденциальные')
  })
  it('does not render unknown backend-controlled prose as a Russian label', () => {
    expect(adminAccessPermissionLabel({ id: 'future.write', label: '未知 Write everything' }, 'ru')).toBe('Неизвестная операция')
    expect(adminAccessCategoryLabel('Future category 未知', 'ru')).toBe('Прочее')
    expect(adminAccessAccountTypeLabel('future', 'ru')).toBe('Неизвестный тип')
    expect(adminAccessAccountTypeLabel('service_account', 'ru')).toBe('Сервисный аккаунт')
    expect(adminAccessAccountTypeLabel('oauth', 'en')).toBe('oauth')
  })
})
