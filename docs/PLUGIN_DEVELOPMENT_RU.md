# Руководство по разработке плагинов Sub2API

[中文](PLUGIN_DEVELOPMENT.md) | Русский

Этот документ предназначен для команд, которые хотят разрабатывать, упаковывать и публиковать плагины Sub2API. Плагин — это пакет `.s2plugin`, состоящий из отдельного процесса и статического UI; host вызывает его через стабильный gRPC-протокол. В качестве примера используется текущая capability `openai.oauth.outbound_transport.v1`: что должен подготовить разработчик, какие обязанности остаются у плагина, а какие по-прежнему выполняет Sub2API.

Документ не является готовым к установке полным плагином и не означает, что официальный пакет плагина уже опубликован. Сейчас он фиксирует публичный протокол, границы host-а и процесс разработки. Дальнейшая публикация установочных пакетов, список provider-ов и пример репозитория будут объявлены отдельно.

## 1. Подготовка окружения

Рекомендуемое окружение:

- Go 1.21 или новее;
- Node.js, если UI плагина использует JavaScript;
- Git;
- toolchain, совпадающий с целевой средой deployment-а.

Определения протокола и общие материалы находятся здесь:

- `backend/pkg/pluginapi/v1/plugin.proto`: межпроцессные сообщения и streaming requests;
- `backend/pkg/pluginapi/v1/runtime.go`: entrypoint процесса плагина;
- `backend/pkg/pluginapi/v1/manifest.schema.json`: JSON Schema манифеста пакета;
- `backend/pkg/pluginapi/docs/`: разработка, UI Bridge, формат пакета и security boundary.

Пока готовый официальный пример исходников не поставляется. До его публикации можно создать собственный проект, следуя структуре и протоколам этого документа. Публичный контракт всегда определяется каталогом `backend/pkg/pluginapi/`.

## 2. Создание проекта плагина

До появления примерного репозитория можно завести отдельный Go-проект:

```text
my-plugin/
├── cmd/<plugin>/main.go
├── internal/pluginconfig/
├── internal/transport/
├── ui/index.html
├── ui/assets/
├── tools/
├── manifest.source.json
└── build.sh
```

Минимальные части:

1. `manifest.source.json`: ID, имя, версия, автор, capability и совместимые версии Sub2API;
2. `cmd/<plugin>/main.go`: entrypoint, runtime version injection, синхронизация build targets и имени бинаря;
3. `internal/pluginconfig/`: структура настроек, defaults, строгая валидация и нормализация;
4. `internal/transport/`: HTTP client, proxy, headers, body, network options, response stream и освобождение ресурсов;
5. `ui/index.html` и `ui/assets/`: собственный UI конфигурации;
6. unit tests, process integration tests и target-platform build config.

`main.go` должен оставаться маленьким и только вызывать `pluginv1.Serve`. Основную логику держите в тестируемых пакетах, а не смешивайте parsing конфигурации, network calls и protocol assembly в entrypoint.

## 3. Реализация runtime

Runtime реализует сервис `TransportPlugin` и должен соблюдать контракт:

| Метод | Требование |
| --- | --- |
| `GetInfo` | Возвращает ID, версию, protocol version, transport API version и capabilities строго как в манифесте. |
| `Health` | Быстро сообщает, готов ли процесс принимать новые запросы; не выполняет долгие network probes. |
| `ValidateConfig` | Строго парсит JSON, отклоняет неизвестные поля и недопустимые диапазоны, возвращает полную нормализованную конфигурацию. |
| `ApplyConfig` | При успехе атомарно переключает конфигурацию; при ошибке сохраняет старую конфигурацию и старые соединения. |
| `TestConfig` | Запускает быструю диагностику сохранённой конфигурации и возвращает короткий результат для UI. |
| `Forward` | Принимает request stream, отправляет upstream request и последовательно возвращает response stream. |

Порядок request frames: `start`, ноль или больше `body_chunk`, затем `body_end`; порядок response frames: `start`, ноль или больше `body_chunk`, затем `end`. Если продолжать нельзя, отправляется `error` frame.

`ForwardResponseError.request_sent` обязан быть точным: возвращайте `false` только когда уверенно знаете, что upstream HTTP Transport ещё не вызван. Если вызов уже был или это нельзя доказать, возвращайте `true`; host использует это решение для повторов через другой аккаунт, чтобы не выполнить один запрос дважды.

