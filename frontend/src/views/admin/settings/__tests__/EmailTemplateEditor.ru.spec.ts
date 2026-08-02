import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import EmailTemplateEditor from '../EmailTemplateEditor.vue'

const localeRef = vi.hoisted(() => ({ value: 'ru' }))
const {
  getEmailTemplates,
  getEmailTemplate,
  previewEmailTemplate,
  updateEmailTemplate,
  restoreOfficialEmailTemplate,
  showError,
  showSuccess,
} = vi.hoisted(() => ({
  getEmailTemplates: vi.fn(),
  getEmailTemplate: vi.fn(),
  previewEmailTemplate: vi.fn(),
  updateEmailTemplate: vi.fn(),
  restoreOfficialEmailTemplate: vi.fn(),
  showError: vi.fn(),
  showSuccess: vi.fn(),
}))

const translations: Record<string, string> = {
  'admin.settings.emailTemplates.title': 'Шаблоны email',
  'admin.settings.emailTemplates.description': 'Редактирование шаблонов',
  'admin.settings.emailTemplates.preview': 'Предпросмотр',
  'admin.settings.emailTemplates.previewing': 'Предпросмотр…',
  'admin.settings.emailTemplates.restoreOfficial': 'Восстановить',
  'admin.settings.emailTemplates.restoring': 'Восстановление…',
  'admin.settings.emailTemplates.save': 'Сохранить',
  'admin.settings.emailTemplates.saving': 'Сохранение…',
  'admin.settings.emailTemplates.event': 'Событие',
  'admin.settings.emailTemplates.locale': 'Локаль',
  'admin.settings.emailTemplates.empty': 'Нет шаблонов',
  'admin.settings.emailTemplates.subject': 'Тема',
  'admin.settings.emailTemplates.subjectPlaceholder': 'Тема письма',
  'admin.settings.emailTemplates.html': 'HTML',
  'admin.settings.emailTemplates.htmlPlaceholder': '<p>HTML</p>',
  'admin.settings.emailTemplates.placeholders': 'Переменные',
  'admin.settings.emailTemplates.placeholdersHelp': 'Вставьте переменные',
  'admin.settings.emailTemplates.livePreview': 'Живой предпросмотр',
  'admin.settings.emailTemplates.noPreview': 'Нет предпросмотра',
  'admin.settings.emailTemplates.previewSecurityHint': 'Предпросмотр изолирован',
  'admin.settings.emailTemplates.customized': 'Изменён',
  'admin.settings.emailTemplates.localeZh': 'Китайский',
  'admin.settings.emailTemplates.localeEn': 'Английский',
  'admin.settings.emailTemplates.validationRequired': 'Заполните поля',
  'admin.settings.emailTemplates.saveSuccess': 'Сохранено',
  'admin.settings.emailTemplates.restoreConfirm': 'Восстановить официальный шаблон?',
  'admin.settings.emailTemplates.restoreSuccess': 'Восстановлено',
  'admin.settings.emailTemplates.placeholderCopied': 'Скопировано',
  'common.loading': 'Загрузка',
  'common.error': 'Ошибка',
}

vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<typeof import('vue-i18n')>('vue-i18n')
  return {
    ...actual,
    useI18n: () => ({
      t: (key: string) => translations[key] ?? key,
      locale: localeRef,
    }),
  }
})

vi.mock('@/api', () => ({
  adminAPI: {
    settings: {
      getEmailTemplates,
      getEmailTemplate,
      previewEmailTemplate,
      updateEmailTemplate,
      restoreOfficialEmailTemplate,
    },
  },
}))

vi.mock('@/stores', () => ({
  useAppStore: () => ({
    showError,
    showSuccess,
  }),
}))

vi.mock('@/utils/apiError', () => ({
  extractApiErrorMessage: () => 'Ошибка API',
}))

