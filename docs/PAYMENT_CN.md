# 支付系统配置指南

[English](PAYMENT.md) | 中文 | [Русский](PAYMENT_RU.md)

Sub2API 内置余额充值和订阅购买能力，无需额外部署独立支付服务。

## 支持的支付服务商

| 服务商 | 常见方式 | 说明 |
|---|---|---|
| **EasyPay** | 支付宝、微信支付 | 兼容 EasyPay 协议的第三方聚合支付 |
| **支付宝官方** | 桌面二维码、移动端跳转 | 支付宝开放平台直连 |
| **微信支付官方** | Native 二维码、H5、MP/JSAPI | 微信支付 API v3 |
| **Stripe** | 银行卡、Link 及账户已启用方式 | 多币种结账 |
| **Airwallex** | Airwallex Drop-in 支付方式 | 测试和生产 API 环境 |

支付宝和微信支付在用户端是统一入口：管理员分别选择官方直连或 EasyPay 来源。Stripe 和 Airwallex 启用后作为独立支付方式展示。

内部 provider keys 为 `easypay`、`alipay_direct`、`wxpay_direct`、`stripe`、`airwallex`；用户可见的 payment-type keys 还包括 `alipay`、`wxpay`、`card`、`link`。

第三方费率、准入和结算条款不受本仓库控制并可能变化。请直接向服务商核实合同、合规、回调和生产可用性；Sub2API 不为任何聚合商背书或担保。

## 快速开始

1. 打开 **管理后台 → 设置 → 支付设置**。
2. 启用支付并选择用户可见的支付类型。
3. 配置金额、超时、待支付订单和取消频率限制。
4. 至少添加一个已启用的服务商实例。
5. 如需销售订阅，创建绑定到订阅分组的支付计划。
6. 上生产前完成一笔小额沙箱/测试支付，并验证签名回调、履约和退款流程。

## 系统设置

| 设置 | 含义 | 常见默认值 |
|---|---|---|
| 启用支付 | 全局开关 | 关闭 |
| 商品名称前缀/后缀 | 结账页商品说明 | 空 |
| 最小金额 | 单笔最小金额 | 1 |
| 最大金额 | 留空表示不限 | 空 |
| 每日限额 | 单用户每日累计，留空表示不限 | 空 |
| 订单超时 | 对账/过期前分钟数 | 30 |
| 最大待支付订单 | 每用户并发待支付订单数 | 3 |
| 负载均衡策略 | `round-robin` 或 `least_amount` | 轮询 |

取消限流、帮助文字/图片和可见支付方式来源路由也在同一管理页面配置。默认值可能随版本变化，以当前管理 UI/API 为准。

## 服务商凭据

应用会加密保存服务商密钥。禁止把真实凭据写入文档、工单、截图或 Git。

### EasyPay

必填：商户 ID（`pid`）、商户密钥（`pkey`）、API Base URL。支付宝/微信渠道 ID 可选。只使用可信 HTTPS 地址，并在启用前确认实现的签名和回调语义。

### 支付宝官方

必填：AppID、RSA2 应用私钥、支付宝公钥。桌面端优先使用当面付 Precreate 二维码，必要时回退到电脑网站支付；移动端使用受支持的支付宝跳转流程。

### 微信支付官方

必填：AppID、MchID、商户 API 私钥、32 字节 APIv3 Key、微信支付公钥及 Key ID、商户证书序列号。支持 Native、H5 和 MP/JSAPI；仅配置商户已开通的方式。

### Stripe

必填：Secret Key、Publishable Key、Webhook Signing Secret。Webhook endpoint 的 API 版本应与管理界面提示的 Stripe SDK 版本一致。

### Airwallex

| 字段 | 必填 |
|---|---|
| Client ID（`clientId`） | 是 |
| API Key（`apiKey`） | 是 |
| Webhook Secret（`webhookSecret`） | 是 |
| API Base（`apiBase`） | 是 |
| 币种 | 否 |
| 两位国家/地区代码 | 否，默认 `CN` |
| Account ID | 否；组织/多账户场景使用 |

测试密钥使用 `https://api-demo.airwallex.com/api/v1`，生产密钥使用 `https://api.airwallex.com/api/v1`。环境混用会被拒绝。只授予 Payment Acceptance 所需权限。

## 实例与路由

同一服务商可配置多个实例，用于可用性和限额。每个实例独立配置开关、支持方式、单笔/每日限额、退款能力和排序。

系统先过滤不兼容或超限实例，再使用轮询或最低累计金额策略。多实例不能替代外部账单对账。

## Webhook

应用根据站点 origin 生成回调路径：

| 服务商 | 路径 |
|---|---|
| EasyPay | `/api/v1/payment/webhook/easypay` |
| 支付宝 | `/api/v1/payment/webhook/alipay` |
| 微信支付 | `/api/v1/payment/webhook/wxpay` |
| Stripe | `/api/v1/payment/webhook/stripe` |
| Airwallex | `/api/v1/payment/webhook/airwallex` |

必须使用公网 HTTPS；按服务商要求在其后台配置精确 URL；放行反向代理/WAF 回调；不得绕过签名验证。Airwallex 至少选择 `payment_intent.succeeded`，建议同时选择 `payment_intent.cancelled`。测试重复和延迟回调，因为处理必须幂等。

## 订单生命周期

```text
创建订单（PENDING）
  -> 服务商结账
  -> 验签回调/对账（PAID 或 RECHARGING）
  -> 余额到账或订阅激活（COMPLETED）
```

当前状态：

- `PENDING`：等待支付；
- `PAID`：已确认支付，等待履约；
- `RECHARGING`：履约中；
- `COMPLETED`：余额/订阅已完成；
- `EXPIRED`、`CANCELLED`、`FAILED`：过期、取消、失败；
- `REFUND_REQUESTED`、`REFUNDING`、`REFUND_PENDING`：退款申请/处理中/待结算；
- `PARTIALLY_REFUNDED`、`REFUNDED`、`REFUND_FAILED`：部分退款、全额退款、退款失败。

服务在将符合条件的订单标记过期前可查询上游，以恢复延迟/遗漏的回调。运营方仍需把服务商账单与 Sub2API 订单对账。

## 订阅计划

内置支付支持订阅计划。`/api/v1/admin/payment/plans` 下的管理接口可创建、更新和删除计划。计划绑定到 `subscription_type=subscription` 的分组；支付履约成功后激活或延长用户订阅。

发布计划前测试续期、退款和到期行为。

## 从 Sub2ApiPay 迁移

1. 在不停止旧服务的情况下配置同等服务商。
2. 创建计划/路由并测试小额订单。
3. 将服务商 Webhook URL 切换到 Sub2API。
4. 验证新订单、履约、对账和退款。
5. 保留旧服务或只读数据库，直到历史数据满足保留要求。
6. 观察期结束后撤销旧凭据并下线。

历史 Sub2ApiPay 订单不会自动导入。

## 运维检查

- 修改支付配置前备份数据库；
- 先用 sandbox/demo 凭据；
- 保持服务器时间同步；
- 限制管理员访问并启用可用的二次确认；
- 监控回调失败、`PENDING`/`RECHARGING` 和退款状态；
- 记录服务商 API 版本和密钥轮换；
- 不要用伪造的未签名回调测试生产。
