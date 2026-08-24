# Конфигурация Vue Router

[English](README.md) | Русский

Router использует Vue Router history mode, lazy-loaded views, authentication/role/feature guards, локализованные document titles, navigation progress/prefetch и recovery после устаревших dynamic chunks.

Source of truth: [`index.ts`](index.ts). Типы metadata: [`meta.d.ts`](meta.d.ts).

## Группы routes

Это обзор; полный список всегда находится в `routes` файла `index.ts`.

### Setup и public

- `/setup`: first-run setup; после завершения происходит redirect.
- `/` перенаправляет на `/home`.
- `/home`, `/model-plaza`, `/key-usage`, `/legal/:documentId`.
- Аутентификация: `/login`, `/register`, `/email-verify`, `/forgot-password`, `/reset-password`.
- OAuth callbacks: `/auth/callback` (alias `/auth/oauth/callback`), LinuxDo, WeChat, WeChat Payment, DingTalk, OIDC.
- Публичные payment result/hosted pages под `/payment/*` согласно `index.ts`.

### Authenticated user

Основные routes: `/dashboard`, `/keys`, `/batch-image` (alias `/docs/batch-image`), `/usage`, `/redeem`, `/affiliate`, `/available-channels`, `/profile`, `/subscriptions`, `/purchase`, `/orders`, `/monitor`, `/custom/:id`.

### Admin

`/admin` перенаправляет на `/admin/dashboard`. Admin routes охватывают operations, audit logs, users, groups, channels/monitoring, subscriptions, accounts, announcements, proxies, redeem/promo codes, settings, risk control, prompt audit, usage, affiliates и payment orders/plans.

Неизвестный path попадает в `/:pathMatch(.*)*` и `NotFoundView`.

## Route metadata

```ts
interface RouteMeta {
  requiresAuth?: boolean       // default true
  requiresAdmin?: boolean      // default false
  requiresPayment?: boolean
  requiresRiskControl?: boolean
  title?: string
  titleKey?: string
  descriptionKey?: string
  breadcrumbs?: Array<{ label: string; to?: string }>
  icon?: string
  hideInMenu?: boolean
}
```

Используйте lazy imports:

```ts
{
  path: '/example',
  name: 'Example',
  component: () => import('@/views/ExampleView.vue'),
  meta: { requiresAuth: true, titleKey: 'example.title' }
}
```

## Порядок guards

Глобальный `beforeEach`:

1. запускает navigation loading;
2. при первой навигации восстанавливает `useAuthStore`;
3. определяет локализованный document title;
4. проверяет setup state;
5. применяет public/login/register/backend-mode rules;
6. требует authentication и сохраняет `to.fullPath` для redirect после login;
7. проверяет admin role;
8. загружает Admin Compliance для admin routes;
9. загружает public settings до payment/risk-control gates;
10. применяет simple-mode restrictions;
11. применяет backend-mode restrictions.

Особенности:

- Admin после login идёт в `/admin/dashboard`, обычный user — в `/dashboard`.
- Model Plaza доступен только при включённом switch и может требовать login.
- Backend mode использует явный allowlist login/setup/key usage/legal/payment callbacks и pending-auth flows.
- Simple mode ограничивает часть subscription/redeem/group pages.
- `requiresPayment`/`requiresRiskControl` отключаются только явным успешно загруженным `false`; transient failure не считается подтверждённым отключением.

`afterEach` завершает loading и запускает idle prefetch. `onError` распознаёт chunk load failure после deployment и допускает один timed reload через `sessionStorage`.

## Навигация

```ts
const router = useRouter()
router.push({ path: '/usage', query: { page: 1 } })

const route = useRoute()
const isAdminPage = route.path.startsWith('/admin')
```

`scrollBehavior` восстанавливает history position, иначе прокручивает вверх.

## Тесты

```bash
cd frontend
pnpm test -- src/router/__tests__/
pnpm typecheck
```

При изменении route обновляйте `index.ts`, sidebar/navigation tests и оба README. Client-side guards улучшают UX, но не заменяют backend authorization.
