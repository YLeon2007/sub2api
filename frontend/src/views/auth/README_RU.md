# Страницы аутентификации

[English](README.md) | Русский

Каталог содержит authentication, recovery и third-party callback views. Source of truth для paths/guards — [`../../router/index.ts`](../../router/index.ts).

## Views и routes

| View | Route / роль |
|---|---|
| `LoginView.vue` | `/login`; email/password, passkey, TOTP и включённые OAuth providers |
| `RegisterView.vue` | `/register`; email/password, invitation/affiliate/promo, Turnstile, email verification |
| `EmailVerifyView.vue` | `/email-verify`; подтверждение email/pending registration |
| `ForgotPasswordView.vue` | `/forgot-password`; запрос reset, если функция включена |
| `ResetPasswordView.vue` | `/reset-password`; применение reset state/token |
| `OAuthCallbackView.vue` | `/auth/callback`, alias `/auth/oauth/callback`; GitHub/Google callback |
| `LinuxDoCallbackView.vue` | `/auth/linuxdo/callback` |
| `WechatCallbackView.vue` | `/auth/wechat/callback` |
| `WechatPaymentCallbackView.vue` | `/auth/wechat/payment/callback` |
| `DingTalkCallbackView.vue` | `/auth/dingtalk/callback` |
| `DingTalkEmailCompletionView.vue` | `/auth/dingtalk/email-completion` |
| `OidcCallbackView.vue` | `/auth/oidc/callback` |

[`index.ts`](index.ts) намеренно экспортирует только `LoginView` и `RegisterView`; callbacks lazy-imported напрямую router-ом.

## Login flow

`LoginView` использует email и password, не username. В зависимости от public settings доступны:

- Cloudflare Turnstile;
- passkey authentication;
- TOTP completion после password login;
- GitHub, Google, LinuxDo, WeChat, DingTalk, OIDC;
- password-reset link;
- login agreement modal/checkbox;
- backend-mode restrictions.

`useAuthStore.login()` может вернуть временный TOTP-required response. Authenticated session появляется только после `login2FA()` или другого полностью завершённого login flow.

## Registration flow

Основные поля — email и password. Настройки могут дополнительно включить:

- обязательный invitation code;
- необязательный affiliate invitation code;
- promo code;
- Turnstile;
- email verification до активации;
- принятие login/legal agreement.

Не дублируйте в README длину password или regex: authoritative правила находятся в текущем UI/i18n/settings и backend validation. Client checks не заменяют server validation.

## Third-party callbacks

Callback может:

- сразу завершить login;
- потребовать TOTP;
- создать `pending_auth_session` для binding существующего account или создания/adoption нового;
- запросить отсутствующий email/display name/profile choice;
- вернуть пользователя по безопасному сохранённому redirect.

Provider/temp tokens и callback errors чувствительны. Не логируйте полные callback URLs и не сохраняйте credentials вне auth store/API flow. Redirect target обязан валидироваться implementation.

## Зависимости

- [`../../stores/README_RU.md`](../../stores/README_RU.md): `useAuthStore`, `useAppStore`.
- [`../../components/layout/README_RU.md`](../../components/layout/README_RU.md): `AuthLayout`.
- [`../../router/README_RU.md`](../../router/README_RU.md): public/backend-mode guards.
- `@/api`: auth/passkey/settings/callback API.
- `@/types`: request/response types.

## Безопасность

- В production используйте HTTPS.
- Client validation/routes не являются authorization.
- Не раскрывайте access/refresh/temp tokens в logs, analytics, screenshots или errors.
- Turnstile, agreements, invitation rules и provider switches должны работать fail-closed при недоступных settings.
- Tokens в `localStorage` делают XSS prevention и контроль third-party scripts критичными.
- Backend rate limits, state/signature validation и account-binding rules остаются authoritative.

## Тесты

```bash
cd frontend
pnpm test -- src/views/auth/__tests__/
pnpm typecheck
```

При изменении view/route/provider flow обновляйте router/auth-store tests и оба README. `USAGE_EXAMPLES.md` и `VISUAL_GUIDE.md` — дополнительные примеры, не source of truth.