Resource management — часть runtime contract: переиспользуйте HTTP Transport и connection pool, при смене конфигурации закрывайте старые idle connections, прокидывайте context cancellation gRPC stream на DNS, connect, upload и response read, и всегда закрывайте upstream response body. Логи и error messages не должны содержать Token, proxy credentials, полный request body или sensitive response headers.

## 4. Проектирование конфигурации

Конфигурацию определяет плагин, а Sub2API хранит её зашифрованной. Рекомендуемый процесс:

1. описать поля и defaults в `internal/pluginconfig.Config`;
2. парсить строго, например через `json.Decoder.DisallowUnknownFields`;
3. нормализовать пустой объект в полную default-конфигурацию;
4. использовать одну и ту же валидацию в `ValidateConfig` и `ApplyConfig`;
5. после успешного применения дать host-у сохранить конфигурацию, а при ошибке сохранения разрешить rollback на старую.

JSON fields используйте в `snake_case`. Sensitive config не размещайте в URL, UI notifications, diagnostics или logs. Плагин не должен читать, refresh-ить или persist-ить OAuth Token из UI; host передаёт нужные данные только во время runtime вызова.

## 5. UI конфигурации плагина

UI — это статическая страница внутри пакета, без изменений frontend-кода Sub2API. Host загружает `ui/index.html` в restricted iframe и предоставляет config read/write/test через UI Bridge.

Инициализация страницы:

1. загрузить HTML/CSS/JavaScript из пакета;
2. создать Bridge и зарегистрировать `message` listener;
3. отправить `sub2api.plugin.ready`;
4. вызвать `config.load` и отрисовать форму;
5. после редактирования вызвать `config.save`;
6. перед диагностикой сначала сохранить, затем вызвать `config.test`;
7. при unload вызвать `dispose()`.

Текущий Bridge поддерживает:

| Сообщение | Назначение |
| --- | --- |
| `config.load` | Прочитать текущую конфигурацию. |
| `config.save` | Отправить конфигурацию; runtime валидирует, применяет и сохраняет её зашифрованной. |
| `config.test` | Выполнить диагностику сохранённой конфигурации. |
| `ui.resize` | Изменить высоту configuration iframe. |
| `ui.notify` | Показать success, error или hint. |

Каждое сообщение содержит `request_id`; проверяйте `event.source`, идентификатор источника и Bridge Token. Не полагайтесь на CDN, remote scripts, cookies или local storage. UI должен работать на узких экранах и в светлой/тёмной теме, корректно обрабатывать loading, save, test, timeout и unsaved state.

Точный формат envelope описан в `backend/pkg/pluginapi/docs/ui-bridge.md`. Если позже появится reusable Bridge SDK в примере репозитория, этот документ будет дополнен путями и инструкциями.

## 6. Манифест пакета

Поддерживайте только `manifest.source.json`; не редактируйте вручную сгенерированный `manifest.json`. Минимальный пример:

```json
{
  "schema_version": 1,
  "id": "example.openai.transport",
  "name": "Example OpenAI Transport",
  "version": "0.1.0",
  "requires": {
    "sub2api": ">=0.1.179 <0.2.0",
    "recommended_sub2api_version": "0.1.179",
    "tested_sub2api_versions": ["0.1.179"],
    "plugin_protocol": 1,
    "transport_api": 1,
    "ui_bridge": 1
  },
  "capabilities": [
    {
      "id": "openai.oauth.outbound_transport.v1",
      "platform": "openai",
      "account_type": "oauth"
    }
  ],
  "runtimes": {},
  "ui": { "entrypoint": "ui/index.html" },
  "files": {}
}
```

Packager заполнит target-platform runtimes, UI и SHA-256 runtime файлов. `requires.sub2api` — жёсткий compatibility range; `tested_sub2api_versions` должен отражать только реально проверенные версии; `recommended_sub2api_version` показывается на странице управления. Сейчас host обрабатывает только `openai.oauth.outbound_transport.v1`; объявление другой capability само по себе не создаёт новый route.

## 7. Ключи и подпись

Production-пакеты всегда следует подписывать; host по умолчанию отклоняет unsigned packages. Используйте инструмент генерации Ed25519 key pair из проекта плагина; после публикации example repo он предоставит стандартную команду:

```bash
go run ./tools/keygen -out build/keys/my-publisher
```

`my-publisher.private` храните только на контролируемой машине разработки или в CI Secret. Не коммитьте private key в source repo, plugin package или deployment server. Public key — Base64 string, который можно передать оператору.

`build.sh` должен вызывать стандартный packager. Для собственного publisher key передавайте одновременно `-signing-key` и `-key-id`:

