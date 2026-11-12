import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '../locales/en'
import zh from '../locales/zh'
import ru from '../locales/ru'
import { i18n } from '../index'
import MCPView from '@/views/user/MCPView.vue'
import MCPOAuthAuthorizeView from '@/views/auth/MCPOAuthAuthorizeView.vue'

const mocks = vi.hoisted(() => ({
  getConnectionConfig: vi.fn(), listGrants: vi.fn(), revokeGrant: vi.fn(), previewAuthorization: vi.fn(), authorize: vi.fn(),
  route: { fullPath: '/oauth/mcp/authorize?request=1', query: {
    response_type: 'code', client_id: 'client-1', redirect_uri: 'https://client.example.com/callback', scope: 'mcp', state: 'state',
    code_challenge: 'a'.repeat(43), code_challenge_method: 'S256', resource: 'https://api.example.com/api/v1/mcp',
  } },
}))
vi.mock('@/api/mcp', () => ({ mcpAPI: mocks }))
vi.mock('vue-router', () => ({ useRoute: () => mocks.route }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => ({ isAdmin: false, user: { email: 'user@example.com' } }) }))
vi.mock('@/stores/app', () => ({ useAppStore: () => ({ showSuccess: vi.fn() }) }))
vi.mock('@/composables/useClipboard', () => ({ useClipboard: () => ({ copyToClipboard: vi.fn() }) }))
vi.mock('@/utils/format', () => ({ formatDate: (value: string) => value }))
vi.mock('@/components/layout/AppLayout.vue', () => ({ default: { template: '<main><slot /></main>' } }))
vi.mock('@/components/auth/TotpStepUpDialog.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/composables/useStepUp', () => ({ useStepUp: () => ({ run: (fn: () => unknown) => fn(), onCancel: vi.fn() }), isStepUpCancelled: () => false, isStepUpBlocked: () => false, stepUpBlockReason: () => '' }))
const mounted: ReturnType<typeof mount>[] = []
const priorLocale = i18n.global.locale.value
function render(component: typeof MCPView | typeof MCPOAuthAuthorizeView, locale: string) {
  const messages = locale.startsWith('ru') ? ru : locale === 'zh' ? zh : en
  const wrapper = mount(component, { global: {
    plugins: [createI18n({ legacy: false, locale, messages: { [locale]: messages } })],
    stubs: { Icon: true, RouterLink: true, BaseDialog: { props: ['show'], template: '<section v-if="show"><slot /><slot name="footer" /></section>' } },
  } })
  mounted.push(wrapper)
  return wrapper
}
beforeEach(() => {
  vi.resetAllMocks()
  i18n.global.locale.value = 'en'
  mocks.getConnectionConfig.mockResolvedValue({ resource: 'https://api.example.com/api/v1/mcp' })
  mocks.listGrants.mockResolvedValue([{ id: 'grant-1', client_id: 'client-1', client_name: 'Assistant', scope: 'user', read_only: true, created_at: '2026-10-28T00:00:00Z', expires_at: '2099-11-27T00:00:00Z', last_used_at: null, revoked_at: null, invalidated: false }])
  mocks.previewAuthorization.mockResolvedValue({ ...mocks.route.query, client_name: 'Assistant' })
})
afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  i18n.global.locale.value = priorLocale
})

describe('v0.2.20 MCP actual primary-error consumers', () => {
  it.each(['ru', 'ru-RU', 'en', 'zh'])('localizes connection and grant failures in %s without global-locale leakage', async locale => {
    mocks.getConnectionConfig.mockRejectedValue({ message: 'MCP public URL is not configured correctly' })
    mocks.listGrants.mockRejectedValue({ message: 'Service unavailable' })
    const wrapper = render(MCPView, locale)
    await flushPromises()
    const alerts = wrapper.findAll('[role="alert"]').map(node => node.text())
    expect(alerts).toEqual(locale.startsWith('ru') ? [ru.mcp.connectionLoadFailed, ru.mcp.loadFailed] : ['MCP public URL is not configured correctly', 'Service unavailable'])
  })
  it.each(['ru', 'ru-RU', 'en', 'zh'])('localizes revocation failures in %s and keeps the grant active', async locale => {
    mocks.revokeGrant.mockRejectedValue({ message: 'Try again later' })
    const wrapper = render(MCPView, locale)
    await flushPromises()
    await wrapper.get('[data-grant-id="grant-1"] button').trigger('click')
    await wrapper.get('[data-testid="confirm-revoke"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe(locale.startsWith('ru') ? ru.mcp.revokeFailed : 'Try again later')
    expect(wrapper.find('[data-grant-id="grant-1"] button').exists()).toBe(true)
  })
  it.each(['ru', 'ru-RU', 'en', 'zh'])('localizes preview rejection in %s and does not grant access', async locale => {
    mocks.previewAuthorization.mockRejectedValue({ message: 'Unregistered redirect URI' })
    const wrapper = render(MCPOAuthAuthorizeView, locale)
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe(locale.startsWith('ru') ? ru.mcp.consentLoadFailed : 'Unregistered redirect URI')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(mocks.authorize).not.toHaveBeenCalled()
  })
  it.each(['ru', 'ru-RU', 'en', 'zh'])('localizes submit rejection in %s without changing the requested grant', async locale => {
    mocks.authorize.mockRejectedValue({ message: 'Permission denied' })
    const wrapper = render(MCPOAuthAuthorizeView, locale)
    await flushPromises()
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe(locale.startsWith('ru') ? ru.mcp.consentSubmitFailed : 'Permission denied')
    expect(mocks.authorize).toHaveBeenCalledWith({ authorization: { ...mocks.route.query }, approved: true, scope: 'user', read_only: true })
  })
})
