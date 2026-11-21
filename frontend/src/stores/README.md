# Pinia stores

English | [Русский](README_RU.md)

The public store exports are defined in [`index.ts`](index.ts).

## Stores

| Export | Responsibility |
|---|---|
| `useAuthStore` | Access/refresh tokens, user, run mode, login/register/passkey/TOTP, OAuth token adoption, logout and pending auth sessions |
| `useAppStore` | Desktop/mobile navigation, loading counter, toasts, public settings/branding and version/update cache |
| `useAdminSettingsStore` | Cached admin settings and custom menu items |
| `useSubscriptionStore` | User subscription state with request caching/deduplication |
| `useOnboardingStore` | Onboarding tour callbacks and state |
| `useAnnouncementStore` | User announcements and throttled refresh |
| `usePaymentStore` | Payment configuration, orders and subscription plans |
| `useAdminComplianceStore` | Admin compliance status and acknowledgment gate |

Types such as `User`, `LoginRequest`, `Toast` and `ToastType` are re-exported for convenience.

## Auth store

Public state/computed values:

- `user`, `token`, read-only `runMode`, read-only `pendingAuthSession`;
- `isAuthenticated`, `isAdmin`, `isSimpleMode`, `hasPendingAuthSession`.

Public actions:

- `login`, `login2FA`, `loginWithPasskey`, `register`;
- `setToken` for callback flows;
- `logout`, `checkAuth`, `refreshUser`;
- `setPendingAuthSession`, `clearPendingAuthSession`.

`login()` may return a TOTP-required response without establishing the authenticated state. `logout()` attempts server-side refresh-token revocation but always clears the local session in `finally`.

```ts
const authStore = useAuthStore()
authStore.checkAuth()

const result = await authStore.login({ email, password })
if (authStore.isAuthenticated) {
  await router.push('/dashboard')
}
```

## App store

The app store includes:

- desktop/mobile sidebar state and scroll position;
- reference-counted global loading;
- `showToast`, `showSuccess`, `showError`, `showInfo`, `showWarning`;
- `withLoading` and `withLoadingAndError`;
- version/update cache via `fetchVersion`;
- public settings, branding, backend-mode state and injected-config initialization.

```ts
const appStore = useAppStore()
await appStore.withLoading(async () => saveForm())
appStore.showSuccess('Saved')
```

## Persistence and security

The auth store persists these keys in `localStorage`:

- `auth_token`, `auth_user`, `refresh_token`, `token_expires_at`;
- `pending_auth_session` for incomplete third-party flows.

It refreshes user data periodically and schedules token refresh before expiry. `localStorage` is readable by JavaScript running in the origin, so XSS prevention and strict control of third-party scripts are security requirements; do not describe this storage as inherently secure.

Most app UI state is not persisted. Public settings/version data are runtime caches and may be initialized from `window.__APP_CONFIG__`.

## Testing

```bash
cd frontend
pnpm test -- src/stores/__tests__/
pnpm typecheck
```

Use a fresh Pinia in tests. When the public return API or barrel exports change, update tests and both README languages together.
