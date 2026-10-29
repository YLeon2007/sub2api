# Authentication views

English | [Русский](README_RU.md)

This directory contains user-facing authentication, recovery and third-party callback views. Router definitions in [`../../router/index.ts`](../../router/index.ts) are the source of truth for paths and guards.

## Views and routes

| View | Route / role |
|---|---|
| `LoginView.vue` | `/login`; email/password, passkey, TOTP step-up and enabled OAuth providers |
| `RegisterView.vue` | `/register`; email/password registration with optional invitation, affiliate/promo code, Turnstile and email verification |
| `EmailVerifyView.vue` | `/email-verify`; email verification/pending registration flow |
| `ForgotPasswordView.vue` | `/forgot-password`; requests password reset when enabled |
| `ResetPasswordView.vue` | `/reset-password`; consumes reset state/token |
| `OAuthCallbackView.vue` | `/auth/callback` and `/auth/oauth/callback`; generic GitHub/Google callback |
| `LinuxDoCallbackView.vue` | `/auth/linuxdo/callback` |
| `WechatCallbackView.vue` | `/auth/wechat/callback` |
| `WechatPaymentCallbackView.vue` | `/auth/wechat/payment/callback` |
| `DingTalkCallbackView.vue` | `/auth/dingtalk/callback` |
| `DingTalkEmailCompletionView.vue` | `/auth/dingtalk/email-completion` |
| `OidcCallbackView.vue` | `/auth/oidc/callback` |

[`index.ts`](index.ts) intentionally barrel-exports only `LoginView` and `RegisterView`; router callbacks are lazy-imported directly.

## Login flow

`LoginView` uses email and password, not a username field. Features are controlled by public settings and may include:

- Cloudflare Turnstile;
- passkey authentication;
- TOTP two-factor completion after password login;
- GitHub, Google, LinuxDo, WeChat, DingTalk and generic OIDC entry points;
- password-reset link;
- login agreement modal/checkbox;
- backend-mode restrictions.

`useAuthStore.login()` can return a temporary TOTP-required response. Only `login2FA()` or another completed login path establishes the authenticated session.

## Registration flow

The current primary fields are email and password. Depending on settings, the view can additionally require/offer:

- an invitation code;
- an affiliate invitation code;
- a promo code;
- Turnstile;
- email verification before final activation;
- login/legal agreement acceptance.

Do not duplicate password lengths or validation regexes in this README: UI i18n/settings and backend validation are authoritative and can evolve. Server-side validation is mandatory regardless of client checks.

## Third-party callback flows

Callbacks may:

- complete login immediately;
- require TOTP;
- create a `pending_auth_session` to bind an existing account or create/adopt a new account;
- request a missing email/display-name/profile decision;
- return to the originally requested safe redirect.

Provider tokens, temporary auth tokens and callback errors are sensitive. Never log full callback URLs or persist credentials outside the auth store/API flow. Redirect targets must be validated by the implementation; do not add arbitrary external redirects in a view.

## State and dependencies

- [`../../stores/README.md`](../../stores/README.md): `useAuthStore`, `useAppStore`.
- [`../../components/layout/README.md`](../../components/layout/README.md): `AuthLayout`.
- [`../../router/README.md`](../../router/README.md): public/backend-mode guards.
- `@/api`: authentication, passkey, settings and callback APIs.
- `@/types`: request/response types.

## Security notes

- Use HTTPS in production.
- Do not treat client validation or route guards as authorization.
- Do not expose access/refresh/temp tokens in logs, analytics, screenshots or error messages.
- Keep Turnstile, agreements, invitation rules and OAuth provider switches fail-closed when settings are unavailable.
- `localStorage` tokens make XSS prevention and control of third-party scripts critical.
- Backend rate limits, signature/state validation and account-binding rules remain authoritative.

## Testing

Auth tests are under `__tests__/` and cover registration, verification and provider callbacks.

```bash
cd frontend
pnpm test -- src/views/auth/__tests__/
pnpm typecheck
```

When a view/route/provider flow changes, update router tests, auth-store tests and both README languages together. `USAGE_EXAMPLES.md` and `VISUAL_GUIDE.md` are supplementary examples, not the source of truth.
