# Асинхронные задачи генерации изображений

[English](ASYNC_IMAGE_TASKS.md) | Русский

Асинхронные image tasks позволяют отправлять длительные OpenAI-совместимые запросы без удержания одного HTTP-соединения. Это предотвращает proxy/CDN timeout вроде Cloudflare 524, сохраняя текущую маршрутизацию, биллинг, модерацию, concurrency и failover.

## Endpoint-ы

Аутентифицированный gateway поддерживает `/v1` и существующие aliases без префикса:

```text
POST /v1/images/generations/async
POST /v1/images/edits/async
GET  /v1/images/tasks/{task_id}
```

Aliases: `/images/generations/async`, `/images/edits/async`, `/images/tasks/{task_id}`.

Поддерживаются только группы OpenAI и Grok. Формат JSON/multipart совпадает с соответствующим синхронным endpoint. Streaming-запросы отклоняются: опрашиваемая задача возвращает один итоговый JSON.

## Включение object storage

Функция **по умолчанию отключена** и требует S3-совместимого object storage. Если switch выключен или credentials неполны, async endpoints возвращают `404`, не создают задачу и не пишут результат в Redis. Это fail-closed защита: большие `b64_json` не должны накапливаться в памяти Redis.

### Через Admin UI (рекомендуется)

Откройте **Администрирование → Резервное копирование → Объектное хранилище асинхронных изображений**.

Настройки применяются сразу после сохранения: client пересобирается при следующем запросе, restart контейнера не нужен. По умолчанию image storage повторно использует S3 endpoint, region и credentials резервных копий, но имеет собственные bucket/prefix (`images/` вместо `backups/`). Пустой image bucket наследует backup bucket. Отключите reuse, чтобы использовать отдельный аккаунт.

Если для изменения backup settings включён step-up 2FA, он требуется и здесь. Выключение switch прекращает новые submissions, но уже принятые задачи остаются доступными для polling.

### Через `config.yaml`

Сохранённая Admin-настройка имеет приоритет. Пока в Admin UI ничего не сохранялось, используется блок `image_storage` из `config.yaml`; это сохраняет совместимость существующих deployments.

```yaml
image_storage:
  enabled: true
  endpoint: "https://<account_id>.r2.cloudflarestorage.com"  # для AWS можно оставить пустым
  region: "auto"
  bucket: "my-images"
  access_key_id: "..."
  secret_access_key: "..."
  prefix: "images/"
  force_path_style: false          # для MinIO/path-style bucket — true
  public_base_url: ""              # задано: public_base_url/key; пусто: presigned URL
  presign_expiry_hours: 24
  max_download_bytes: 33554432
```

Поля также принимают overrides `IMAGE_STORAGE_*`, включая `IMAGE_STORAGE_ENDPOINT` и остальные одноимённые параметры storage.

После завершения каждая картинка загружается в bucket. Результат сокращается до `data[].url`, а `b64_json` удаляется; в Redis остаётся небольшой JSON. Ошибка upload переводит задачу в `failed`, а не сохраняет сырой base64.

Для другого storage backend реализуйте интерфейс `service.ImageStorage`: `Save(ctx, key, contentType, data) (url, error)`.

### Endpoint возвращает 404 после включения

`404 async image tasks are not enabled` означает, что effective `image_storage` неполон. Route зарегистрирован; `404` возвращает handler.

Проверьте warning:

```text
WARN image_storage.enabled is true but object storage is not fully configured; async image tasks are disabled  missing_keys=[...]
```

`missing_keys` перечисляет отсутствующие credentials.

Исторически releases до `v0.1.161` могли игнорировать часть `IMAGE_STORAGE_*`, заданных только environment variables. Для старой версии workaround — добавить блок в `/app/data/config.yaml`; в текущем форке defaults зарегистрированы, и env overrides читаются.

Другие причины `404`:

- группа API key должна иметь platform OpenAI или Grok;
- key должен быть привязан к группе;
- polling разрешён только тому же API key, который создал задачу; другой key того же пользователя получает `image task not found`.

## Отправка задачи

```bash
curl -i https://api.example.com/v1/images/generations/async \
  -H 'Authorization: Bearer <SUB2API_KEY>' \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "gpt-image-1",
    "prompt": "A lighthouse during a winter storm",
    "size": "1536x1024"
  }'
```

Ответ — `202 Accepted`:

```json
{
  "id": "imgtask_0123456789abcdef",
  "task_id": "imgtask_0123456789abcdef",
  "object": "image.generation.task",
  "status": "processing",
  "created_at": 1784092800,
  "expires_at": 1784179200,
  "poll_url": "/v1/images/tasks/imgtask_0123456789abcdef"
}
```

`Location` содержит polling path, `Retry-After: 3` — рекомендуемый интервал.

## Опрос задачи

Используйте тот же API key:

```bash
curl https://api.example.com/v1/images/tasks/imgtask_0123456789abcdef \
  -H 'Authorization: Bearer <SUB2API_KEY>'
```

Во время выполнения status — `processing`. Успешный результат повторяет synchronous image API, но images перенесены в object storage:

```json
{
  "id": "imgtask_0123456789abcdef",
  "task_id": "imgtask_0123456789abcdef",
  "object": "image.generation.task",
  "status": "completed",
  "http_status": 200,
  "image_url": "https://...",
  "result": {
    "created": 1784092923,
    "data": [{"url": "https://..."}]
  },
  "created_at": 1784092800,
  "completed_at": 1784092923,
  "expires_at": 1784179323
}
```

`image_url` дублирует первый `data[].url`. При ошибке:

```json
{
  "id": "imgtask_0123456789abcdef",
  "task_id": "imgtask_0123456789abcdef",
  "object": "image.generation.task",
  "status": "failed",
  "http_status": 502,
  "error": {
    "type": "api_error",
    "message": "Upstream request failed"
  },
  "created_at": 1784092800,
  "completed_at": 1784092923,
  "expires_at": 1784179323
}
```

Все submit/poll responses содержат `Cache-Control: no-store`. Задачи и результаты удаляются через 24 часа после последнего изменения состояния; максимальное время выполнения — 30 минут.

Владение привязано одновременно к user и API key. Неизвестные и чужие task IDs отвечают одинаковым `404`, не раскрывая существование задачи. Обычные проверки authentication, disabled key/user, IP и group продолжают действовать.
