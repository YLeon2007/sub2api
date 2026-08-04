# Payment System Configuration Guide

English | [中文](PAYMENT_CN.md) | [Русский](PAYMENT_RU.md)

Sub2API includes balance top-ups and subscription purchases. No separate payment service is required.

## Supported providers

| Provider | Typical methods | Notes |
|---|---|---|
| **EasyPay** | Alipay, WeChat Pay | Third-party EasyPay-compatible aggregation |
| **Alipay (Direct)** | Desktop QR, mobile redirect | Alipay Open Platform |
| **WeChat Pay (Direct)** | Native QR, H5, MP/JSAPI | WeChat Pay API v3 |
| **Stripe** | Card, Link and account-enabled methods | Multi-currency checkout |
| **Airwallex** | Airwallex Drop-in checkout methods | Demo and production API environments |

Alipay and WeChat are unified customer-facing methods: an administrator selects either the direct provider or an EasyPay source for each one. Stripe and Airwallex are independent visible methods when enabled.

Internal provider keys are `easypay`, `alipay_direct`, `wxpay_direct`, `stripe`, and `airwallex`; visible payment-type keys also include `alipay`, `wxpay`, `card`, and `link`.

Third-party fees, eligibility and settlement terms change outside this repository. Verify current contracts, compliance, callback requirements and production readiness directly with the provider; Sub2API does not endorse or guarantee an aggregator.

## Quick start

1. Open **Admin → Settings → Payment Settings**.
2. Enable Payment and select visible payment types.
3. Configure amount, timeout, pending-order and cancellation limits.
4. Add at least one enabled provider instance.
5. For subscription sales, create a payment plan bound to a subscription group.
6. Complete a low-value sandbox/test payment and verify the signed webhook, fulfillment and refund path before production.

## System settings

| Setting | Meaning | Typical default |
|---|---|---|
| Enable Payment | Global payment switch | Off |
| Product Name Prefix/Suffix | Checkout product description | Empty |
| Minimum Amount | Minimum top-up/order amount | 1 |
| Maximum Amount | Empty means unlimited | Empty |
| Daily Limit | Per-user daily amount; empty means unlimited | Empty |
| Order Timeout | Minutes before reconciliation/expiry | 30 |
| Max Pending Orders | Concurrent pending orders per user | 3 |
| Load Balance Strategy | `round-robin` or `least_amount` | Round robin |

Cancellation rate limits, help text/image and visible-method source routing are configured in the same admin section. The admin UI/API is the source of truth for defaults because they can change between releases.

## Provider credentials

Provider secrets are encrypted at rest by the application. Do not put real credentials in documentation, tickets, screenshots or Git.

### EasyPay

| Field | Required |
|---|---|
| Merchant ID (`pid`) | Yes |
| Merchant key (`pkey`) | Yes |
| API base URL | Yes |
| Optional Alipay/WeChat channel IDs | No |

Use only an HTTPS endpoint you trust. Confirm the EasyPay implementation's signing algorithm and callback behavior before enabling it.

### Alipay (Direct)

| Field | Required |
|---|---|
| AppID | Yes |
| RSA2 application private key | Yes |
| Alipay public key | Yes |

Desktop checkout prefers Face-to-Face Precreate QR and can fall back to Computer Website Pay. Mobile checkout uses the supported Alipay redirect flow.

### WeChat Pay (Direct)

| Field | Required |
|---|---|
| AppID | Yes |
| Merchant ID (MchID) | Yes |
| Merchant API private key | Yes |
| API v3 key (32 bytes) | Yes |
| WeChat Pay public key and key ID | Yes |
| Merchant certificate serial number | Yes |

The provider supports Native QR, H5 and MP/JSAPI flows. Configure only the modes enabled for the merchant account.

### Stripe

| Field | Required |
|---|---|
| Secret key | Yes |
| Publishable key | Yes |
| Webhook signing secret | Yes |

The Webhook endpoint API version must match the integrated Stripe SDK version shown in the admin UI.

