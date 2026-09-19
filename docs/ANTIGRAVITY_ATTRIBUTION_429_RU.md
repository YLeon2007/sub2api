# Antigravity: разбор 429, вызванного attribution metadata в Claude Desktop

[中文](ANTIGRAVITY_ATTRIBUTION_429.md) | Русский

Документ описывает локализацию и исправление конкретной проблемы для сценария Claude Desktop / Claude Code → Anthropic Messages → Antigravity. Это не универсальное объяснение всех ошибок `429 RESOURCE_EXHAUSTED`: исчерпание quota, частота запросов и capacity upstream нужно проверять отдельно.

## Симптомы и окружение

- Тестовый deployment: Sub2API 0.2.0, Claude Desktop 2.110.0, встроенный Claude Code 2.1.271, CC Switch 3.20.3.
- Цепочка запроса: Claude Desktop → локальный proxy CC Switch → Sub2API Antigravity → Google upstream; model mapping — `gemini-3.8-flash-high`.
- Даже простое приветствие в новом диалоге возвращало `429 RESOURCE_EXHAUSTED`; upstream сообщал `Resource has been exhausted (e.g. check quota).`.
- После этого account переходил в cooldown, а в группе с одним account могла появляться ошибка `503 No available accounts`.
- Независимый минимальный запрос проходил успешно, но настоящий клиентский запрос завершался ошибкой. Даже одна фраза от клиента сопровождалась system prompt и определениями tools.

## Метод локализации и сравнение результатов

Сохраните один неудачный запрос и последовательно удаляйте части при тех же account, model и upstream endpoint. Не делайте вывод о восстановлении полной клиентской цепочки только по короткому ручному запросу. Не загружайте исходные запросы или access token в public issue / PR.

| Вариант | Наблюдение |
| --- | --- |
| Исходный клиентский запрос (около 187 KB, 106 tools) | 429 |
| Удалены определения tools, system content сохранён | 429 |
| Удалено system-сообщение из messages | 429 |
| Прямой запрос в Google с исходным top-level system content | 429 |
| Тот же запрос в Google с простым system content | 200 |
| Отдельные system text blocks | attribution metadata block возвращает 429, остальные instruction blocks — 200 |
| Исходный запрос только без attribution metadata block, model/tools/остальное сохранены | 200, полный ответ получен |

Проблемный текст имел вид:

```text
x-anthropic-billing-header: cc_version=2.1.271.4bf; cc_entrypoint=claude-desktop-3p;
```

Здесь “header” — строка в JSON `system`, **а не HTTP request header**. Поэтому не нужно добавлять или удалять одноимённое поле в Claude Desktop “Custom inference headers”; также не следует исправлять проблему изменением нормально работающей Bearer-аутентификации.

Сравнение подтверждает, что в этом Google-запросе именно этот metadata text вызвал отказ, но не раскрывает внутреннюю policy Google и не позволяет считать поведение одинаковым для всех account или model.

## Исправление

При преобразовании Claude → Gemini для Antigravity удаляется строка `x-anthropic-billing-header:` в начале top-level `system` string или text block:

- поддерживаются string и массив text blocks, LF / CRLF / CR и начальные пробелы;
- если после строки остаются инструкции, они сохраняются без изменений; пустой block, содержащий только metadata, больше не отправляется;
- не затрагиваются обычный текст без двоеточия после имени поля, другие field names и такое же значение, процитированное внутри обычной инструкции;
- не изменяются user messages, tool definitions, model mapping, authentication и состояние account quota;
- обработка ограничена Antigravity converter и не меняет native Anthropic forwarding path.

Временный workaround до выпуска исправления использовал reverse-proxy JSON filter с тем же scope и был проверен на полном исходном запросе и реальной сессии Claude Desktop. Первая deployment-попытка снизить account concurrency проблему не решила; после локализации исходная настройка была восстановлена.

Для старой версии временное правило должно менять JSON только на целевом Antigravity Messages path и только top-level system text. Не применяйте глобальную замену строк: она может изменить messages, tool parameters или code examples. Proxy также должен сохранять типы пустых arrays/objects, пересчитывать request-body length и покрывать фактически используемый token-count path. Панель может перегенерировать proxy configuration и затереть пользовательский filter.

## Не отключайте attribution глобально

Claude Code поддерживает переменную [`CLAUDE_CODE_ATTRIBUTION_HEADER`](https://code.claude.com/docs/en/env-vars), но наследует ли Desktop эту настройку, нужно проверять отдельно. В этом случае изменение глобальной Claude-настройки не удалило metadata из запроса Desktop.

У native Anthropic OAuth path есть противоположное наблюдение: отключение attribution вызывает 429, см. [issue #6344](https://github.com/Wei-Shaw/sub2api/issues/6344). Поэтому не рекомендуется глобально задавать `CLAUDE_CODE_ATTRIBUTION_HEADER=0` или удалять этот текст из всех upstream requests.

## Проверка и оставшиеся случаи

Regression tests покрывают два формата system, переводы строк и пробелы, сохранение последующих инструкций, обычного текста, user/tool content и отсутствие изменения исходного запроса. Существующий тест для billing-header без двоеточия продолжает действовать.

После исправления создайте новую сессию реального клиента и проверьте полный ответ; убедитесь также, что прежний cooldown завершён. Если 429 сохраняется, дополнительно проверьте исходную ошибку upstream, фактическую quota, concurrency и model mapping. Не заменяйте диагностику бесконечными retry или постоянной очисткой cooldown.