```bash
./build.sh \
  -signing-key /secure/path/my-publisher.private \
  -key-id my-publisher-v1 \
  -output dist/my-openai-plugin.s2plugin
```

Подпись покрывает точные байты итогового `manifest.json`; file hashes в манифесте покрывают runtime и UI files. После подписи не форматируйте `manifest.json` заново.

Оператор добавляет public key в конфигурацию Sub2API:

```yaml
plugins:
  allow_unsigned: false
  trusted_publishers:
    my-publisher-v1: "BASE64_ED25519_PUBLIC_KEY"
```

`trusted_publishers` дополняет встроенный официальный public key и не заменяет его. `signature.json.key_id` должен полностью совпадать с ключом конфигурации. При ротации сначала разверните host config/version с новым public key, затем выпустите новый signed package, и только после этого отключайте старый ключ.

Для локальной разработки unsigned package допустим только в изолированной среде с временным `plugins.allow_unsigned: true`; после теста немедленно верните `false`.

## 8. Сборка, тесты и установка

В каталоге плагина выполните:

```bash
go test ./... -count=1
node --check ui/assets/bridge-v1.js
node --check ui/assets/app.js
./build.sh
unzip -t dist/*.s2plugin
```

Затем из корня Sub2API запустите host integration test на реальном пакете:

```bash
cd ../..
SUB2API_TEST_PLUGIN_PACKAGE=plugins/my-openai-plugin/dist/my-openai-plugin.s2plugin \
  go test ./backend/internal/service -run '^TestPluginRuntimeIntegration$' -count=1
```

Минимальный test set должен покрывать config defaults и bounds, plugin identity, request/response chunks, streaming response, context cancellation, plugin exit, proxy switches, package hashes, signatures, path safety, target-platform runtime и UI Bridge loading/save/test/error/timeout.

Устанавливайте плагин сначала в disabled state, проверьте manifest compatibility, signature и diagnostics, и только затем включайте rollout по аккаунтам. API Key аккаунты и OAuth аккаунты вне rollout-а продолжают использовать встроенный путь Sub2API.

## 9. Чеклист перед публикацией

- версия плагина совпадает с `GetInfo`;
- `requires.sub2api` покрывает проверенный диапазон и не обещает непроверенные breaking версии;
- `tested_sub2api_versions` соответствует фактическим test records;
- для каждой поддерживаемой платформы и архитектуры есть runtime file;
- production package содержит валидный `signature.json`, public key передан оператору;
- пакет не содержит private keys, source maps, test data, logs или temp files;
- UI не зависит от внешних ресурсов и не сохраняет host session data;
- config switch, request cancellation, response close и retry semantics протестированы;
- release notes содержат upgrade, disable, rollback и compatibility info.

## 10. Частые проблемы

| Симптом | Что проверить |
| --- | --- |
| Установка сообщает, что подпись не доверена | `signature.json.key_id`, Base64 public key и config key должны совпадать байт-в-байт. |
| Плагин несовместим | `requires.sub2api`, `plugin_protocol`, `transport_api`, `ui_bridge`. |
| Процесс плагина не стартует | runtime path, OS/arch, executable permissions и права service user. |
| Страница настроек не загружается | `ui.entrypoint`, UI file hashes, Bridge Token validation и iframe message source. |
| Настройки сохранены, но не применились | результат `ValidateConfig`/`ApplyConfig`, нормализованная config и diagnostics. |
| Запрос повторился после ошибки | `ForwardResponseError.request_sent` должен точно отражать, мог ли upstream получить request. |

## 11. Расширение capabilities

Если новый плагин должен поддерживать других provider-ов, другие account types или новые message fields, сначала расширьте и версионируйте публичный протокол, а затем добавьте capability matching и lifecycle handling в host. Не объявляйте в манифесте capability, которую host ещё не реализует. Так старые плагины продолжат работать, а новый host сможет явно отклонять несовместимые пакеты.

Sub2API будет постепенно добавлять инструкции для других provider-ов: capability IDs, request/response contracts, config fields, UI Bridge usage, compatibility requirements и tests. Provider-specific sections появятся здесь по мере реализации.

## 12. Резерв для примерного репозитория

Планируется отдельный примерный репозиторий с reusable runtime skeleton, UI components, packager tools и минимальными реализациями provider-ов. Пока он не готов, адрес не публикуется; после релиза здесь появятся repository URL, supported Sub2API version, plugin example version и build instructions.
