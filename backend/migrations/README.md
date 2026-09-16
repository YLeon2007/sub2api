# Database migrations

English | [Русский](README_RU.md)

This directory contains the forward-only SQL migrations embedded in the Sub2API backend. The application applies them automatically at startup under a PostgreSQL advisory lock.

## Naming and order

Use a zero-padded numeric prefix and `snake_case` description. Existing history also uses an optional letter suffix for ordered follow-up/hotfix migrations (`006b_*`, `108a_*`, and similar). The runner's actual order is lexicographic.

```text
192_group_profit_control.sql
193_group_profit_control_auth_cache_invalidation.sql
193a_group_profit_control_follow_up.sql
```

Never reuse, rename or reorder a published filename. Prefer the next unused numeric prefix for normal work; use a letter suffix only when a reviewed follow-up must remain adjacent in the lexicographic sequence.

## Execution modes

The custom runner is [`internal/repository/migrations_runner.go`](../internal/repository/migrations_runner.go).

- Regular `*.sql` files execute as one transaction.
- `*_notx.sql` files execute without a transaction and are reserved for `CREATE INDEX CONCURRENTLY` / `DROP INDEX CONCURRENTLY`.
- The runner executes the whole regular file. It does **not** parse Goose `Up`/`Down` sections.
- A SHA-256 of the trimmed file content is stored in `schema_migrations` with filename and `applied_at`.
- Already-applied files are skipped only when their checksum matches (except narrow historical compatibility rules in the runner).

A `_notx.sql` migration must contain only supported concurrent-index statements, without `BEGIN`, `COMMIT`, unrelated DDL or DML. Make it idempotent:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_example ON example_table (example_column);
DROP INDEX CONCURRENTLY IF EXISTS idx_old_example;
```

## Immutability rule

**After a migration has been applied in any shared environment, never modify, delete, rename or reorder it.** A checksum mismatch intentionally prevents application startup because environments would otherwise diverge.

For a correction, add a new migration. If a release must be rolled back, restore a compatible database backup or add a reviewed compensating migration; there is no generic `migrate-down` target.

## Workflow

Commands below assume the current directory is `backend/`.

1. Update local trusted refs and determine the next unused number.
2. Create one focused migration:

   ```bash
   $EDITOR migrations/NNN_short_description.sql
   ```

3. Prefer idempotent operations such as `ADD COLUMN IF NOT EXISTS` when semantics allow it.
4. Review lock/table-rewrite/index impact and test with realistic data volume.
5. Run the migration runner tests and backend tests:

   ```bash
   go test ./internal/repository -run 'Migration|Migrations'
   go test ./...
   ```

6. Start the backend against a disposable PostgreSQL database and verify startup, schema, data invariants and a second idempotent startup.
7. Before production deployment, create and verify a fresh database backup and a rollback/restore procedure.

## Example

```sql
-- Forward-only migration. Explain why the change is needed.
ALTER TABLE usage_logs
  ADD COLUMN IF NOT EXISTS example_column VARCHAR(100);
```

Do not put executable rollback SQL later in the same file: the runner will execute it as part of the forward migration.

## Troubleshooting

### Checksum mismatch

```text
migration NNN_name.sql checksum mismatch (db=abc123... file=def456...)
```

Restore the exact published file, then add a new migration for the intended change:

```bash
git log --oneline -- migrations/NNN_name.sql
git checkout <original-commit> -- migrations/NNN_name.sql
$EDITOR migrations/NEW_description.sql
```

Never update `schema_migrations.checksum` to conceal an unreviewed file change.

### Migration failed

- Regular migrations roll back their transaction.
- Concurrent index migrations may leave an invalid index; inspect PostgreSQL state and the runner's preflight/recovery logic before retrying.
- Fix the migration only if it has never been applied to any shared environment; otherwise add a new migration.

Inspect state read-only:

```bash
psql "$DATABASE_URL" -c \
  "SELECT filename, checksum, applied_at FROM schema_migrations ORDER BY applied_at DESC;"
```

Do not manually insert a fake `schema_migrations` row in staging/production. That bypasses schema execution and checksum verification.

## References

- [Migration runner](../internal/repository/migrations_runner.go)
- [PostgreSQL documentation](https://www.postgresql.org/docs/)
