# Batch Image MVP

[English](BATCH_IMAGE_MVP.md) | Русский

Batch Image MVP предоставляет асинхронную пакетную генерацию Gemini-изображений через единый API, Redis workers, состояние в PostgreSQL и provider-specific batch backends.

Поддерживаемые providers:

- `gemini_api`;
- `vertex`.

Публичный API не раскрывает Gemini file names, Vertex job names, GCS paths, signed URLs, API keys или service account material. В MVP downloads проксируются через Sub2API.

## API routes

```text
POST   /v1/images/batches
GET    /v1/images/batches/{id}
GET    /v1/images/batches/{id}/items
GET    /v1/images/batches/{id}/items/{custom_id}/content
GET    /v1/images/batches/{id}/download
POST   /v1/images/batches/{id}/cancel
DELETE /v1/images/batches/{id}/outputs
```

Пример submit:

```json
{
  "model": "gemini-2.5-flash-image",
  "provider": "gemini_api",
  "items": [
    {
      "custom_id": "cover_001",
      "prompt": "A clean product hero image...",
      "output_count": 1,
      "reference_images": [
        {
          "id": "product-front",
          "type": "subject",
          "mime_type": "image/png",
          "data": "<base64 bytes without data URL prefix>"
        },
        {
          "id": "style",
          "type": "style",
          "mime_type": "image/jpeg",
          "file_uri": "gs://internal-managed-bucket/batch-image/refs/style.jpg"
        }
      ]
    }
  ],
  "image_size": "1K",
  "response_mime_type": "image/png"
}
```

`reference_images` необязателен. `data` — base64 без data URL prefix. `file_uri` зарезервирован для внутренних Google Cloud Storage refs и должен начинаться с `gs://`. Допустимые MIME: `image/png`, `image/jpeg`, `image/webp`.

Текущие limits:

- Flash Image aliases: до 3 reference images на item;
- Pro Image aliases: до 14 на item;
- до 1000 attachments на job после expansion `output_count`;
- до 128 MB decoded inline reference data на job;
- `output_count` default `1`, максимум `4` на item;
- до 200 ожидаемых output images на job;
- ZIP по умолчанию до 200 items; byte limit задаётся отдельно.

При `output_count > 1` backend создаёт отдельные provider JSONL lines с suffix, например `cover_001_01`, `cover_001_02`.

Пример публичного batch response:

```json
{
  "id": "imgbatch_0123456789abcdef0123456789abcdef",
  "object": "image.batch",
  "status": "queued",
  "model": "gemini-2.5-flash-image",
  "provider": "gemini_api",
  "item_count": 1,
  "success_count": 0,
  "fail_count": 0,
  "estimated_cost": 0.25,
  "actual_cost": null,
  "created_at": 1783123200,
  "submitted_at": 1783123201,
  "settled_at": null
}
```

Items response содержит `custom_id`, status, MIME/extension, `image_count` и error, но не provider refs.

## Жизненный цикл

Внутренние состояния:

```text
created -> uploading -> submitted -> running -> indexing -> settling -> completed
```

Terminal/cleanup:

```text
failed
cancelled
completed/failed/cancelled -> output_deleted
```

Публичное отображение:

```text
created/uploading/submitted -> queued
running                    -> running
indexing                   -> processing_results
settling                   -> settling
completed                  -> completed
failed                     -> failed
cancelled                  -> cancelled
output_deleted             -> output_deleted
```

`output_deleted` наступает после ручного удаления или TTL cleanup.

## Redis и PostgreSQL

PostgreSQL — source of truth. Redis используется для wakeup, retry, worker coordination, per-job locks и download limiting.

`batch_image.queue_enabled` по умолчанию `false`. При `true` startup запускает `BatchImageWorker`: ready queue, delayed mover и recovery stale active jobs. Worker не сканирует БД в цикле; DB read начинается после reservation конкретного batch ID из Redis.

Используемые keys задаются:

- `queue_ready_key`, `queue_delayed_key`, `queue_active_key`;
- `inflight_key_prefix`, `lock_key_prefix`, `idempotency_key_prefix`;
- download limiter keys.

## Биллинг

- Submit может оценить cost и поставить hold.
- Settlement выполняется после indexing результатов.
- Списываются только успешные images; failed items не оплачиваются.
- Reference images создают upstream input-token/storage cost, но публичная MVP-модель не добавляет отдельную надбавку.
- Settlement request ID: `batch_image_settlement:{batch_id}`.
- Settlement и release должны быть идемпотентны.
- Ошибки billing повторяются ограниченное число раз; после исчерпания retries job становится failed, остаток hold освобождается идемпотентно.

Точная цена задаётся model pricing/group settings, не этим документом.

## Retention и cleanup

Defaults:

- inputs после terminal status: 24 часа;
- outputs: 72 часа;
- максимум output retention: 7 дней;
- cleanup interval: 30 минут;
- cleanup batch: 100.

Ручное удаление:

