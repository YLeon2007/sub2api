import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { computed, nextTick, reactive, ref } from 'vue'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import LoginAgreementPrompt from '@/components/auth/LoginAgreementPrompt.vue'
import LegalDocumentView from '@/views/public/LegalDocumentView.vue'
import { localizeLoginAgreementDocumentTitle } from '@/utils/loginAgreement'
import { i18n as globalI18n } from '@/i18n'
import type { LoginAgreementDocument } from '@/types'
import en from '../locales/en'
import ru from '../locales/ru'
import zh from '../locales/zh'
import { actualElements, actualHandler, actualObjectFields, hasBinding, NodeTypes, renderActual } from './ruSiblingRuntimeHarness'

const publicState = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }))
vi.mock('@/stores/app', () => ({ useAppStore: () => ({
  get cachedPublicSettings() { return publicState.settings },
  fetchPublicSettings: async () => publicState.settings,
}) }))

// Exact defaults returned by backend/internal/service/setting_public.go.
const defaults = [
  { id: 'terms', title: '服务条款', content_md: '' },
  { id: 'usage-policy', title: '使用政策', content_md: '' },
  { id: 'supported-regions', title: '支持的国家和地区', content_md: '' },
  { id: 'service-specific-terms', title: '服务特定条款', content_md: '' },
]
const russianTitles = ['Условия обслуживания', 'Политика использования', 'Поддерживаемые страны и регионы', 'Специальные условия сервиса']
const englishTitles = ['Terms of Service', 'Usage Policy', 'Supported Countries and Regions', 'Service-Specific Terms']
const settingsPath = 'views/admin/SettingsView.vue'
const locales = ['ru', 'ru-RU', 'en', 'zh'] as const
function plugin(locale: typeof locales[number]) {
  // The display sink must use its active composer, not the imported singleton.
  expect(globalI18n.global.locale.value).toBe('en')
  return createI18n({ legacy: false, locale, fallbackLocale: false, messages: { en, ru, zh, 'ru-RU': ru } })
}

function settingsTitleNodes() {
  const headings = actualElements(settingsPath, node => node.tag === 'p' && node.children.some(child =>
    child.type === NodeTypes.INTERPOLATION && child.content.type === NodeTypes.SIMPLE_EXPRESSION &&
    (child.content.content.includes('doc.title') || child.content.content.includes('localizeLoginAgreementDocumentTitle'))))
  const inputs = actualElements(settingsPath, node => node.tag === 'input' && node.props.some(prop =>
    prop.type === NodeTypes.DIRECTIVE && prop.exp?.type === NodeTypes.SIMPLE_EXPRESSION &&
    (prop.exp.content === 'doc.title' || prop.exp.content.includes('localizeLoginAgreementDocumentTitle'))))
  expect(headings).toHaveLength(1)
  expect(inputs).toHaveLength(1)
  return [...headings, ...inputs]
}

function settingsScope(doc = reactive({ ...defaults[0] }), language = 'ru') {
  const locale = ref(language)
  const localText = actualHandler(settingsPath, 'localText', {
    isZhLocale: computed(() => locale.value.startsWith('zh')),
    isRuLocale: computed(() => locale.value.startsWith('ru')),
  })
  return { doc, locale, localText, localizeLoginAgreementDocumentTitle }
}

