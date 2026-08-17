<div align="center">

<img src="assets/logo.svg" alt="Логотип Sub2API" width="128" />

# Sub2API

[![Go](https://img.shields.io/badge/Go-1.26.5-00ADD8.svg)](https://golang.org/)
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

Текущий русифицированный релиз: `v0.1.177-ru.1`.

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
- **Grok/xAI, Antigravity, Gemini, Claude и OpenAI-совместимые API**.
- **Асинхронные задачи изображений** — см. [`docs/ASYNC_IMAGE_TASKS_RU.md`](docs/ASYNC_IMAGE_TASKS_RU.md).
- **Batch Image MVP** — пакетная генерация Gemini/Vertex; см. [`docs/BATCH_IMAGE_MVP_RU.md`](docs/BATCH_IMAGE_MVP_RU.md).

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
curl -fsSLo "$tmpdir/install.sh" https://raw.githubusercontent.com/YLeon2007/sub2api/v0.1.177-ru.1/deploy/install.sh
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
curl -fsSLo "$tmpdir/install.sh" https://raw.githubusercontent.com/YLeon2007/sub2api/v0.1.177-ru.1/deploy/install.sh
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
curl -fsSLo "$tmpdir/docker-deploy.sh" https://raw.githubusercontent.com/YLeon2007/sub2api/v0.1.177-ru.1/deploy/docker-deploy.sh
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
ghcr.io/yleon2007/sub2api:0.1.177-ru.1
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

Подробности: [`deploy/APPLE_CONTAINER.md`](deploy/APPLE_CONTAINER.md).

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
docker pull ghcr.io/yleon2007/sub2api:0.1.177-ru.1
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
