# Общие Vue-компоненты

[English](README.md) | Русский

В этом каталоге находятся общие UI-компоненты Vue 3 + TypeScript. Публичный barrel API определён в [`index.ts`](index.ts); компоненты, которые оттуда не экспортируются, считаются internal/direct-import и могут меняться независимо.

## Barrel exports

| Export | Назначение |
|---|---|
| `DataTable` | Адаптивная table/card view, client/server sorting, sticky columns, virtualization, row click и controlled selection |
| `Pagination` | Навигация по страницам, page size и необязательный jump |
| `BaseDialog` | Teleport-dialog с focus/scroll handling |
| `ConfirmDialog` | Подтверждение на базе `BaseDialog` |
| `StatCard` | Карточка метрики с icon/change indicator |
| `Toast` | Отображение notifications из `useAppStore` |
| `LoadingSpinner` | Индикатор загрузки с вариантами размера/цвета |
| `EmptyState` | Пустое состояние с необязательным action |
| `LocaleSwitcher` | Переключатель locale приложения |
| `ExportProgressDialog` | Диалог прогресса/результата экспорта |
| `Column` | Тип колонок `DataTable` из `types.ts` |

В каталоге также есть специализированные controls, selectors, badges и image/announcement helpers. Импортируйте их напрямую только если export отсутствует в barrel API.

## DataTable

Обязательные props:

- `columns: Column[]`;
- `data: any[]`.

Дополнительные props управляют loading, sticky/action columns, `rowKey`, сортировкой, `serverSideSort`, row click, virtualization и selection. Перед новым использованием проверяйте `Props` в [`DataTable.vue`](DataTable.vue).

Events:

- `sort(key, order)` в server-side режиме;
- `rowClick(row)` при `clickableRows`;
- `update:selectedKeys` и `selectionChange`.

Slots: `empty`, `header-{column.key}`, `cell-{column.key}` и специальный `cell-actions`; cell slots получают row/value context, который предоставляет компонент.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { DataTable, type Column } from '@/components/common'

const selected = ref<Array<string | number>>([])
const columns: Column[] = [
  { key: 'name', label: 'Имя', sortable: true },
  { key: 'email', label: 'Email' },
  { key: 'actions', label: 'Действия', class: 'text-right' }
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
      <button @click.stop="editUser(row)">Изменить</button>
    </template>
  </DataTable>
</template>
```

## Pagination

Props: `total`, `page`, `pageSize`, optional `pageSizeOptions`, `showPageSizeSelector`, `showJump`. Events: `update:page`, `update:pageSize`.

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

## Диалоги

`BaseDialog` принимает `show`, `title`, `width` (`narrow`, `normal`, `wide`, `extra-wide`, `full`), close behavior и optional `zIndex`. Он emits `close` и имеет default/footer slots.

```vue
<BaseDialog :show="open" title="Изменить пользователя" width="wide" @close="open = false">
  <UserForm />
  <template #footer><button @click="open = false">Закрыть</button></template>
</BaseDialog>
```

Для простого confirm/cancel используйте `ConfirmDialog`.

## Toast

Разместите `<Toast />` один раз у корня app/layout. Notifications создаются через `useAppStore`:

```ts
const appStore = useAppStore()
appStore.showSuccess('Сохранено')
appStore.showError('Ошибка сохранения')
```

Старый API `addToast({ title, ... })` в текущем store отсутствует.

## Поддержка

- Не переводите code identifiers, slot/event names.
- При изменении публичного export синхронно обновляйте `index.ts`, tests и оба README.
- Не заявляйте accessibility behavior, которого нет в implementation/tests.