function findLocalTextCallsWithoutRussianBranch(source: string): number[] {
  const missing: number[] = []
  const callPattern = /localText\s*\(/g
  let match: RegExpExecArray | null

  while ((match = callPattern.exec(source))) {
    const callStart = match.index
    const prefix = source.slice(Math.max(0, callStart - 20), callStart)
    if (/function\s+$/.test(prefix)) continue

    let cursor = callPattern.lastIndex
    let depth = 1
    let quote: string | null = null
    let escaped = false
    let topLevelCommas = 0
    let lastArgumentStart = cursor

    while (cursor < source.length && depth > 0) {
      const ch = source[cursor]
      if (quote) {
        if (escaped) {
          escaped = false
        } else if (ch === '\\') {
          escaped = true
        } else if (ch === quote) {
          quote = null
        }
        cursor += 1
        continue
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch
      } else if (ch === '(' || ch === '[' || ch === '{') {
        depth += 1
      } else if (ch === ')' || ch === ']' || ch === '}') {
        depth -= 1
      } else if (ch === ',' && depth === 1) {
        topLevelCommas += 1
        lastArgumentStart = cursor + 1
      }
      cursor += 1
    }

    const tailHasArgument = source.slice(lastArgumentStart, cursor - 1).trim().length > 0
    const argumentCount = topLevelCommas + (tailHasArgument ? 1 : 0)
    if (argumentCount < 3) {
      missing.push(source.slice(0, callStart).split('\n').length)
    }
    callPattern.lastIndex = cursor
  }

  return missing
}

describe('EmailTemplateEditor Russian local copy', () => {
  beforeEach(() => {
    localeRef.value = 'ru'
    getEmailTemplates.mockReset()
    getEmailTemplate.mockReset()
    previewEmailTemplate.mockReset()
    updateEmailTemplate.mockReset()
    restoreOfficialEmailTemplate.mockReset()
    showError.mockReset()
    showSuccess.mockReset()

    getEmailTemplates.mockResolvedValue({
      events: [
        {
          value: 'auth.verify_code',
          category: 'auth',
          optional: false,
          description: 'Backend English description',
        },
        { value: 'subscription.expiry_reminder', category: 'subscription', optional: true },
        { value: 'ops.scheduled_report', category: 'ops', optional: false },
      ],
      locales: ['ru', 'en', 'zh'],
      placeholders: [],
    })
    getEmailTemplate.mockResolvedValue({
      subject: 'Subject',
      html: '<p>Hello</p>',
      is_custom: false,
      placeholders: [],
    })
    previewEmailTemplate.mockResolvedValue({
      subject: 'Subject',
      html: '<p>Hello</p>',
    })
  })

  it('adds explicit Russian branches for hardcoded localText copy', () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../EmailTemplateEditor.vue'),
      'utf8',
    )

    expect(findLocalTextCallsWithoutRussianBranch(source)).toEqual([])
  })

  it('renders Russian event metadata and category badges instead of English fallback', async () => {
    const wrapper = mount(EmailTemplateEditor)
    await flushPromises()

    expect(wrapper.text()).toContain('Код подтверждения email')
    expect(wrapper.text()).toContain('Русский')
    expect(wrapper.text()).toContain('Авторизация')
    expect(wrapper.text()).toContain('Транзакционное')
    expect(wrapper.text()).toContain('Отправляется при регистрации')
    expect(wrapper.text()).not.toContain('Email Verification Code')
    expect(wrapper.text()).not.toContain('Transactional')
    expect(wrapper.text()).not.toContain('Backend English description')

    await wrapper.get('#email-template-event').setValue('subscription.expiry_reminder')
    await flushPromises()

    expect(wrapper.text()).toContain('Напоминание об окончании подписки')
    expect(wrapper.text()).toContain('Подписка')
    expect(wrapper.text()).toContain('Уведомление с отпиской')
    expect(wrapper.text()).toContain('за 7, 3 и 1 день')
    expect(wrapper.text()).not.toContain('Subscription Expiry Reminder')
    expect(wrapper.text()).not.toContain('Optional')

    await wrapper.get('#email-template-event').setValue('ops.scheduled_report')
    await flushPromises()

    expect(wrapper.text()).toContain('дайджестов ошибок')
    expect(wrapper.text()).not.toContain('ошибочный отчёт')

    wrapper.unmount()
  })
})
