# Данные о стоимости моделей

[English](README.md) | Русский

В этом каталоге находится встроенный резервный файл `model_prices_and_context_window.json`. Он позволяет сервису тарификации запуститься, если настроенный удалённый источник цен или локальный runtime-кеш недоступен.

## Источники данных во время работы

Параметры находятся в разделе `pricing` файла `config.yaml`:

- `remote_url` — URL JSON с ценами;
- `hash_url` — необязательный URL SHA-256 для проверки удалённого JSON;
- `data_dir` — доступный для записи каталог runtime-кеша;
- `fallback_file` — путь к встроенному резервному файлу;
- `update_interval_hours` и `hash_check_interval_minutes` — интервалы обновления.

Текущие значения по умолчанию определены в [`internal/config/config.go`](../../internal/config/config.go) и используют upstream-репозиторий [`Wei-Shaw/model-price-repo`](https://github.com/Wei-Shaw/model-price-repo). Это сторонний источник данных, а не репозиторий приложения Sub2API.

Если `pricing.remote_url` пуст, удалённая синхронизация отключается. Если первичная загрузка из удалённого источника/кеша завершается ошибкой, сервис загружает встроенный fallback и записывает ошибку в журнал.

## Обновление встроенного fallback

Не заменяйте файл вслепую: форк может содержать проверенные тарифные записи, которых ещё нет во внешнем источнике. Скачивайте данные во временный каталог, проверяйте опубликованный хеш и синтаксис JSON, просматривайте diff и запускайте pricing-тесты.

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

# Проверьте изменения до замены встроенного fallback.
diff -u model_prices_and_context_window.json \
  "$tmp/model_prices_and_context_window.json" || true
```

После согласованной замены из каталога `backend/` выполните как минимум:

```bash
go test ./internal/service -run Pricing
go test ./...
```

## Формат данных

JSON сопоставляет идентификаторы моделей с тарифами и метаданными возможностей: стоимостью входных/выходных токенов, лимитами контекста, режимами и флагами функций. Машинные идентификаторы и числовые цены переводить нельзя.
