# Layout components

English | [Русский](README_RU.md)

This directory contains the top-level Vue layouts and navigation shell. The public barrel exports are defined by [`index.ts`](index.ts).

## Public exports

| Export | Current role |
|---|---|
| `AppLayout` | Authenticated application shell; renders `AppSidebar`, `AppHeader` and the default page slot |
| `AppSidebar` | Responsive navigation built from user/admin state, feature settings and route links |
| `AppHeader` | Mobile menu, page context, user/balance controls and account actions |
| `AuthLayout` | Centered public/auth shell with default and `footer` slots |

`TablePageLayout.vue` exists for table-heavy pages but is not exported by `index.ts`; import it directly if needed. See `INTEGRATION.md` and `EXAMPLES.md` for its dedicated guidance.

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

`AppLayout` has one default slot. It does not expose a custom page-title slot; document titles and page metadata are resolved through the router/i18n and header implementation.

The layout reads sidebar state from `useAppStore`, renders onboarding/navigation helpers, and adjusts the content margin responsively.

## AuthLayout

```vue
<AuthLayout>
  <LoginForm />
  <template #footer>
    <RouterLink to="/register">Create account</RouterLink>
  </template>
</AuthLayout>
```

Branding comes from public settings (`siteName`, logo and subtitle). The component provides the default form slot and `footer` slot.

## Sidebar and header

Do not duplicate a static menu list in documentation: current entries depend on role, run mode, backend mode and feature switches such as payment, risk control and batch images. Treat `AppSidebar.vue` and its tests as the source of truth.

Icons use inline SVG render components; administrator-defined custom menu SVG is sanitized before rendering. HTML entity icons are not used.

## Dependencies and maintenance

- `useAuthStore`: user, role, run mode and logout.
- `useAppStore`: desktop/mobile sidebar, public settings, branding and version state.
- `useOnboardingStore`, `useAdminSettingsStore` and batch-image access helpers: onboarding, custom menu and feature visibility.
- Vue Router metadata/i18n: document/page labels.
- Tailwind utility styles and shared application CSS.

When changing exports, slots or navigation behavior, update implementation tests and both README languages together. Client-side visibility is not authorization; backend handlers must enforce access independently.
