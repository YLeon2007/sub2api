<div align="center">

<img src="assets/logo.svg" alt="Логотип Sub2API" width="128" />

# Sub2API

[![Go](https://img.shields.io/badge/Go-1.27.0-00ADD8.svg)](https://golang.org/)
[![Vue](https://img.shields.io/badge/Vue-3.4+-4FC08D.svg)](https://vuejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15+-336791.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7+-DC382D.svg)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://www.docker.com/)

**Платформа AI API Gateway для распределения квот подписок**

[English](README.md) | [中文](README_CN.md) | [日本語](README_JA.md) | Русский

</div>

> [!NOTE]
> Это сопровождаемый русифицированный fork проекта [Wei-Shaw/sub2api](https://github.com/Wei-Shaw/sub2api).
> Русские сборки, обновления и контейнеры публикуются в [YLeon2007/sub2api](https://github.com/YLeon2007/sub2api).

## Ресурсы fork

- [Исходный код](https://github.com/YLeon2007/sub2api)
- [Русские релизы](https://github.com/YLeon2007/sub2api/releases)
- [GHCR-контейнер](https://github.com/YLeon2007/sub2api/pkgs/container/sub2api)
- [Сообщить о проблеме](https://github.com/YLeon2007/sub2api/issues)
- [Оригинальный upstream](https://github.com/Wei-Shaw/sub2api)

Текущий русифицированный релиз: `v0.2.4-ru.1`.

## Партнёры

<table>
<tr>
<td width="180"><a href="https://codex-everywhere.com"><img src="assets/partners/logos/codex-everywhere.jpg" alt="CodexEverywhere" width="150"></a></td>
<td>Серия GPT-5.6 по цене 3% от тарифа OpenAI — <a href="https://codex-everywhere.com">CodexEverywhere</a> делает frontier models (передовые модели) доступнее разработчикам по всему миру. Сервис заявляет transparency (прозрачность) и honesty (честность), а качество моделей в течение нескольких месяцев проверяется active community oversight (активным контролем сообщества). Поддерживаются USD и crypto (криптовалюта). Начать можно с бесплатного trial (пробного баланса) $20 на <a href="https://codex-everywhere.com">codex-everywhere.com</a>.</td>
</tr>

<tr>
<td width="180"><a href="https://go.apimart.ai/gh-sub2api"><img src="assets/partners/logos/apimart.jpg" alt="APIMart" width="150"></a></td>
<td>Спасибо APIMart за поддержку проекта. <a href="https://go.apimart.ai/gh-sub2api">APIMart</a> — низкозатратная API platform (платформа API) для генерации AI image/video (изображений и видео): GPT-Image-2 от $0.006 за изображение, более 160 изображений за $1. Один async API (асинхронный API) покрывает изображения и видео: отправьте task (задачу), получите ID и заберите результат через polling (опрос) или callback (обратный вызов). Подходит для batch (пакетной) генерации десятков тысяч изображений без timeout (тайм-аута), переключение моделей не требует изменения кода. Pay as you go (оплата по факту использования), без ежемесячной платы — <a href="https://go.apimart.ai/gh-sub2api">зарегистрироваться можно здесь</a>.</td>
</tr>

<tr>
<td width="180"><a href="https://www.axisnow.io/"><img src="assets/partners/logos/axisnow.jpg" alt="AxisNow" width="150"></a></td>
<td>Спасибо AxisNow за поддержку проекта. <a href="https://www.axisnow.io/">AxisNow</a> защищает и ускоряет websites и API (сайты и программные интерфейсы), улучшая доступ из материкового Китая и других регионов. Через client SDK (клиентский комплект разработки) сервис распространяет acceleration/security (ускорение и защиту) на native/mobile apps (нативные и мобильные приложения): <strong>self-hosted private-deployment CDN</strong> (частная CDN в собственной инфраструктуре) | <strong>subscription-based DDoS-protected CDN</strong> (подписная CDN с DDoS-защитой) | <strong>autonomous, flexibly composable CDN network</strong> (автономно управляемая и гибко составляемая CDN-сеть).</td>
</tr>

<tr>
<td width="180"><a href="https://pp.dog/register?aff=SUB2API"><img src="assets/partners/logos/ppdog.png" alt="PP.dog" width="150"></a></td>
<td><a href="https://pp.dog/register?aff=SUB2API">PP.dog</a> — source-level API gateway (API-шлюз с собственным пулом аккаунтов) для downstream relay (нижестоящих ретрансляторов) и разработчиков с высокой частотой запросов. По данным спонсора, сервис использует собственный account pool без посреднической наценки, предлагает суммарный rate multiplier от 0,03x и first-token latency (задержку первого токена) менее 1 секунды. <a href="https://www.pp.dog/register?aff=SUB2API">Страница подключения PP.dog</a>.</td>
</tr>

<tr>
<td width="180"><a href="https://colaproxy.com/?utm_source=sub2api&utm_medium=sub2api&ref=sub2api"><img src="assets/partners/logos/cola-proxy.jpg" alt="ColaProxy" width="150"></a></td>
<td>ColaProxy предоставляет residential proxies (резидентские прокси) для web scraping (сбора открытых веб-данных), автоматизации и управления несколькими аккаунтами. По данным спонсора, доступны пробный доступ, трафик без срока действия, цены от $0,3/GB, неограниченные concurrent connections (параллельные подключения) и автоматическая ротация IP. Промокод COLA10 даёт скидку 10% — <a href="https://colaproxy.com/?utm_source=sub2api&utm_medium=sub2api&ref=sub2api">страница ColaProxy</a>.</td>
</tr>
</table>

## ⚠️ Важное уведомление

Перед использованием внимательно ознакомьтесь со следующими условиями:

- **Риск нарушения условий сервисов.** Использование проекта может противоречить условиям Anthropic и других upstream-провайдеров. Пользователь самостоятельно оценивает и принимает этот риск.
- **Законное использование.** Используйте проект только в соответствии с законодательством вашей страны или региона.
- **Отказ от гарантий.** Проект предоставляется для технического обучения и исследований. Авторы не отвечают за блокировку аккаунтов, перерывы в работе, потерю данных и другой прямой или косвенный ущерб.
- **Нет коммерческой авторизации.** Разработчики не выдавали разрешение на коммерческую деятельность от имени проекта. Ответственность за такую деятельность несёт соответствующая сторона.

Полные обязательства администратора опубликованы в [`docs/legal/admin-compliance.ru.md`](docs/legal/admin-compliance.ru.md).

## О проекте

Sub2API — это AI API Gateway для распределения и управления API-квотами подписок на AI-продукты. Пользователи работают через созданные платформой API-ключи, а Sub2API выполняет аутентификацию, тарификацию, балансировку нагрузки и передачу запросов upstream-провайдерам.

Русская версия сохраняет совместимость с официальным upstream и добавляет:

- русский интерфейс администратора и пользователя;
- русские системные сообщения и юридические документы;
- обновление из fork-owned GitHub Releases;
- immutable RU-теги формата `vX.Y.Z-ru.N`;
- multi-arch GHCR-образы для `linux/amd64` и `linux/arm64`;
- автоматические проверки EN/RU ключей и placeholders;
- проверяемые release, security и rollback-процедуры.

## Возможности

- **Управление несколькими аккаунтами** — OAuth и API Key аккаунты разных провайдеров.
- **Выдача API-ключей** — создание и управление ключами пользователей.
- **Точный биллинг** — учёт токенов, расходов и стоимости запросов.
- **Умное планирование** — выбор аккаунтов, sticky sessions и failover.
- **Ограничение параллельности** — лимиты пользователей и upstream-аккаунтов.
- **Rate limits** — ограничения количества запросов и токенов.
- **Встроенная оплата** — EasyPay, Alipay, WeChat Pay, Stripe и Airwallex; см. [`docs/PAYMENT_RU.md`](docs/PAYMENT_RU.md).
- **Панель администратора** — управление пользователями, аккаунтами, группами и мониторингом.
- **Composite Groups** — маршрутизация запросов между несколькими провайдерами; см. [`docs/COMPOSITE_GROUPS_RU.md`](docs/COMPOSITE_GROUPS_RU.md).
- **MiniMax, Kimi, Zhipu GLM, DeepSeek, Grok/xAI, Antigravity, Gemini, Claude и OpenAI-совместимые API**.
- **Асинхронные задачи изображений** — см. [`docs/ASYNC_IMAGE_TASKS_RU.md`](docs/ASYNC_IMAGE_TASKS_RU.md).
- **Batch Image MVP** — пакетная генерация Gemini/Vertex; см. [`docs/BATCH_IMAGE_MVP_RU.md`](docs/BATCH_IMAGE_MVP_RU.md).

## Что изменилось в v0.2.4

- **MiniMax** добавлен как полноценная платформа: аккаунты, composite routing (композитная маршрутизация), channel monitoring (мониторинг каналов) и quota monitoring (контроль квот). Миграция `237_add_minimax_platform.sql` расширяет соответствующие ограничения платформ в БД.
- Upstream добавил transport profile `long_stream` для HTTP/2 PING keepalive (проверки соединения): PING после 10 секунд без чтения и ожидание ответа 5 секунд. В `v0.2.4` production-пути ещё не выбирают новый profile, поэтому это не означает включение PING для всех providers; действующий OpenAI HTTP/2 path сохраняет проверку соединения.
- OpenAI image generation поддерживает Image 2.5; для Grok можно управлять media eligibility (допуском к медиавызовам), а список OpenAI-аккаунтов показывает оценку недельных расходов.
- В Channel Monitor V2 можно скрыть пользовательский рейтинг от неадминистраторов; справка по оплате поддерживает очищенный Markdown, а кнопку внешней ссылки на custom page можно перемещать перетаскиванием.
- Для Apple `container` добавлена переменная `APPLE_CONTAINER_NETWORK_SUBNET`: пустое значение сохраняет автоматический выбор сети, а заданный CIDR применяется только при создании управляемой сети. Инструкция: [`deploy/APPLE_CONTAINER_RU.md`](deploy/APPLE_CONTAINER_RU.md).
- Ограничен рост системных логов, cache invalidation (сброс кэша) каналов распространяется по кластеру, а отмена длинного upstream stream (потока) при отключении клиента обрабатывается до закрытия соединения.
- Исправлены ошибки OAuth image routing, параметра Grok `external_web_access`, cooldown после 429, частичного обновления и backup/fallback прокси, проверок диапазонов дат, видимости групп/регистрации, выбора аккаунтов и Windows plugin ZIP.
- `github.com/redis/go-redis/v9` обновлён с `v9.17.2` до `v9.22.0`, включая исправление panic при `nil` context в connection pool (пуле соединений).

## Исправления в v0.2.3

- **Alert rules / Alert events** — правила и события оповещений: исправлено отображение восьми стандартных китайских названий и описаний в русском списке и редакторе, а также в старых и новых событиях. Локализация выполняется при отображении; история БД и пользовательские тексты не переписываются.
- Уточнены оставшиеся обычные английские подписи в русских настройках квот и формах аккаунтов; технические identifiers — идентификаторы, модели и числовые лимиты сохранены.

- **Schema repair** — восстановление структуры БД: миграция `236_group_model_allowlist_repair.sql` восстанавливает `groups.model_allowlist`, если после отката или частичного восстановления базы осталась старая структура. При наличии только `models_list_config` столбец переименовывается с сохранением данных. Если существуют оба столбца, непустая старая конфигурация переносится только в пустой новый столбец, а старый сохраняется. Если нового столбца нет, он создаётся; затем обеспечиваются `NOT NULL` и значение по умолчанию `{}`. Это исправляет HTTP 500 на страницах API-ключей и подписок. Ограничение моделей из v0.2.2 не отменяется.
- **Ollama Cloud / DeepSeek**: ограничение выходных токенов применяется также к Anthropic Messages и нативному `/v1/responses`; завершающий `/` в base URL больше не мешает обработке. Для Anthropic-совместимого входа с Ollama Cloud автоматически выбирается Bearer-аутентификация.
- **Connection test** — проверка соединения аккаунта: исправлены пустые названия моделей в списке OpenAI OAuth / API Key.

## Изменения поведения в v0.2.2

- **Group Model Allowlist** — список разрешённых моделей группы — теперь ограничивает не только выдачу списка моделей, но и допуск запросов к gateway. Миграция `235_group_model_allowlist.sql` переименовывает `groups.models_list_config` в `groups.model_allowlist`, сохраняя данные. Поэтому ранее настроенный список отображаемых моделей после обновления становится ограничением доступа: перед установкой проверьте все группы. Отключённый allowlist не ограничивает модели; включить его с пустым списком через управление группами нельзя.
- **Grok media eligibility** — допуск аккаунта к генерации изображений/видео — больше не требует положительного подтверждения платного тарифа при неопределённом результате billing probe (проверки тарифа). API Key аккаунты остаются допустимыми. OAuth аккаунты исключаются при явном подтверждении Free или запрещённого доступа; отсутствующие или некорректные результаты проверяются перед отправкой запроса. Успешный, но неполный ответ биллинга получает статус `billing_inconclusive` и не исключает аккаунт: неизвестная схема ответа не доказывает отсутствие прав на медиа. Через `extra.grok_media_eligible=false` оператор может исключить проблемный аккаунт, через `true` — явно разрешить проверенный; `null` при обновлении возвращает автоматическую проверку, отсутствие поля сохраняет текущую настройку. Импорт выполняет предварительную проверку биллинга. Обычный чат и получение статуса видео не затрагиваются. Если подходящих аккаунтов нет, возвращается HTTP `503` с типом ошибки `grok_media_no_eligible_account`.

## Технологии

| Компонент | Технология |
|---|---|
| Backend | Go, Gin, Ent |
| Frontend | Vue 3, Vite, TailwindCSS |
| База данных | PostgreSQL 15+ |
| Кэш и очереди | Redis 7+ |
| Контейнеры | Docker Compose, GHCR |

## Nginx и заголовки с подчёркиванием

При использовании Nginx с Codex CLI добавьте в блок `http`:

```nginx
underscores_in_headers on;
```

Без этой настройки Nginx удаляет заголовки вроде `session_id`, что нарушает sticky routing в конфигурации с несколькими аккаунтами.

## Установка

### Вариант 1: установка binary через скрипт

Требования:

- Linux `amd64` или `arm64`;
- PostgreSQL 15+;
- Redis 7+;
- права root.

```bash
umask 077
tmpdir="$(mktemp -d)"
curl -fsSLo "$tmpdir/install.sh" https://raw.githubusercontent.com/YLeon2007/sub2api/v0.2.4-ru.1/deploy/install.sh
less "$tmpdir/install.sh"
read -r -p "Run the inspected installer? [y/N] " confirm
case "$confirm" in
  [yY]) sudo bash "$tmpdir/install.sh" ;;
  *) echo "Cancelled"; rm -rf "$tmpdir"; exit 1 ;;
esac
rm -rf "$tmpdir"
```

Скрипт:

1. определяет ОС и архитектуру;
2. получает последний русский релиз из `YLeon2007/sub2api`;
3. проверяет checksum;
4. устанавливает binary в `/opt/sub2api`;
5. создаёт systemd service.

После установки:

```bash
sudo systemctl enable --now sub2api
sudo systemctl status sub2api
sudo journalctl -u sub2api -f
```

Откройте `http://SERVER_IP:8080` и завершите мастер первоначальной настройки.

Удаление:

```bash
umask 077
tmpdir="$(mktemp -d)"
curl -fsSLo "$tmpdir/install.sh" https://raw.githubusercontent.com/YLeon2007/sub2api/v0.2.4-ru.1/deploy/install.sh
less "$tmpdir/install.sh"
read -r -p "Run the inspected uninstaller? [y/N] " confirm
case "$confirm" in
  [yY]) sudo bash "$tmpdir/install.sh" uninstall -y ;;
  *) echo "Cancelled"; rm -rf "$tmpdir"; exit 1 ;;
esac
rm -rf "$tmpdir"
```

### Вариант 2: Docker Compose

Требования:

- Docker 20.10+;
- Docker Compose v2+.

#### Быстрый старт

```bash
mkdir -p sub2api-deploy
cd sub2api-deploy
umask 077
tmpdir="$(mktemp -d)"
curl -fsSLo "$tmpdir/docker-deploy.sh" https://raw.githubusercontent.com/YLeon2007/sub2api/v0.2.4-ru.1/deploy/docker-deploy.sh
less "$tmpdir/docker-deploy.sh"
read -r -p "Run the inspected deployment script? [y/N] " confirm
case "$confirm" in
  [yY]) chmod +x "$tmpdir/docker-deploy.sh"; "$tmpdir/docker-deploy.sh" ;;
  *) echo "Cancelled"; rm -rf "$tmpdir"; exit 1 ;;
esac
rm -rf "$tmpdir"
docker compose up -d
docker compose ps
docker compose logs -f sub2api
```

Скрипт скачивает fork-owned Compose и `.env.example`, создаёт стойкие каталоги данных и генерирует случайные `JWT_SECRET`, `TOTP_ENCRYPTION_KEY` и `POSTGRES_PASSWORD`.

По умолчанию используется immutable образ:

```text
ghcr.io/yleon2007/sub2api:0.2.4-ru.1
```

#### Ручная установка

```bash
git clone https://github.com/YLeon2007/sub2api.git
cd sub2api/deploy
cp .env.example .env
chmod 600 .env
nano .env

docker compose up -d
docker compose ps
```

Обязательно задайте надёжный `POSTGRES_PASSWORD`. Рекомендуется также явно сохранить постоянные значения `JWT_SECRET` и `TOTP_ENCRYPTION_KEY`.

Сгенерировать секреты можно так:

```bash
openssl rand -hex 32
```

### Вариант 3: Apple container

Для Mac с Apple silicon, macOS 26 и Apple `container` 1.1.0+:

```bash
git clone https://github.com/YLeon2007/sub2api.git
cd sub2api/deploy
./apple-container.sh init
./apple-container.sh up
./apple-container.sh status
```

Подробности: [`deploy/APPLE_CONTAINER_RU.md`](deploy/APPLE_CONTAINER_RU.md) ([English](deploy/APPLE_CONTAINER.md)).

### Вариант 4: сборка из исходного кода

```bash
git clone https://github.com/YLeon2007/sub2api.git
cd sub2api

cd frontend
pnpm install
pnpm run build

cd ../backend
VERSION="$(./scripts/resolve-version.sh)"
go build -tags embed -ldflags="-X main.Version=${VERSION}" -o sub2api ./cmd/server
```

Флаг `-tags embed` обязателен: без него frontend не будет встроен в binary.

## Обновление через веб-интерфейс

Панель проверяет релизы именно в `YLeon2007/sub2api`.

В панели администратора:

1. нажмите **«Проверить обновления»**;
2. убедитесь, что показан новый тег `vX.Y.Z-ru.N`;
3. создайте свежий backup;
4. нажмите **«Обновить»**;
5. выполните штатный restart из панели;
6. проверьте версию и health status.

Панель поддерживает локальный и versioned rollback. Для Docker после успешной проверки рекомендуется также pin нового immutable GHCR-тега в Compose, чтобы обычный recreate не вернул старый binary из образа.

## Обновление Docker-образа вручную

Используйте только конкретный immutable тег:

```bash
docker pull ghcr.io/yleon2007/sub2api:0.2.4-ru.1
docker compose up -d --no-deps --force-recreate sub2api
```

Плавающий тег `latest` намеренно не публикуется. Перед изменением версии сохраните предыдущий image reference и backup PostgreSQL.

## Резервное копирование и перенос

### Встроенный S3-backup из панели

Начиная с `v0.1.175`, встроенный S3-backup сначала создаёт полный локальный gzip-архив. Если сжатый архив имеет размер свыше 4 ГиБ, сервер разбивает его на `payload.part-*` перед загрузкой в object storage. Во время разбиения предусмотрите свободное место примерно для двух сжатых копий; на всю операцию действует существующий тайм-аут 30 минут. Архив и части создаются через `os.TempDir()` (обычно каталог из `TMPDIR`), поэтому до крупного backup проверьте свободное место именно на этой файловой системе; она может отличаться от файловой системы приложения.

Для конфигурации с локальными каталогами:

```bash
# Новые backup-файлы должны быть доступны только текущему пользователю.
umask 077

# Сначала остановите запись в приложение.
docker compose stop sub2api

# Логический backup PostgreSQL.
docker compose exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-sub2api}" "${POSTGRES_DB:-sub2api}" \
  > sub2api.sql

# Backup конфигурации без файла секретов .env и файлов приложения.
tar --exclude='.env' -czf sub2api-data.tar.gz data docker-compose.yml
chmod 600 sub2api.sql sub2api-data.tar.gz

docker compose start sub2api
```

`.env` намеренно не включён в архив. Передавайте его отдельно по защищённому каналу и восстановите права `0600`; не коммитьте и не помещайте его в общий backup.

Перед восстановлением обязательно проверьте архив, чтение SQL dump и совместимость версии схемы.

Миграции базы данных выполняются вперёд. Один только откат контейнерного образа не отменяет уже применённую SQL-миграцию — для полного rollback может понадобиться восстановление backup.

## Безопасность production

- Используйте только HTTPS.
- Ограничьте доступ к PostgreSQL и Redis внутренней сетью контейнеров.
- Храните `.env` с правами `0600`.
- Сохраните постоянные `JWT_SECRET` и `TOTP_ENCRYPTION_KEY`.
- Настройте точные `server.trusted_proxies`.
- Не доверяйте необработанным forwarding headers от внешних клиентов.
- Ограничьте исходящие подключения к разрешённым upstream domains.
- Перед обновлением делайте свежий DB backup и проверяйте rollback path.
- Не используйте `docker compose down -v`, если не собираетесь удалить данные.

Дополнительные рекомендации:

- [`deploy/EDGE_SECURITY.md`](deploy/EDGE_SECURITY.md)
- [`deploy/README_RU.md`](deploy/README_RU.md)
- [`docs/legal/admin-compliance.ru.md`](docs/legal/admin-compliance.ru.md)

## Simple Mode

Для индивидуального или внутреннего использования без полного SaaS-функционала:

```dotenv
RUN_MODE=simple
SIMPLE_MODE_CONFIRM=true
```

`SIMPLE_MODE_CONFIRM=true` обязателен в production mode.

## Структура проекта

```text
sub2api/
├── backend/                  # Go backend
├── frontend/                 # Vue frontend и локализации
├── deploy/                   # Compose, installer и deployment docs
├── docs/                     # Техническая и юридическая документация
├── tools/                    # Release и security guards
└── .github/workflows/        # CI, security, upstream watcher и release
```

## Синхронизация с upstream

Новые русские версии строятся только от проверенных official tags `Wei-Shaw/sub2api`. Русификация переносится поверх exact official tree, после чего выполняются:

- проверка locale keys и placeholders;
- backend/frontend tests;
- lint, typecheck и production build;
- security scans;
- GoReleaser и multi-arch image build;
- независимый review frozen diff;
- публикация нового immutable RU-тега.

Official upstream: [Wei-Shaw/sub2api](https://github.com/Wei-Shaw/sub2api).

## Экосистема и спонсоры

Список интеграций и спонсоров оригинального проекта сохранён в [английском README](README.md) и [китайском README](README_CN.md). Сторонние сервисы не являются частью русифицированного fork и должны оцениваться отдельно.

## Лицензия

Проект распространяется по [GNU Lesser General Public License v3.0](LICENSE) или более поздней версии.

Copyright (c) 2026 Wesley Liddick.
Русификация и fork-specific release automation поддерживаются в `YLeon2007/sub2api`.
