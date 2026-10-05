# Vue Router configuration

English | [Русский](README_RU.md)

The router uses Vue Router history mode, lazy-loaded views, authentication/role/feature guards, localized document titles, navigation progress/prefetch and recovery from stale dynamic chunks.

Source of truth: [`index.ts`](index.ts). Metadata types: [`meta.d.ts`](meta.d.ts).

## Route groups

The list below is a maintained overview, not a substitute for `routes` in `index.ts`.

### Setup and public

- `/setup`: first-run setup; redirects away when setup is complete.
- `/` redirects to `/home`.
- `/home`, `/model-plaza`, `/key-usage`, `/legal/:documentId`.
- Authentication: `/login`, `/register`, `/email-verify`, `/forgot-password`, `/reset-password`.
- OAuth callbacks: `/auth/callback` (alias `/auth/oauth/callback`), LinuxDo, WeChat, WeChat Payment, DingTalk and OIDC callback paths.
- Public payment result/hosted pages under `/payment/*` as declared in `index.ts`.

### Authenticated user

Representative routes include `/dashboard`, `/keys`, `/batch-image` (alias `/docs/batch-image`), `/usage`, `/redeem`, `/affiliate`, `/available-channels`, `/profile`, `/subscriptions`, `/purchase`, `/orders`, `/monitor`, and `/custom/:id`.

### Admin

`/admin` redirects to `/admin/dashboard`. Admin routes cover operations, audit logs, users, groups, channels/monitoring, subscriptions, accounts, announcements, proxies, redeem/promo codes, settings, risk control, prompt audit, usage, affiliates and payment orders/plans.

Unknown paths match `/:pathMatch(.*)*` and render `NotFoundView`.

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

Use lazy imports:

```ts
{
  path: '/example',
  name: 'Example',
  component: () => import('@/views/ExampleView.vue'),
  meta: { requiresAuth: true, titleKey: 'example.title' }
}
```

## Guard order and behavior

The global `beforeEach` currently:

1. starts navigation loading;
2. restores `useAuthStore` from local storage on first navigation;
3. resolves the localized document title;
4. checks setup state for `/setup`;
5. applies public-route, login/register and backend-mode rules;
6. requires authentication and preserves `to.fullPath` in the login redirect;
7. enforces admin role;
8. loads/administers Admin Compliance state for admin routes;
9. loads public settings before payment/risk-control feature gates;
10. applies simple-mode restrictions;
11. applies backend-mode restrictions.

Important special cases:

- Authenticated admins go to `/admin/dashboard`; regular users go to `/dashboard` when redirected away from login/register.
- Model Plaza is public only when enabled and may itself require authentication.
- Backend mode has an explicit allowlist for login, setup, key usage, legal/payment callbacks and pending-auth flows.
- Simple mode blocks selected subscription/redeem/group admin pages.
- `requiresPayment` and `requiresRiskControl` are disabled only by an explicit successfully loaded setting; a transient settings failure is treated as unknown and backend authorization remains authoritative.

`afterEach` ends loading and triggers idle route prefetch. `onError` detects dynamic import/chunk failures after a deployment and performs at most one timed reload attempt using `sessionStorage`.

## Navigation

```ts
const router = useRouter()
router.push({ path: '/usage', query: { page: 1 } })

const route = useRoute()
const isAdminPage = route.path.startsWith('/admin')
```

The configured `scrollBehavior` restores browser history positions and otherwise scrolls to the top.

## Testing

Router tests are under `__tests__/` and cover guards, feature access, WeChat routes and titles.

```bash
cd frontend
pnpm test -- src/router/__tests__
pnpm typecheck
```

When adding or changing a route, update `index.ts`, relevant sidebar/navigation tests and both README languages. Client-side guards are UX only; backend endpoints must independently enforce authentication, roles and feature access.
