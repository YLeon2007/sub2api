# Настройка платёжной системы

[English](PAYMENT.md) | [中文](PAYMENT_CN.md) | Русский

Sub2API поддерживает пополнение баланса и покупку подписок без отдельного платёжного сервиса.

## Поддерживаемые провайдеры

| Провайдер | Типичные способы | Примечание |
|---|---|---|
| **EasyPay** | Alipay, WeChat Pay | Сторонний агрегатор с протоколом EasyPay |
| **Alipay (напрямую)** | QR на desktop, мобильный redirect | Alipay Open Platform |
| **WeChat Pay (напрямую)** | Native QR, H5, MP/JSAPI | WeChat Pay API v3 |
| **Stripe** | Карты, Link и включённые в аккаунте методы | Мультивалютная оплата |
| **Airwallex** | Методы Airwallex Drop-in | Demo и production API |

Alipay и WeChat являются едиными пользовательскими способами: администратор выбирает для каждого прямой канал или источник EasyPay. Stripe и Airwallex показываются отдельно, если включены.

Внутренние provider keys: `easypay`, `alipay_direct`, `wxpay_direct`, `stripe`, `airwallex`; пользовательские payment-type keys также включают `alipay`, `wxpay`, `card`, `link`.

Комиссии, требования и сроки расчётов сторонних сервисов меняются вне репозитория. Проверяйте договор, соответствие требованиям, callback и production readiness непосредственно у провайдера; Sub2API не гарантирует работу агрегаторов.

## Быстрый запуск

1. Откройте **Администрирование → Настройки → Настройки платежей**.
2. Включите платежи и выберите видимые способы.
3. Настройте суммы, timeout, лимит ожидающих заказов и ограничение отмен.
4. Добавьте хотя бы один активный экземпляр провайдера.
5. Для подписок создайте план, привязанный к subscription-группе.
6. До production проведите недорогой sandbox/test-платёж и проверьте подписанный webhook, выполнение заказа и refund.

## Системные параметры

| Параметр | Значение | Типичное значение |
|---|---|---|
| Enable Payment | Глобальный переключатель | Выкл. |
| Product Name Prefix/Suffix | Описание товара | Пусто |
| Minimum Amount | Минимальная сумма | 1 |
| Maximum Amount | Пусто — без лимита | Пусто |
| Daily Limit | Суточный лимит пользователя | Пусто |
| Order Timeout | Минуты до reconciliation/expiry | 30 |
| Max Pending Orders | Одновременные ожидающие заказы | 3 |
| Load Balance Strategy | `round-robin` или `least_amount` | Round robin |

В той же секции настраиваются ограничение отмен, справочный текст/изображение и маршрутизация видимых способов. Текущий Admin UI/API — источник истины для defaults.

## Учётные данные провайдеров

Приложение шифрует секреты при хранении. Не помещайте реальные данные в документацию, тикеты, скриншоты или Git.

### EasyPay

Обязательны Merchant ID (`pid`), Merchant Key (`pkey`) и API Base URL; идентификаторы каналов Alipay/WeChat необязательны. Используйте только доверенный HTTPS endpoint и заранее проверьте подпись/callback выбранной реализации.

### Alipay (прямой)

Обязательны AppID, приватный RSA2-ключ приложения и публичный ключ Alipay. Desktop предпочитает Face-to-Face Precreate QR и может перейти к Computer Website Pay; мобильный сценарий использует поддерживаемый redirect.

### WeChat Pay (прямой)

Обязательны AppID, MchID, приватный API-ключ продавца, 32-байтный APIv3 Key, публичный ключ WeChat Pay с Key ID и serial сертификата продавца. Включайте только доступные аккаунту Native/H5/MP/JSAPI режимы.

### Stripe

Обязательны Secret Key, Publishable Key и Webhook Signing Secret. Версия Webhook endpoint должна соответствовать версии Stripe SDK, указанной в Admin UI.

### Airwallex

