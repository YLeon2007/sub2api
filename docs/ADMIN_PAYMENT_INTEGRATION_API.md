# Admin Payment Integration API

中文 / English | [Русский](ADMIN_PAYMENT_INTEGRATION_API_RU.md)

> 单文件中英双语文档 / Single-file bilingual documentation (Chinese + English)

Set the base URL to the actual Sub2API origin, for example `BASE=https://sub2api.example.com`. There is no repository-defined Beta port.

---

## 中文

### 目标

本文档用于外部支付系统（例如 `sub2apipay`）对接 Sub2API Admin API，覆盖支付成功后的充值、用户查询、人工余额修正和购买页参数透传。

### 认证与安全

服务间调用推荐使用 Admin API Key：

- `x-api-key: <ADMIN_API_KEY>`
- `Content-Type: application/json`
- 写接口额外传 `Idempotency-Key`

管理员 JWT 也可访问 admin 路由，但不建议用于服务间集成。请仅通过 HTTPS 发送凭证，并将 Admin API Key 保存在服务器端。

### 1. 原子创建并兑换

`POST /api/v1/admin/redeem-codes/create-and-redeem`

请求头必须包含 `Idempotency-Key`。请求体：

```json
{
  "code": "s2p_cm1234567890",
  "type": "balance",
  "value": 100.0,
  "user_id": 123,
  "notes": "sub2apipay order: cm1234567890"
}
```

幂等/冲突语义：

- 同 `code` 且已由同一用户兑换：`200`
- 同 `code` 但 `used_by` 不同：`409`
- 缺少 `Idempotency-Key`：`400`，错误码 `IDEMPOTENCY_KEY_REQUIRED`

```bash
BASE=https://sub2api.example.com
curl --fail-with-body -X POST "$BASE/api/v1/admin/redeem-codes/create-and-redeem" \
  -H "x-api-key: <ADMIN_API_KEY>" \
  -H "Idempotency-Key: pay-cm1234567890-success" \
  -H "Content-Type: application/json" \
  -d '{
    "code":"s2p_cm1234567890",
    "type":"balance",
    "value":100.00,
    "user_id":123,
    "notes":"sub2apipay order: cm1234567890"
  }'
```

### 2. 查询用户（可选前置校验）

`GET /api/v1/admin/users/:id`

```bash
curl --fail-with-body "$BASE/api/v1/admin/users/123" \
  -H "x-api-key: <ADMIN_API_KEY>"
```

### 3. 调整余额

`POST /api/v1/admin/users/:id/balance`

`operation` 只允许 `set`、`add` 或 `subtract`，`balance` 必须大于零。该写接口也要求 `Idempotency-Key`。

```bash
curl --fail-with-body -X POST "$BASE/api/v1/admin/users/123/balance" \
  -H "x-api-key: <ADMIN_API_KEY>" \
  -H "Idempotency-Key: balance-subtract-cm1234567890" \
  -H "Content-Type: application/json" \
  -d '{"balance":100.00,"operation":"subtract","notes":"manual correction"}'
```

### 4. 嵌入购买页/自定义页的 Query 参数

Sub2API 使用共享 URL builder 打开 `purchase_subscription_url` 和用户自定义 iframe 页面。它会追加：

- `user_id`、`token`（仅在有已登录用户时）
- `theme`（`light` / `dark`）
- `lang`（例如 `zh-CN`、`en`、`ru`）
- `ui_mode=embedded`
- `src_host`（Sub2API origin）
- `src_url`（当前 Sub2API 页面 URL）

```text
https://pay.example.com/pay?user_id=123&token=<jwt>&theme=light&lang=zh-CN&ui_mode=embedded&src_host=https%3A%2F%2Fsub2api.example.com&src_url=https%3A%2F%2Fsub2api.example.com%2Fpurchase
```

`token` 出现在 URL query 中，因此嵌入目标必须完全可信、使用 HTTPS，且不得把完整 URL 写入日志、分析系统或 Referer 可泄露的位置。

### 5. 失败处理

- 分别持久化“支付成功”和“充值成功”状态。
- 只有在回调验签成功后才标记支付成功。
- 支付成功但充值失败的订单应允许重试。
- 重试保持相同业务 `code`；每次独立尝试使用唯一且可追踪的 `Idempotency-Key`。

### 6. `doc_url`

- 当前文档：`https://github.com/YLeon2007/sub2api/blob/v0.1.175-ru.1/docs/ADMIN_PAYMENT_INTEGRATION_API.md`
- 俄语文档：`https://github.com/YLeon2007/sub2api/blob/v0.1.175-ru.1/docs/ADMIN_PAYMENT_INTEGRATION_API_RU.md`

---

## English

### Purpose

This document describes the Sub2API Admin API surface used by an external payment service for post-payment recharge, user lookup, manual balance correction and embedded purchase-page parameters.

### Authentication and security

For server-to-server calls use an Admin API Key:

- `x-api-key: <ADMIN_API_KEY>`
- `Content-Type: application/json`
- `Idempotency-Key` on write endpoints

Admin JWT authentication also works on admin routes, but it is not recommended for service integration. Send credentials only over HTTPS and keep the Admin API Key server-side.

### 1. Atomically create and redeem

`POST /api/v1/admin/redeem-codes/create-and-redeem`

The request body and executable `curl` example are shown in the Chinese section above. The endpoint requires `Idempotency-Key`.

- Same `code`, already redeemed by the same user: `200`
- Same `code`, different `used_by`: `409`
- Missing key: `400` with `IDEMPOTENCY_KEY_REQUIRED`

### 2. Query a user

`GET /api/v1/admin/users/:id`

This is an optional pre-check. Authenticate with `x-api-key` as shown above.

### 3. Adjust balance

`POST /api/v1/admin/users/:id/balance`

`operation` is one of `set`, `add`, or `subtract`; `balance` must be greater than zero. This write endpoint also requires `Idempotency-Key`.

### 4. Embedded purchase/custom-page query parameters

The shared URL builder appends `user_id`, `token`, `theme`, `lang`, `ui_mode=embedded`, `src_host`, and `src_url`. User and token are present only when an authenticated user is available.

Because the JWT is carried in the query string, the embedded destination must be fully trusted and HTTPS-only. Do not log or forward the complete URL through analytics or Referer-leaking flows.

### 5. Retry guidance

Persist payment success separately from recharge success, verify callback signatures first, retain the same business `code` across retries, and use a unique traceable `Idempotency-Key` for each independent attempt.

### 6. Documentation URLs

- This document: `https://github.com/YLeon2007/sub2api/blob/v0.1.175-ru.1/docs/ADMIN_PAYMENT_INTEGRATION_API.md`
- Russian: `https://github.com/YLeon2007/sub2api/blob/v0.1.175-ru.1/docs/ADMIN_PAYMENT_INTEGRATION_API_RU.md`
