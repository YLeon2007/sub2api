# API интеграции внешней платёжной системы с Admin API

[中文 / English](ADMIN_PAYMENT_INTEGRATION_API.md) | Русский

Задайте `BASE` равным реальному origin Sub2API, например `BASE=https://sub2api.example.com`. В репозитории нет отдельного обязательного Beta-порта.

## Назначение

Документ описывает минимальный Admin API для внешней платёжной системы: зачисление после успешной оплаты, поиск пользователя, ручную корректировку баланса и параметры встроенной страницы покупки.

## Аутентификация и безопасность

Для server-to-server вызовов используйте Admin API Key:

- `x-api-key: <ADMIN_API_KEY>`
- `Content-Type: application/json`
- `Idempotency-Key` для изменяющих состояние endpoint-ов

Admin JWT также допускается admin routes, но для интеграции сервисов он не рекомендуется. Передавайте секреты только по HTTPS и храните Admin API Key на сервере.

## 1. Атомарно создать и погасить код

`POST /api/v1/admin/redeem-codes/create-and-redeem`

```json
{
  "code": "s2p_<ORDER_ID>",
  "type": "balance",
  "value": 100.0,
  "user_id": 123,
  "notes": "sub2apipay order: <ORDER_ID>"
}
```

Поведение:

- тот же `code`, уже погашенный тем же пользователем: `200`;
- тот же `code`, но другой `used_by`: `409`;
- нет `Idempotency-Key`: `400`, код `IDEMPOTENCY_KEY_REQUIRED`.

```bash
BASE=https://sub2api.example.com
curl --fail-with-body -X POST "$BASE/api/v1/admin/redeem-codes/create-and-redeem" \
  -H "x-api-key: <ADMIN_API_KEY>" \
  -H "Idempotency-Key: pay-<ORDER_ID>-success" \
  -H "Content-Type: application/json" \
  -d '{
    "code":"s2p_<ORDER_ID>",
    "type":"balance",
    "value":100.00,
    "user_id":123,
    "notes":"sub2apipay order: <ORDER_ID>"
  }'
```

## 2. Найти пользователя

`GET /api/v1/admin/users/:id`

```bash
curl --fail-with-body "$BASE/api/v1/admin/users/123" \
  -H "x-api-key: <ADMIN_API_KEY>"
```

Это необязательная предварительная проверка.

## 3. Скорректировать баланс

`POST /api/v1/admin/users/:id/balance`

`operation` принимает только `set`, `add` или `subtract`; `balance` должен быть больше нуля. Endpoint требует `Idempotency-Key`.

```bash
curl --fail-with-body -X POST "$BASE/api/v1/admin/users/123/balance" \
  -H "x-api-key: <ADMIN_API_KEY>" \
  -H "Idempotency-Key: balance-subtract-<ORDER_ID>" \
  -H "Content-Type: application/json" \
  -d '{"balance":100.00,"operation":"subtract","notes":"manual correction"}'
```

## 4. Query-параметры встроенной страницы

Общий URL builder для `purchase_subscription_url` и пользовательских iframe добавляет:

- `user_id` и `token`, если пользователь аутентифицирован;
- `theme` (`light` / `dark`);
- `lang` (например, `ru`, `en`, `zh-CN`);
- `ui_mode=embedded`;
- `src_host` — origin Sub2API;
- `src_url` — текущий URL страницы Sub2API.

```text
https://pay.example.com/pay?user_id=123&token=<jwt>&theme=light&lang=ru&ui_mode=embedded&src_host=https%3A%2F%2Fsub2api.example.com&src_url=https%3A%2F%2Fsub2api.example.com%2Fpurchase
```

JWT находится в query string. Встраиваемый адрес должен быть полностью доверенным и работать только по HTTPS. Не записывайте полный URL в журналы/аналитику и не допускайте утечки через Referer.

## 5. Обработка ошибок и повторов

- Храните статусы оплаты и зачисления раздельно.
- Отмечайте оплату успешной только после проверки подписи callback.
- Разрешайте повтор зачисления, если платёж прошёл, а recharge завершился ошибкой.
- Сохраняйте тот же бизнес-`code`; для каждой отдельной попытки используйте уникальный отслеживаемый `Idempotency-Key`.

## 6. URL документации (`doc_url`)

- Этот документ: `https://github.com/YLeon2007/sub2api/blob/main/docs/ADMIN_PAYMENT_INTEGRATION_API_RU.md`
- Китайская/английская версия: `https://github.com/YLeon2007/sub2api/blob/main/docs/ADMIN_PAYMENT_INTEGRATION_API.md`
