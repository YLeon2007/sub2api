# Layout-компоненты

[English](README.md) | Русский

Каталог содержит верхнеуровневые Vue layouts и navigation shell. Публичные exports определены в [`index.ts`](index.ts).

## Публичные exports

| Export | Текущая роль |
|---|---|
| `AppLayout` | Shell аутентифицированной части; включает `AppSidebar`, `AppHeader` и default slot страницы |
| `AppSidebar` | Адаптивная навигация на основе user/admin state, feature settings и routes |
| `AppHeader` | Mobile menu, page context, user/balance controls и account actions |
| `AuthLayout` | Центрированный public/auth shell с default и `footer` slots |

`TablePageLayout.vue` существует для страниц с таблицами, но не экспортируется через `index.ts`; импортируйте напрямую. Специальные инструкции находятся в `INTEGRATION.md` и `EXAMPLES.md`.

## AppLayout

```vue
<template>
  <AppLayout>
    <RouterView />
  </AppLayout>
</template>

<script setup lang="ts">
import { AppLayout } from '@/components/layout'
</script>
```

У `AppLayout` один default slot. Custom page-title slot отсутствует; document/page labels определяются router/i18n и реализацией header.

Layout читает sidebar state из `useAppStore`, включает onboarding/navigation helpers и адаптивно меняет отступ content.

## AuthLayout

```vue
<AuthLayout>
  <LoginForm />
  <template #footer>
    <RouterLink to="/register">Создать аккаунт</RouterLink>
  </template>
</AuthLayout>
```

Branding берётся из public settings (`siteName`, logo, subtitle). Компонент предоставляет default form slot и `footer`.

## Sidebar и header

Не фиксируйте статический список menu items в документации: состав зависит от role, run mode, backend mode и feature switches (payment, risk control, batch image и др.). Source of truth — `AppSidebar.vue` и tests.

Icons реализованы inline SVG render components; SVG пользовательского admin menu проходит sanitization перед render. HTML entities не используются.

## Зависимости и поддержка

- `useAuthStore`: user, role, run mode, logout.
- `useAppStore`: desktop/mobile sidebar, public settings, branding, version state.
- `useOnboardingStore`, `useAdminSettingsStore` и batch-image access helpers: onboarding, custom menu, feature visibility.
- Vue Router metadata/i18n: labels страницы.
- Tailwind utilities и общие styles.

При изменении exports, slots или navigation behavior обновляйте tests и оба README. Скрытие элемента на клиенте не является authorization: доступ обязан проверять backend.
