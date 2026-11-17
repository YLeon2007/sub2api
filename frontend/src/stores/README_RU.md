# Pinia stores

[English](README.md) | Русский

Публичные store exports определены в [`index.ts`](index.ts).

## Stores

| Export | Ответственность |
|---|---|
| `useAuthStore` | Access/refresh tokens, user, run mode, login/register/passkey/TOTP, OAuth token adoption, logout, pending auth sessions |
| `useAppStore` | Desktop/mobile navigation, loading counter, toasts, public settings/branding, version/update cache |
| `useAdminSettingsStore` | Cached admin settings и custom menu items |
| `useSubscriptionStore` | User subscriptions с request caching/deduplication |
| `useOnboardingStore` | Onboarding tour state/callbacks |
| `useAnnouncementStore` | Announcements и throttled refresh |
| `usePaymentStore` | Payment config, orders, subscription plans |
| `useAdminComplianceStore` | Admin Compliance status и acknowledgment gate |

Типы `User`, `LoginRequest`, `Toast`, `ToastType` реэкспортируются для удобства.

## Auth store

Публичные state/computed:

- `user`, `token`, read-only `runMode`, read-only `pendingAuthSession`;
- `isAuthenticated`, `isAdmin`, `isSimpleMode`, `hasPendingAuthSession`.

Actions:

- `login`, `login2FA`, `loginWithPasskey`, `register`;
- `setToken` для callback flows;
- `logout`, `checkAuth`, `refreshUser`;
- `setPendingAuthSession`, `clearPendingAuthSession`.

`login()` может вернуть требование TOTP без создания authenticated state. `logout()` пытается отозвать refresh token на сервере, но всегда очищает local session в `finally`.

```ts
const authStore = useAuthStore()
authStore.checkAuth()

const result = await authStore.login({ email, password })
if (authStore.isAuthenticated) {
  await router.push('/dashboard')
}
```

## App store

Store управляет:

- desktop/mobile sidebar и scroll position;
- reference-counted global loading;
- `showToast`, `showSuccess`, `showError`, `showInfo`, `showWarning`;
- `withLoading`, `withLoadingAndError`;
- version/update cache через `fetchVersion`;
- public settings, branding, backend mode и injected config.

```ts
const appStore = useAppStore()
await appStore.withLoading(async () => saveForm())
appStore.showSuccess('Сохранено')
```

## Persistence и безопасность

Auth store сохраняет в `localStorage`:

- `auth_token`, `auth_user`, `refresh_token`, `token_expires_at`;
- `pending_auth_session` для незавершённых third-party flows.

Store периодически обновляет user data и заранее refresh-ит token. `localStorage` доступен любому JavaScript в origin, поэтому защита от XSS и контроль third-party scripts обязательны; такое хранение нельзя называть «безусловно безопасным».

Большинство UI state не сохраняется. Public settings/version — runtime caches и могут инициализироваться из `window.__APP_CONFIG__`.

## Тесты

```bash
cd frontend
pnpm test -- src/stores/__tests__/
pnpm typecheck
```

В tests используйте fresh Pinia. При изменении public return API/barrel exports обновляйте tests и оба README.
