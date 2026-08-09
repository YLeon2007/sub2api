import { describe, expect, it } from 'vitest'
import { resolveWeChatOAuthStart } from '@/api/auth'

const mobileOnly = {
  wechat_oauth_enabled: true,
  wechat_oauth_open_enabled: false,
  wechat_oauth_mp_enabled: false,
  wechat_oauth_mobile_enabled: true,
}

describe('resolveWeChatOAuthStart mobile-only capability', () => {
  it('requires the native app from a regular browser', () => {
    expect(resolveWeChatOAuthStart(mobileOnly, 'Mozilla/5.0')).toMatchObject({
      mode: null,
      mobileEnabled: true,
      unavailableReason: 'native_app_required',
    })
  })

  it('requires the native app from the WeChat browser too', () => {
    expect(resolveWeChatOAuthStart(mobileOnly, 'Mozilla/5.0 MicroMessenger')).toMatchObject({
      mode: null,
      mobileEnabled: true,
      unavailableReason: 'native_app_required',
    })
  })
})
