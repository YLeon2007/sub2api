# UI Bridge v1

[中文](ui-bridge.md) | Русский

## Способ загрузки

Для каждого открытия страницы конфигурации host создаёт краткоживущую UI-сессию:

```text
/api/v1/plugin-ui/<asset-token>/index.html#bridge_token=<bridge-token>
```

Asset Token используется для чтения файлов `ui/` внутри пакета. Bridge Token находится только в URL fragment и не отправляется на сервер. iframe создаётся с `sandbox="allow-scripts"`; `allow-same-origin` не выдаётся.

UI может загружать только ресурсы из пакета, явно объявленные в манифесте. CSP запрещает внешние сетевые соединения, отправку форм и внешние frame.

## Envelope сообщений

UI → host:

```json
{
  "source": "sub2api-plugin-ui",
  "bridge_token": "TOKEN",
  "type": "config.load",
  "request_id": "UNIQUE_ID"
}
```

Host → UI:

```json
{
  "source": "sub2api-plugin-host",
  "bridge_token": "TOKEN",
  "request_id": "UNIQUE_ID",
  "ok": true
}
```

## Методы

| `type` | Параметры UI | Успешный ответ |
|---|---|---|
| `sub2api.plugin.ready` | нет | ответа нет |
| `config.load` | нет | `config` |
| `config.save` | объект `config` | нормализованный `config` |
| `config.test` | нет | `result` |
| `ui.resize` | `height` | ответа нет |
| `ui.notify` | `level`, `message` | ответа нет |

В v1 `config.test` проверяет уже сохранённую конфигурацию. Если UI хочет проверить текущие поля формы, он сначала должен вызвать `config.save`.

## Обязательные проверки

При получении сообщения UI обязан проверять `event.source === parent`, идентификатор источника сообщения, Bridge Token и ожидающий `request_id`. У каждого запроса должен быть timeout и cleanup при unload.

Host не выдаёт iframe администраторский Token. UI плагина не должен пытаться обращаться к Admin API, Cookie, DOM родительской страницы или данным host-а в browser storage.
