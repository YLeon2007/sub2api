# Нативный API Seedance

[中文](seedance-api.md) | Русский

Поддерживается асинхронный протокол видеозадач Volcano Ark. Преобразование `content[]` в OpenAI `messages` или Grok `prompt` не требуется.

## Настройка

1. Создайте аккаунт платформы OpenAI типа **API Key**, укажите Ark API Key и используйте Base URL `https://ark.cn-beijing.volces.com/api/v3`. Для совместимого сервиса можно указать собственный Base URL `/api/v3` или `/v3`.
2. В возможностях endpoint аккаунта включите **Seedance (Ark)**. По умолчанию функция отключена, чтобы запросы случайно не направлялись к другим OpenAI-аккаунтам. Поддерживаются создание, редактирование и массовое редактирование.
3. Добавьте аккаунт в OpenAI-группу и включите для группы медиаразрешение «Разрешить генерацию изображений»; `Composite group` также может маршрутизировать запросы к этим аккаунтам.
4. Настройте mapping моделей: например, сопоставьте публичное имя `seedance-video` с фактической моделью `doubao-seedance-*` или inference endpoint `ep-*`. Укажите цену output tokens для соответствующей модели; этот API не использует поминутную цену видео Grok.

## Вызовы

```bash
curl "$SUB2API_BASE_URL/api/v3/contents/generations/tasks" \
  -H "Authorization: Bearer ***" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "seedance-video",
    "content": [{"type": "text", "text": "Волны мягко накатывают на берег"}],
    "duration": 5,
    "resolution": "720p",
    "ratio": "16:9",
    "generate_audio": true
  }'

# Используйте native id из ответа создания и опрашивайте задачу до
# terminal state: succeeded / failed / cancelled и других финальных состояний.
curl "$SUB2API_BASE_URL/api/v3/contents/generations/tasks/$TASK_ID" \
  -H "Authorization: Bearer ***"

curl -X DELETE "$SUB2API_BASE_URL/api/v3/contents/generations/tasks/$TASK_ID" \
  -H "Authorization: Bearer ***"
```

Поддерживаются также aliases `/v3`, `/v1` и путь без version prefix. Base URL Ark SDK можно изменить на `$SUB2API_BASE_URL/api/v3`. Текст, изображения, видео, аудио, роли и дополнительные параметры передаются без изменений; переписывается только имя модели согласно настройке аккаунта. Ответ сохраняет native format upstream.

## Задачи и billing

- Запросы чтения и удаления могут обращаться только к задаче, созданной теми же user, API Key и group, и всегда используют исходный account; запрос не переключается на другой account.
- При создании token usage не списывается. После первого запроса, вернувшего `succeeded`, списание выполняется по upstream `usage.completion_tokens`; повторные запросы защищены от двойного списания общей cache-декларацией и persistent usage deduplication. Неудачные, ожидающие и выполняющиеся задачи не тарифицируются.
- Redis хранит binding задачи и snapshot модели на момент создания, по умолчанию 24 часа. Состояние Redis нужно сохранять, а результат — запрашивать в течение этого срока. Сейчас фонового polling нет: задача, для которой используется только callback без запроса результата, автоматически не тарифицируется.
- Upstream task-list endpoint не публикуется, чтобы задачи shared account не раскрывались другим пользователям. Удаление следует semantics upstream и автоматически не возвращает оплату.
- Ошибка upstream при асинхронном создании не повторяется автоматически, чтобы не создать платную задачу дважды.

Протокол основан на [официальном Go SDK Volcano](https://github.com/volcengine/volcengine-go-sdk/blob/master/service/arkruntime/model/content_generation.go), [документации создания задачи](https://www.volcengine.com/docs/82379/1520757) и [документации запроса задачи](https://www.volcengine.com/docs/82379/1521309).
