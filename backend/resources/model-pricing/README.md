# Model pricing data

English | [Русский](README_RU.md)

This directory contains the bundled fallback file `model_prices_and_context_window.json`. It lets the pricing service start when the configured remote pricing source or the local runtime cache is unavailable.

## Runtime sources

The runtime settings are under `pricing` in `config.yaml`:

- `remote_url` — pricing JSON URL;
- `hash_url` — optional SHA-256 URL used to verify the remote JSON;
- `data_dir` — writable runtime cache directory;
- `fallback_file` — bundled fallback path;
- `update_interval_hours` and `hash_check_interval_minutes` — refresh intervals.

The current defaults are defined in [`internal/config/config.go`](../../internal/config/config.go) and use the upstream [`Wei-Shaw/model-price-repo`](https://github.com/Wei-Shaw/model-price-repo). This is a third-party data source, not the Sub2API application repository.

If `pricing.remote_url` is empty, remote synchronization is disabled. If initial remote/cache loading fails, the service loads this bundled fallback and logs the failure.

## Updating the bundled fallback

Do not replace the file blindly: the fork may carry reviewed pricing entries that are not yet present in the external source. Use a temporary directory, verify the published hash and JSON syntax, review the diff, and run pricing tests.

```bash
set -euo pipefail
base=https://raw.githubusercontent.com/Wei-Shaw/model-price-repo/main
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

curl -fsSL "$base/model_prices_and_context_window.json" \
  -o "$tmp/model_prices_and_context_window.json"
expected=$(curl -fsSL "$base/model_prices_and_context_window.sha256" | tr -d '[:space:]')
actual=$(sha256sum "$tmp/model_prices_and_context_window.json" | cut -d' ' -f1)
test "$actual" = "$expected"
python3 -m json.tool "$tmp/model_prices_and_context_window.json" >/dev/null

# Review before replacing the bundled fallback.
diff -u model_prices_and_context_window.json \
  "$tmp/model_prices_and_context_window.json" || true
```

After an approved replacement, from `backend/` run at least:

```bash
go test ./internal/service -run Pricing
go test ./...
```

## Data format

The JSON maps model identifiers to pricing and capability metadata, including input/output token prices, context limits, modes and feature flags. Machine identifiers and numeric prices must never be translated.
