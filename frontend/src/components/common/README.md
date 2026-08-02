# Common Vue components

English | [Русский](README_RU.md)

This directory contains shared Vue 3 + TypeScript UI components. The public barrel API is [`index.ts`](index.ts); components not exported there are internal/direct-import building blocks and may change independently.

## Barrel exports

| Export | Purpose |
|---|---|
| `DataTable` | Responsive table/card view with client/server sorting, sticky columns, virtualization, row clicks and controlled selection |
| `Pagination` | Page navigation, configurable page size and optional page jump |
| `BaseDialog` | Teleported accessible dialog with focus/scroll handling |
| `ConfirmDialog` | Confirmation prompt built on `BaseDialog` |
| `StatCard` | Metric card with optional icon and change indicator |
| `Toast` | Renderer for notifications stored in `useAppStore` |
| `LoadingSpinner` | Size/color variants of a loading indicator |
| `EmptyState` | Empty-result placeholder with optional action |
| `LocaleSwitcher` | Application locale selector |
| `ExportProgressDialog` | Export progress/result dialog |
| `Column` | Type exported from `types.ts` for `DataTable` columns |

The directory also contains specialized components such as form controls, selectors, badges and image/announcement helpers. Import one directly only when it is not part of the barrel API.

## DataTable

Required props:

- `columns: Column[]`
- `data: any[]`

Important optional props include `loading`, sticky/action behavior, `rowKey`, persisted/default sorting, `serverSideSort`, row clicks, virtualization and controlled selection. Read the `Props` interface in [`DataTable.vue`](DataTable.vue) before adding a new usage.

Events:

- `sort(key, order)` in server-side mode;
- `rowClick(row)` when `clickableRows` is enabled;
- `update:selectedKeys` and `selectionChange` for selection.

Slots include `empty`, `header-{column.key}`, `cell-{column.key}` and the specialized `cell-actions`; cell slots receive the row/value context exposed by the component.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { DataTable, type Column } from '@/components/common'

const selected = ref<Array<string | number>>([])
const columns: Column[] = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'email', label: 'Email' },
  { key: 'actions', label: 'Actions', class: 'text-right' }
]
const users = ref([{ id: 1, name: 'Ada', email: 'ada@example.com' }])
</script>

<template>
  <DataTable
    v-model:selected-keys="selected"
    :columns="columns"
    :data="users"
    row-key="id"
    selectable
  >
    <template #cell-actions="{ row }">
      <button @click.stop="editUser(row)">Edit</button>
    </template>
  </DataTable>
</template>
```

## Pagination

Props are `total`, `page`, `pageSize`, optional `pageSizeOptions`, `showPageSizeSelector` and `showJump`. It emits `update:page` and `update:pageSize`.

```vue
<Pagination
  :total="total"
  :page="page"
  :page-size="pageSize"
  show-jump
  @update:page="page = $event"
  @update:page-size="pageSize = $event"
/>
```

## Dialogs

`BaseDialog` uses `show`, `title`, `width` (`narrow`, `normal`, `wide`, `extra-wide`, `full`), close behavior and optional `zIndex`. It emits `close` and exposes default/footer slots.

```vue
<BaseDialog :show="open" title="Edit user" width="wide" @close="open = false">
  <UserForm />
  <template #footer><button @click="open = false">Close</button></template>
</BaseDialog>
```

Use `ConfirmDialog` when only confirm/cancel behavior is needed.

## Toasts

Render `<Toast />` once near the app/layout root. Create notifications through `useAppStore`:

```ts
const appStore = useAppStore()
appStore.showSuccess('Saved')
appStore.showError('Save failed')
```

The old `addToast({ title, ... })` API is not part of the current store.

## Maintenance

- Preserve code identifiers and slot/event names in translations.
- Update `index.ts`, tests and both README languages together when changing a public export.
- Do not claim accessibility behavior that is not covered by the component implementation/tests.