### Airwallex

| Field | Required |
|---|---|
| Client ID (`clientId`) | Yes |
| API key (`apiKey`) | Yes |
| Webhook secret (`webhookSecret`) | Yes |
| API base (`apiBase`) | Yes |
| Currency | No (defaults to configured payment currency) |
| Two-letter country code | No (defaults to `CN`) |
| Account ID | No; use for organization/multi-account scenarios |

Use `https://api-demo.airwallex.com/api/v1` with demo keys and `https://api.airwallex.com/api/v1` with production keys. Environment mixing is rejected. Grant only the required Payment Acceptance permissions.

## Provider instances and routing

Multiple instances of one provider can be used for availability and limits. Each instance has its own enabled flag, supported methods, single-order limits, daily limit, refund capability and sort order.

Selection filters incompatible/over-limit instances, then applies round-robin or least-amount routing. Monitor each provider independently; multiple instances do not replace external reconciliation.

## Webhooks

The application generates callback URLs from the configured site origin:

| Provider | Path |
|---|---|
| EasyPay | `/api/v1/payment/webhook/easypay` |
| Alipay | `/api/v1/payment/webhook/alipay` |
| WeChat Pay | `/api/v1/payment/webhook/wxpay` |
| Stripe | `/api/v1/payment/webhook/stripe` |
| Airwallex | `/api/v1/payment/webhook/airwallex` |

Requirements:

- use a public HTTPS origin;
- configure the exact URL in the provider dashboard when required;
- allow provider callback traffic through the reverse proxy/WAF;
- never bypass signature verification;
- for Airwallex select at least `payment_intent.succeeded`, preferably also `payment_intent.cancelled`;
- test duplicate and delayed callbacks because processing is idempotent.

## Order lifecycle

```text
Create order (PENDING)
  -> provider checkout
  -> verified callback / reconciliation (PAID or RECHARGING)
  -> balance credit or subscription activation (COMPLETED)
```

Current order statuses:

| Status | Meaning |
|---|---|
| `PENDING` | Waiting for payment |
| `PAID` | Payment confirmed, fulfillment pending |
| `RECHARGING` | Fulfillment in progress |
| `COMPLETED` | Balance/subscription fulfilled |
| `EXPIRED` | Timeout reached without confirmed payment |
| `CANCELLED` | Cancelled |
| `FAILED` | Payment or fulfillment failed |
| `REFUND_REQUESTED` | Refund requested |
| `REFUNDING` | Refund request in progress |
| `REFUND_PENDING` | Provider accepted; settlement pending |
| `PARTIALLY_REFUNDED` | Partial refund completed |
| `REFUNDED` | Full refund completed |
| `REFUND_FAILED` | Refund failed |

Before expiring eligible orders, the service can query the upstream provider to recover a delayed/missed callback. Operators must still reconcile provider statements with Sub2API orders.

## Subscription plans

The built-in payment system supports subscription plans. Admin routes under `/api/v1/admin/payment/plans` create, update and delete plans. A plan binds to a group whose `subscription_type` is `subscription`; successful fulfillment activates or extends the user's subscription.

Test renewal, refund and expiry behavior for every plan before publishing it.

## Migrating from Sub2ApiPay

1. Configure equivalent providers in Sub2API without disabling the old service.
2. Create plans/routing and test low-value orders.
3. Change provider webhook URLs to Sub2API.
4. Confirm new orders, fulfillment, reconciliation and refunds.
5. Keep the old service/read-only database for historical records until retention requirements are met.
6. Revoke old credentials and decommission only after the observation period.

Historical Sub2ApiPay orders are not imported automatically.

## Operational checklist

- Back up the database before enabling or changing payment configuration.
- Use sandbox/demo credentials first.
- Keep server time synchronized.
- Restrict admin access and require step-up authentication where available.
- Monitor callback failures, pending/recharging orders and refund states.
- Document provider-side API versions and credential rotation.
- Never test production webhooks with fabricated unsigned callbacks.
