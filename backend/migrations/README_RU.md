# Миграции базы данных

[English](README.md) | Русский

В этом каталоге находятся forward-only SQL migrations, встроенные в backend Sub2API. Приложение автоматически применяет их при startup под PostgreSQL advisory lock.

## Имена и порядок

Используйте числовой prefix с ведущими нулями и description в `snake_case`. В существующей истории также встречается optional letter suffix для упорядоченных follow-up/hotfix migrations (`006b_*`, `108a_*` и аналогичные). Фактический порядок runner — лексикографический.

```text
192_group_profit_control.sql
193_group_profit_control_auth_cache_invalidation.sql
193a_group_profit_control_follow_up.sql
```

Не переиспользуйте, не переименовывайте и не переставляйте опубликованные filenames. Для обычной работы берите следующий свободный numeric prefix; letter suffix используйте только для проверенного follow-up, который должен остаться рядом в лексикографическом порядке.

## Режимы выполнения

Текущий runner: [`internal/repository/migrations_runner.go`](../internal/repository/migrations_runner.go).

- Обычные `*.sql` выполняются одной транзакцией.
- `*_notx.sql` выполняются без транзакции и предназначены только для `CREATE INDEX CONCURRENTLY` / `DROP INDEX CONCURRENTLY`.
- Runner выполняет обычный файл целиком и не разбирает Goose sections `Up`/`Down`.
- В `schema_migrations` сохраняются filename, `applied_at` и SHA-256 от содержимого файла после `TrimSpace`.
- Применённый файл пропускается только при совпадении checksum, кроме узких исторических compatibility rules в коде runner.

В `_notx.sql` разрешены только поддерживаемые concurrent-index statements, без `BEGIN`, `COMMIT`, сторонних DDL/DML. Они должны быть идемпотентны:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_example ON example_table (example_column);
DROP INDEX CONCURRENTLY IF EXISTS idx_old_example;
```

## Неизменяемость

**После применения migration в любом общем окружении её нельзя изменять, удалять, переименовывать или переставлять.** Checksum mismatch намеренно блокирует startup, иначе схемы окружений разойдутся.

Исправления делаются новой migration. Для rollback release восстановите совместимый backup БД либо добавьте проверенную compensating migration; общего `migrate-down` target нет.

## Рабочий процесс

Команды предполагают каталог `backend/`.

1. Определите следующий свободный номер.
2. Создайте одну сфокусированную migration:

   ```bash
   $EDITOR migrations/NNN_short_description.sql
   ```

3. Где допускает семантика, используйте идемпотентные операции вроде `ADD COLUMN IF NOT EXISTS`.
4. Оцените locks, table rewrite, index build и проверьте на реалистичном объёме данных.
5. Запустите тесты:

   ```bash
   go test ./internal/repository -run 'Migration|Migrations'
   go test ./...
   ```

6. Запустите backend с disposable PostgreSQL, проверьте startup, схему, данные и повторный идемпотентный startup.
7. До production создайте и проверьте свежий backup и процедуру restore/rollback.

## Пример

```sql
-- Forward-only migration. Объясните причину изменения.
ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS example_column VARCHAR(100);
```

Не помещайте rollback SQL в конец того же файла: runner выполнит его как часть forward migration.

## Диагностика

### Checksum mismatch

```text
migration NNN_name.sql checksum mismatch (db=abc123... file=def456...)
```

Восстановите точный опубликованный файл и создайте новую migration:

```bash
git log --oneline -- migrations/NNN_name.sql
git checkout <original-commit> -- migrations/NNN_name.sql
$EDITOR migrations/NEW_description.sql
```

Не меняйте `schema_migrations.checksum`, чтобы скрыть непроверенное изменение.

### Ошибка migration

- Обычная migration откатывает свою транзакцию.
- Concurrent index migration может оставить invalid index; перед retry проверьте PostgreSQL и preflight/recovery runner.
- Исправлять исходный файл можно только если он нигде в общем окружении не применялся; иначе добавляйте новый.

Read-only просмотр состояния:

```bash
psql "$DATABASE_URL" -c \
  "SELECT filename, checksum, applied_at FROM schema_migrations ORDER BY applied_at DESC;"
```

Не вставляйте фиктивные строки в `schema_migrations` на staging/production: это обходит выполнение схемы и проверку checksum.

## Ссылки

- [Migration runner](../internal/repository/migrations_runner.go)
- [Документация PostgreSQL](https://www.postgresql.org/docs/)