describe('agreement document default title display', () => {
  it.each(locales)('renders default and custom headings on the actual public legal page while keeping Markdown and selection raw (%s)', async locale => {
    const documents = [...defaults.map(doc => ({ ...doc, content_md: '# Original legal Markdown' })),
      { id: 'custom-policy', title: '服务条款 · Operator custom', content_md: '# Original legal Markdown' }]
    publicState.settings = { site_name: 'Operator site', login_agreement_documents: documents }
    const i18n = plugin(locale)
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/legal/:documentId', name: 'LegalDocument', component: LegalDocumentView },
      { path: '/home', component: { template: '<div />' } },
      { path: '/login', component: { template: '<div />' } },
    ] })
    await router.push('/legal/terms')
    await router.isReady()
    const wrapper = mount(LegalDocumentView, { global: { plugins: [i18n, router] } })
    await flushPromises()
    for (const [index, doc] of defaults.entries()) {
      await router.push(`/legal/${doc.id}`)
      expect(wrapper.get('article > div h1').text()).toBe(locale.startsWith('ru') ? russianTitles[index] : doc.title)
      expect(wrapper.get('.legal-document-content h1').text()).toBe('Original legal Markdown')
      expect(router.currentRoute.value.params.documentId).toBe(doc.id)
    }
    await router.push('/legal/custom-policy')
    expect(wrapper.get('article > div h1').text()).toBe(documents[4].title)
    expect(publicState.settings.login_agreement_documents).toEqual(documents)
    wrapper.unmount()
  })

  it.each(locales)('uses default and custom labels in real login checkbox links and modal cards without changing routes or consent events (%s)', async locale => {
    const i18n = plugin(locale)
    const documents = [...defaults, { id: 'operator-terms', title: '服务条款 · Operator custom', content_md: '' }]
    const titles = [...(locale.startsWith('ru') ? russianTitles : defaults.map(doc => doc.title)), documents[4].title]
    const wrapper = mount(LoginAgreementPrompt, {
      props: { accepted: false, documents, mode: 'checkbox', visible: true },
      global: { plugins: [i18n], stubs: { RouterLink: RouterLinkStub, Teleport: true } },
    })
    const links = wrapper.findAllComponents(RouterLinkStub)
    expect(links.map(link => link.text())).toEqual([...titles, ...titles])
    expect(links.map(link => link.props('to'))).toEqual([...documents, ...documents].map(doc => ({ name: 'LegalDocument', params: { documentId: doc.id } })))
    expect(wrapper.text()).toContain(i18n.global.t('legal.loginAgreementPrompt.checkboxPrefix'))
    await wrapper.get('input[type=checkbox]').setValue(true)
    expect(wrapper.emitted('accept')).toEqual([[]])
    expect(defaults.map(doc => doc.title)).toEqual(['服务条款', '使用政策', '支持的国家和地区', '服务特定条款'])
    wrapper.unmount()
  })

  it.each(locales)('shows the four server defaults in actual Settings headings and title inputs (%s)', locale => {
    const nodes = settingsTitleNodes()
    defaults.forEach((document, index) => {
      const scope = settingsScope(reactive({ ...document }), locale)
      const wrapper = renderActual(nodes, scope)
      expect(wrapper.get('p').text()).toBe(locale.startsWith('ru') ? russianTitles[index] : document.title)
      expect(wrapper.get('input').element.value).toBe(locale.startsWith('ru') ? russianTitles[index] : document.title)
      expect(scope.doc).toEqual(document)
      wrapper.unmount()
    })
  })

  it('keeps untouched raw titles, IDs and Markdown in the real save projection after field edits and locale changes', async () => {
    const form = reactive({ login_agreement_documents: defaults.map(doc => ({ ...doc, content_md: '# Original\n\nKeep  internal spacing' })) })
    const original = JSON.parse(JSON.stringify(form.login_agreement_documents))
    const normalizer = actualHandler(settingsPath, 'normalizeLoginAgreementDocumentsForSave', {
      form, normalizeLoginAgreementDocumentId: actualHandler(settingsPath, 'normalizeLoginAgreementDocumentId', {}),
    }) as unknown as () => LoginAgreementDocument[]
    function savePayload() {
      const savedForm = { ...form, login_agreement_documents: normalizer() }
      return actualObjectFields(settingsPath, 'payload', ['login_agreement_documents'], { form: savedForm }, 'saveSettings').login_agreement_documents
    }
    const nodes = settingsTitleNodes()
    const markdown = actualElements(settingsPath, node => node.tag === 'textarea' && hasBinding(node, 'model', 'doc.content_md'))
    expect(markdown).toHaveLength(1)
    const firstScope = settingsScope(form.login_agreement_documents[0])
    const first = renderActual([...nodes, ...markdown], firstScope)
    const second = renderActual(nodes, settingsScope(form.login_agreement_documents[1]))
    expect(savePayload()).toEqual(original)
    firstScope.locale.value = 'en'
    await nextTick()
    expect(first.get('input').element.value).toBe(defaults[0].title)
    firstScope.locale.value = 'ru-RU'
    await nextTick()
    expect(first.get('input').element.value).toBe(russianTitles[0])
    expect(savePayload()).toEqual(original)
    await first.get('textarea').setValue('# Explicit Markdown edit')
    await second.get('input').setValue('Operator custom · 使用政策')
    expect(savePayload()).toEqual(original.map((doc: LoginAgreementDocument, index: number) => ({ ...doc,
      ...(index === 0 ? { content_md: '# Explicit Markdown edit' } : {}),
      ...(index === 1 ? { title: 'Operator custom · 使用政策' } : {}),
    })))
    expect(first.get('input').element.value).toBe(russianTitles[0])
    await first.get('input').setValue('Explicit Russian-user rename')
    expect(form.login_agreement_documents[0].title).toBe('Explicit Russian-user rename')
    firstScope.locale.value = 'zh'
    await nextTick()
    expect(first.get('input').element.value).toBe('Explicit Russian-user rename')
    first.unmount()
    second.unmount()
  })

  it.each(['ru', 'RU', 'ru-RU', 'ru_RU', 'en', 'zh', 'rubbish'])('matches only exact canonical ID/title pairs for locale %s', locale => {
    const russian = ['ru', 'RU', 'ru-RU', 'ru_RU'].includes(locale)
    defaults.forEach((doc, index) => {
      for (const title of [doc.title, englishTitles[index]]) {
        const input = Object.freeze({ ...doc, title })
        expect(localizeLoginAgreementDocumentTitle(input, locale)).toBe(russian ? russianTitles[index] : title)
      }
      for (const custom of [
        { ...doc, title: `${doc.title} · operator` },
        { ...doc, title: ` ${doc.title}` },
        { ...doc, title: englishTitles[index].toLowerCase() },
        { ...doc, title: '' },
        { ...doc, id: `custom-${doc.id}` },
        { ...doc, id: defaults[(index + 1) % defaults.length].id },
        { ...doc, id: doc.id.toUpperCase() },
      ]) expect(localizeLoginAgreementDocumentTitle(custom, locale)).toBe(custom.title)
    })
  })

  it('binds the canonical Chinese inventory to the actual backend defaults', () => {
    const source = readFileSync(resolve(process.cwd(), '../backend/internal/service/setting_public.go'), 'utf8')
    const body = source.split('func defaultLoginAgreementDocuments()')[1].split('func normalizeLoginAgreementDocumentID')[0]
    const actual = [...body.matchAll(/ID:\s*"([^"]+)"[\s\S]*?Title:\s*"([^"]+)"[\s\S]*?ContentMD:\s*"([^"]*)"/g)]
      .map(([, id, title, content_md]) => ({ id, title, content_md }))
    expect(actual).toEqual(defaults)
  })

  it.each(['views/auth/LoginView.vue', 'views/auth/RegisterView.vue'])('preserves raw documents and explicit/fallback consent revisions in %s', path => {
    const scope = {
      loginAgreementDocuments: ref<LoginAgreementDocument[]>([]), loginAgreementEnabled: ref(false),
      loginAgreementMode: ref(''), loginAgreementUpdatedAt: ref(''), loginAgreementRevision: ref(''),
      agreementAccepted: ref(false), showAgreementModal: ref(false), hasAcceptedLoginAgreement: vi.fn(() => true),
    }
    const apply = actualHandler(path, 'applyLoginAgreementSettings', scope) as unknown as (settings: Record<string, unknown>) => void
    for (const revision of ['opaque-server-revision', '']) {
      apply({ login_agreement_documents: defaults, login_agreement_enabled: true, login_agreement_mode: 'checkbox',
        login_agreement_updated_at: '2026-11-09', login_agreement_revision: revision })
      const expected = revision || `2026-11-09:${defaults.map(doc => `${doc.id}:${doc.title}`).join('|')}`
      expect(scope.loginAgreementDocuments.value).toEqual(defaults)
      expect(scope.loginAgreementRevision.value).toBe(expected)
      expect(scope.hasAcceptedLoginAgreement).toHaveBeenLastCalledWith(expected)
      expect(scope.agreementAccepted.value).toBe(true)
      expect(scope.showAgreementModal.value).toBe(false)
    }
  })
})
