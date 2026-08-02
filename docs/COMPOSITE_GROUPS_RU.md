# Композитные группы

[English](COMPOSITE_GROUPS.md) | Русский

Композитная группа — административный слой маршрутизации API keys. Вместо жёсткой привязки key к одной provider-группе она выбирает конкретную платформу по запрошенной модели. Поддерживаются встроенный detector и настраиваемый registry публичных model aliases.

## Поддерживаемые платформы

Явный route может направлять запрос в:

- Anthropic;
- Gemini;
- OpenAI;
- Antigravity;
- Grok.

Разрешённая конкретная платформа используется для выбора account, проверки пользовательских quota, post-usage billing, attribution ошибок, channel mapping/pricing и отчётности.

## Registry маршрутов

Routes настраиваются через действие **Routes** у composite group или Admin API:

- `GET /api/v1/admin/groups/:id/composite-routes`
- `POST /api/v1/admin/groups/:id/composite-routes`
- `PUT /api/v1/admin/groups/:id/composite-routes/:route_id`
- `DELETE /api/v1/admin/groups/:id/composite-routes/:route_id`
- `POST /api/v1/admin/groups/:id/composite-routes/preview`

Поля route:

- `public_model` — модель от клиента;
- `match_type` — `exact` или `prefix`;
- `target_platform` — конкретная provider platform;
- `upstream_model` — модель для upstream; пустое значение сохраняет `public_model`;
- `endpoint` — `any`, `messages`, `count_tokens`, `responses`, `chat_completions`, `embeddings`, `images` или `gemini`;
- `priority` — меньшее значение выигрывает после сравнения specificity;
- `enabled` — выключенный route виден администратору, но игнорируется runtime.

Порядок выбора: exact выше prefix; endpoint-specific выше `any`; более длинный prefix выше короткого; затем меньший `priority`, затем меньший route ID.

Для JSON endpoint gateway заменяет поле `model` на `upstream_model`. В Gemini-native path вроде `/v1beta/models/{model}:generateContent` разрешается path model и дальше передаётся upstream model.

## Встроенное определение платформы

- Anthropic: `claude-*`, `anthropic.claude-*`, prefixes `anthropic/`, `claude/`.
- Gemini: `gemini-*`, `learnlm-*`, prefixes `google/`, `google-ai-studio/`, `gemini/`.
- OpenAI: `gpt-*`, `chatgpt-*`, `codex-*`, `text-embedding-*`, `text-moderation-*`, `omni-moderation-*`, `dall-e-*`, `gpt-image-*`, `tts-*`, `whisper-*`, series `o1`/`o3`/`o4`/`o5`, prefixes `openai/`, `chatgpt/`.
- Grok: `grok`, `grok-*`, prefixes `xai/`, `x-ai/`, `grok/`.

Antigravity допустим как явный `target_platform`, но detector не угадывает его по имени модели. Неизвестные/неоднозначные имена завершаются клиентской ошибкой fail-closed.

## Административные сценарии

- Создание группы с platform `composite`.
- Добавление, изменение, удаление и preview model routes.
- Копирование accounts из concrete provider groups или прямое назначение accounts composite group.
- Привязка subscription payment plan, если `subscription_type=subscription`.
- Настройка channel model mapping/pricing по конкретной resolved platform; payload `group_ids` остаётся плоским.

## Пример: OpenAI + Claude + Gemini + Grok

1. Создайте provider groups с upstream account pools.
2. Создайте `composite` group с `subscription_type=subscription`.
3. Назначьте accounts напрямую или скопируйте их при создании.
4. Добавьте aliases:

| Public model | Endpoint | Target platform | Upstream model |
|---|---|---|---|
| `all/gpt-5` | `responses` | `openai` | `gpt-5` |
| `all/claude-sonnet` | `messages` | `anthropic` | `claude-sonnet-4-6` |
| `all/gemini-pro` | `gemini` | `gemini` | `gemini-2.5-pro` |
| `all/grok` | `responses` | `grok` | `grok-4.3` |

5. Настройте channel pricing/model mapping для каждой concrete platform.
6. Создайте payment plan для composite group.

Стандартные `gpt-*`, `claude-*`, `gemini-*`, `grok-*` могут работать через detector. Для bundled aliases предпочтительны explicit routes: endpoint, provider и upstream attribution видны в Admin UI.

## Ограничения

Composite route выбирает provider и upstream model, но сам не создаёт model metadata, pricing или capability records. Текущая реализация не предоставляет:

- AUTO smart-routing между несколькими providers одной абстрактной задачи;
- прямую привязку одного API key к нескольким обычным groups без composite group;
- protocol-agnostic adapter rewrite в стиле LiteLLM.