| Поле | Обязательно |
|---|---|
| Client ID (`clientId`) | Да |
| API Key (`apiKey`) | Да |
| Webhook Secret (`webhookSecret`) | Да |
| API Base (`apiBase`) | Да |
| Валюта | Нет |
| Двухбуквенный код страны | Нет, default `CN` |
| Account ID | Нет; для организаций/нескольких аккаунтов |

Demo-ключи используют `https://api-demo.airwallex.com/api/v1`, production — `https://api.airwallex.com/api/v1`. Смешивание окружений отклоняется. Выдавайте только необходимые Payment Acceptance permissions.

## Экземпляры и маршрутизация

Можно создать несколько экземпляров одного провайдера. У каждого свои переключатель, методы, лимиты одной операции/суток, refund capability и порядок.

После фильтрации несовместимых/превысивших лимиты экземпляров применяется round-robin или least-amount. Несколько экземпляров не отменяют внешнюю сверку операций.

## Webhook

Приложение строит callback от настроенного site origin:

| Провайдер | Путь |
|---|---|
| EasyPay | `/api/v1/payment/webhook/easypay` |
| Alipay | `/api/v1/payment/webhook/alipay` |
| WeChat Pay | `/api/v1/payment/webhook/wxpay` |
| Stripe | `/api/v1/payment/webhook/stripe` |
| Airwallex | `/api/v1/payment/webhook/airwallex` |

Используйте публичный HTTPS origin, укажите точный URL в кабинете провайдера, пропустите callback через reverse proxy/WAF и не отключайте проверку подписи. Для Airwallex выберите минимум `payment_intent.succeeded`, желательно также `payment_intent.cancelled`. Проверьте дубликаты и задержанные события — обработка должна быть идемпотентной.

## Жизненный цикл заказа

```text
Создание (PENDING)
  -> checkout провайдера
  -> подписанный callback / reconciliation (PAID или RECHARGING)
  -> зачисление баланса или активация подписки (COMPLETED)
```

Текущие статусы:

- `PENDING` — ожидание оплаты;
- `PAID` — оплата подтверждена, выполнение ожидается;
- `RECHARGING` — выполнение идёт;
- `COMPLETED` — баланс/подписка предоставлены;
- `EXPIRED`, `CANCELLED`, `FAILED` — истёк, отменён, ошибка;
- `REFUND_REQUESTED`, `REFUNDING`, `REFUND_PENDING` — запрос/обработка/ожидание refund;
- `PARTIALLY_REFUNDED`, `REFUNDED`, `REFUND_FAILED` — частичный/полный/неудачный refund.

Перед expiry подходящих заказов сервис может запросить upstream и восстановить пропущенный/задержанный callback. Оператор всё равно должен сверять выписки провайдера с заказами Sub2API.

## Планы подписок

Встроенная система поддерживает subscription plans. Admin routes `/api/v1/admin/payment/plans` создают, обновляют и удаляют планы. План привязывается к группе с `subscription_type=subscription`; успешное выполнение активирует или продлевает подписку пользователя.

До публикации каждого плана проверьте продление, refund и expiry.

## Миграция с Sub2ApiPay

1. Не отключая старый сервис, настройте эквивалентных провайдеров в Sub2API.
2. Создайте планы/маршрутизацию и проведите недорогие тесты.
3. Переключите Webhook URL провайдеров на Sub2API.
4. Проверьте новые заказы, выполнение, reconciliation и refund.
5. Сохраняйте старый сервис/БД read-only до окончания срока хранения истории.
6. После периода наблюдения отзовите старые секреты и выключите сервис.

Исторические заказы Sub2ApiPay автоматически не импортируются.

## Операционный checklist

- Сделайте backup БД до включения/изменения payment config.
- Начинайте с sandbox/demo credentials.
- Синхронизируйте время сервера.
- Ограничьте admin access и включите step-up verification, где доступно.
- Следите за callback errors, `PENDING`/`RECHARGING` и refund statuses.
- Фиксируйте provider API versions и rotation credentials.
- Не тестируйте production поддельными неподписанными callbacks.
