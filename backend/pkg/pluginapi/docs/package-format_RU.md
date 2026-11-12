# Формат пакета `.s2plugin`

[中文](package-format.md) | Русский

`.s2plugin` — это ZIP-файл. В корне обязательно должен быть `manifest.json`, а production-пакет также обязан содержать `signature.json`.

## Стандартная структура

```text
manifest.json
signature.json
runtimes/<goos>-<goarch>/<binary>
ui/index.html
ui/assets/...
```

Все runtime- и UI-файлы должны быть перечислены в `manifest.files`; значения — SHA-256 в нижнем hex-регистре. Сам `manifest.json` и `signature.json` в `files` не включаются.

Пакет не допускает абсолютные пути, выход через родительские каталоги, повторяющиеся пути, символические ссылки, необъявленные файлы или отсутствующие файлы. Host также ограничивает размер upload-а, размер после распаковки и количество файлов.

## Манифест

Полная схема полей находится в [`v1/manifest.schema.json`](../v1/manifest.schema.json). Смысл версионных полей:

- `version`: SemVer-версия самого плагина.
- `requires.sub2api`: жёсткий диапазон совместимости host-а.
- `recommended_sub2api_version`: рекомендуемая версия host-а.
- `tested_sub2api_versions`: версии, которые издатель действительно проверил.
- `plugin_protocol`: протокол handshake процесса.
- `transport_api`: протокол кадров запроса и ответа.
- `ui_bridge`: протокол сообщений configuration UI.

## Подпись

`signature.json`:

```json
{
  "algorithm": "ed25519",
  "key_id": "publisher-key-id",
  "signature": "BASE64_SIGNATURE"
}
```

Объект подписи считается по точным исходным байтам `manifest.json`. Private key издателя не должен попадать в пакет плагина, репозиторий исходников или runtime-среду Sub2API. Оператор развёртывания настраивает только Base64 Ed25519 public key.

Production-конфигурация по умолчанию отклоняет неподписанные пакеты. Официальный OpenAI Transport проверяется встроенным public key host-а и не требует дополнительной настройки; для других издателей нужно явно настроить `trusted_publishers`. `allow_unsigned` предназначен только для локальных пакетов, собранных самим разработчиком.
