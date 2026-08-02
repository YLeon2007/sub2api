# Ingress rejection log cleanup

English | [Русский](README_RU.md)

This maintenance command removes historical ingress/admission rejection entries from `ops_error_logs` without matching unrelated authentication, database, quota, billing, or upstream errors.

The commands below assume the current directory is `backend/`.

## Preview and execute

An explicit RFC 3339 cutoff is always required. The command is a dry run unless `--execute` is supplied.
It loads the same bootstrap configuration/environment as the application. `--batch-size` accepts `1-5000` and defaults to `5000`.

```sh
# Preview the matching rows
go run ./cmd/cleanup-ingress-reject-logs --before 2026-07-17T00:00:00Z

# Delete the matching rows
go run ./cmd/cleanup-ingress-reject-logs --before 2026-07-17T00:00:00Z --execute
```

Run the execute form only after every application instance has been upgraded. Otherwise an older instance may create new ingress rejection rows below the selected cutoff.

The classifier intentionally retains invariant failures such as `USER_NOT_FOUND`, database errors, quota/billing errors, and upstream failures.

## Finalize the schema cleanup

After rollout and log cleanup have been verified:

1. Create and verify a current database backup.
2. Schedule a maintenance window.
3. Run the finalizer with `ON_ERROR_STOP` enabled:

```sh
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f scripts/finalize-ingress-reject-cleanup.sql
```

The finalizer removes the deprecated plaintext-key audit table and attribution columns. Review the SQL before running it; this step is destructive and is not part of the dry-run command above.
Run `VACUUM (ANALYZE) ops_error_logs;` separately in a normal maintenance window after the transaction; the finalizer intentionally leaves it commented out.