```text
DELETE /v1/images/batches/{id}/outputs
```

После cleanup downloads отвечают `410 Gone` с `BATCH_IMAGE_OUTPUT_DELETED`. Provider cleanup использует только server-generated prefix-safe refs. Для managed Vertex/GCS bucket отключите soft delete либо настройте lifecycle, чтобы не накапливать скрытые расходы.

## Providers

### `gemini_api`

- Gemini Batch API, JSONL file mode;
- upstream accounts типа Gemini `apikey`;
- result refs и API keys не выдаются наружу;
- Google-side access и billing/prepayment должны быть активны.

### `vertex`

- Vertex `BatchPredictionJob` и managed GCS JSONL;
- Gemini `service_account` с валидным service account JSON;
- bucket/prefix задаёт сервер;
- Vertex job name и GCS paths остаются внутренними;
- MVP обещает только `1K`/default, не `2K`/`4K`.

Другие Gemini login types не выбираются, если не предоставляют эквивалентные API-key/service-account credentials через тот же provider flow.

## Включение Google-side возможностей

До включения группы оператор должен:

1. Использовать Google Cloud project с billing.
2. Включить необходимые Gemini API / Vertex AI API.
3. Для Vertex подготовить service account или ADC.
4. Создать фиксированный GCS bucket и выдать runtime/Vertex service agent минимальные permissions.
5. Настроить project ID, location, bucket, provider account, model whitelist и pricing.
6. Включить `BATCH_IMAGE_ENABLED`, image generation и `allow_batch_image_generation` только у нужной Gemini group.

Заголовок `x-goog-api-key` на совместимом endpoint всё равно ожидает Sub2API key, а не обычный Google API key.

Официальные ссылки:

- https://ai.google.dev/gemini-api/docs/api-key
- https://ai.google.dev/gemini-api/docs/batch-api
- https://ai.google.dev/gemini-api/docs/image-generation
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/batch-inference
- https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/batch-prediction-api

## Основные config defaults

```yaml
batch_image:
  enabled: false
  max_items_per_job_default: 200
  max_items_per_job_trial: 50
  max_output_images_per_job: 200
  max_output_images_per_item: 4
  max_prompt_chars_per_item: 8000
  max_reference_images_per_job: 1000
  max_reference_inline_bytes_per_job: 134217728
  default_response_mime_type: "image/png"
  default_image_size: "1K"

  max_download_items_zip: 200
  max_download_bytes_per_request: 536870912
  max_download_duration_seconds: 600
  max_download_concurrency_per_user: 1

  input_retention_after_terminal_hours: 24
  output_retention_after_terminal_hours: 72
  output_retention_max_days: 7
  cleanup_interval_minutes: 30
  cleanup_batch_size: 100

  queue_enabled: false
  queue_ready_key: "batch_image:queue:ready"
  queue_delayed_key: "batch_image:queue:delayed"
  queue_active_key: "batch_image:queue:active"
  inflight_key_prefix: "batch_image:queue:inflight:"
  lock_key_prefix: "batch_image:queue:lock:"
  idempotency_key_prefix: "batch_image:queue:idem:"

  vertex_enabled: false
  vertex_project_id: ""
  vertex_location: "global"
  vertex_managed_gcs_bucket: ""
  vertex_managed_gcs_prefix: "batch-image/{env}/{batch_id}"
```

Полный и актуальный набор — в `backend/internal/config/config.go` и `deploy/config.example.yaml`. Flags по умолчанию выключены.

## Operations checklist

- Настроить Redis и включить `batch_image.enabled`.
- Включить `queue_enabled` для обработки jobs.
- Настроить provider accounts и Vertex GCS при необходимости.
- Проверить IAM/bucket lifecycle/soft delete.
- Настроить cleanup, limits, download concurrency и pricing.
- Выполнить smoke tests до включения пользовательской группы.

## Security checklist

- Не выдавать provider refs, GCS URI, signed URL, service account или API key.
- Не хранить image bytes/base64 в PostgreSQL и logs.
- Status/items/download/cancel/delete строго owner-scoped.
- Cleanup paths только server-generated.
- Никаких реальных secrets/cloud refs в fixtures.

## Тесты

```bash
cd backend
go test -tags=unit ./internal/service -run 'BatchImage' -count=1
go test -tags=unit ./internal/config ./internal/service ./internal/repository -count=1
go test ./internal/config ./internal/service ./internal/repository ./internal/handler ./internal/server/routes -run '^$'
go test ./... -run '^$'
```

Эти compile/unit checks не должны требовать Docker, testcontainers, Redis, GCP, Gemini, Vertex или GCS.

## Поддержка документа

Не изменяйте применённые migrations; добавляйте новые. Обновляйте generated Ent/server/wire code. Сохраняйте flags disabled by default, не коммитьте secrets/local paths и синхронно обновляйте EN/RU docs, config examples и tests при изменении routes, limits, providers, billing или retention.
