# Файлы развёртывания Sub2API

[English](README.md) | Русский

Каталог содержит Docker/systemd assets для Linux и локальный стек Apple silicon.

## Выбор способа

| Способ | Сценарий | Setup |
|---|---|---|
| Docker Compose | Рекомендуемый серверный вариант | `AUTO_SETUP=true` по умолчанию |
| Apple `container` | Локальный macOS 26+ на Apple silicon | Автоматический стек без restart supervisor |
| Binary + systemd | PostgreSQL/Redis управляются отдельно | Web setup wizard |

## Основные файлы

| Файл | Назначение |
|---|---|
| `docker-compose.yml` | Named volumes, включая persistent `/app` runtime |
| `docker-compose.local.yml` | Локальные bind-mounted data directories |
| `docker-compose.standalone.yml` | Только app для внешних PostgreSQL/Redis |
| `docker-deploy.sh` | Подготовка local-directory deployment |
| `.env.example` | Шаблон environment |
| `DOCKER.md` | Container/GHCR guide |
| `apple-container.sh`, `APPLE_CONTAINER.md` | Apple lifecycle/guide |
| `install.sh`, `sub2api.service` | Binary/systemd |
| `install-datamanagementd.sh` и service/docs | Необязательный host daemon управления данными |
| `config.example.yaml` | Полный config reference |
| `EDGE_SECURITY.md` | Reverse proxy/CDN/WAF/trusted proxy hardening |

Fork defaults используют immutable image `ghcr.io/yleon2007/sub2api:0.1.179-ru.1`. Новые releases требуют явной смены tag; не переводите production на чужой mutable `latest`.

## Docker: preparation script

Скачайте и проверьте script до запуска:

```bash
mkdir -p sub2api-deploy && cd sub2api-deploy
umask 077
tmpdir="$(mktemp -d)"
curl -fsSLo "$tmpdir/docker-deploy.sh" \
  https://raw.githubusercontent.com/YLeon2007/sub2api/v0.1.179-ru.1/deploy/docker-deploy.sh
less "$tmpdir/docker-deploy.sh"
read -r -p "Run the inspected deployment script? [y/N] " confirm
case "$confirm" in
  [yY]) chmod +x "$tmpdir/docker-deploy.sh"; "$tmpdir/docker-deploy.sh" ;;
  *) echo "Cancelled"; rm -rf "$tmpdir"; exit 1 ;;
esac
rm -rf "$tmpdir"
```

Script:

- скачивает `docker-compose.local.yml` **под именем `docker-compose.yml`**;
- скачивает `.env.example`, создаёт `.env`;
- генерирует `POSTGRES_PASSWORD`, `JWT_SECRET`, `TOTP_ENCRYPTION_KEY`;
- задаёт `.env` mode `0600`;
- создаёт `data/`, `postgres_data/`, `redis_data/`.

Так как итоговый файл называется `docker-compose.yml`, `-f` не нужен:

```bash
docker compose config --quiet
docker compose up -d
docker compose ps
docker compose logs -f sub2api
```

Если `ADMIN_PASSWORD` не задан, найдите одноразово сгенерированный password в initial logs и сохраните в защищённом месте.

## Docker: checkout репозитория

```bash
git clone https://github.com/YLeon2007/sub2api.git
cd sub2api/deploy
cp .env.example .env
chmod 600 .env
```

Заменяйте строки secrets, не добавляйте duplicate values:

```bash
POSTGRES_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
TOTP_ENCRYPTION_KEY=$(openssl rand -hex 32)

sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$POSTGRES_PASSWORD/" .env
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
sed -i "s/^TOTP_ENCRYPTION_KEY=.*/TOTP_ENCRYPTION_KEY=$TOTP_ENCRYPTION_KEY/" .env
```

Local bind-mounted variant:

```bash
mkdir -p data postgres_data redis_data
docker compose -f docker-compose.local.yml config --quiet
docker compose -f docker-compose.local.yml up -d
```

Никогда не коммитьте `.env`, generated secrets, database data или OAuth credentials.

## Варианты хранения

| Файл | Хранилище | Особенности |
|---|---|---|
| `docker-compose.local.yml` | `./data`, `./postgres_data`, `./redis_data` | Удобный transfer; для consistency остановите стек или используйте DB-aware backup |
| `docker-compose.yml` | Named volumes | Содержит `/app` runtime volume для web-updated binary |
| `docker-compose.standalone.yml` | App data/runtime | Нужны внешние `DATABASE_HOST`, `DATABASE_PASSWORD`, `REDIS_HOST` и связанные split variables |

Image tag остаётся reproducible source of truth. После web UI update синхронизируйте Compose pin с соответствующим immutable RU release до recreate контейнера.

## Первый запуск и migrations

При `AUTO_SETUP=true` приложение подключается к PostgreSQL/Redis, применяет forward-only migrations, создаёт initial admin и записывает config в data directory.

`schema_migrations` хранит filename/checksum. Автоматического down migration нет. До version change:

1. прочитайте release notes/migration delta;
2. создайте и проверьте свежий PostgreSQL backup;
3. сохраните предыдущие Compose/env и выполните `docker compose config`;
4. заранее скачайте новый immutable image;
5. подготовьте rollback/restore.

## Безопасное immutable-обновление

Используйте только опубликованный tag из [Releases форка](https://github.com/YLeon2007/sub2api/releases).

1. Измените `image:`:

   ```yaml
   image: ghcr.io/yleon2007/sub2api:<NEW_RU_VERSION>
   ```

2. Проверьте и пересоздайте только app:

   ```bash
   docker compose config --quiet
   docker compose pull sub2api
   docker compose up -d --no-deps --force-recreate sub2api
   docker compose ps
   docker compose logs --tail=200 sub2api
   ```

Обычный `pull` не сделает immutable pin новее. Не пересоздавайте PostgreSQL/Redis при app-only upgrade, если release notes этого не требуют.

## Backup и перенос

Stopped filesystem archive прост, но вызывает downtime. Для production/крупной БД используйте PostgreSQL-aware backup и проверенный restore.

```bash
umask 077
cd /path/to/deployment
docker compose down
cd ..
tar --exclude='.env' -czf sub2api-data.tar.gz deployment/
chmod 600 sub2api-data.tar.gz
```

Restrictive umask и явный mode защищают архив. `.env` передавайте отдельно по защищённому каналу с mode `0600`. Filesystem copy не заменяет проверенный `pg_dump`/restore, когда важна consistency.

`docker compose down -v` и удаление `postgres_data/` уничтожают данные и не являются routine maintenance.

## Обычные операции

```bash
docker compose ps
docker compose logs --tail=200 -f sub2api
docker compose restart sub2api
docker compose exec postgres pg_isready
docker compose exec redis redis-cli ping
```

Для явно выбранного файла последовательно добавляйте `-f docker-compose.local.yml` или `-f docker-compose.standalone.yml` ко всем командам.

## Основные environment variables

| Variable | Требование | Назначение |
|---|---|---|
| `POSTGRES_PASSWORD` | Нужен bundled PostgreSQL | DB password |
| `JWT_SECRET` | Обязателен для стабильных sessions | JWT signing |
| `TOTP_ENCRYPTION_KEY` | Обязателен при 2FA | Шифрование TOTP |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Optional initial admin | Password генерируется при отсутствии |
| `BIND_HOST` | Optional, default `0.0.0.0` | Bind address приложения |
| `SERVER_PORT` | Optional, default `8080` | Host-published port; внутри container приложение слушает `8080` |
| `TZ` | Optional | Timezone |
| `UPDATE_GITHUB_TOKEN` | Optional | Только GitHub API release checks |

Полный version-specific список — в `.env.example` и `config.example.yaml`.

## Apple `container`

Apple silicon, macOS 26, `container` 1.1.0+:

```bash
./apple-container.sh init
./apple-container.sh up
./apple-container.sh status
./apple-container.sh logs app -f
```

Named volumes сохраняют данные. Continuous restart supervisor отсутствует; после reboot снова выполните `up`. Это local path, для сервера рекомендуется Docker Compose. См. [APPLE_CONTAINER.md](APPLE_CONTAINER.md).
Apple helper принимает `SERVER_PORT` только в непривилегированном диапазоне `1025-65535`.

## Binary + systemd

```bash
umask 077
tmpdir="$(mktemp -d)"
curl -fsSLo "$tmpdir/install.sh" \
  https://raw.githubusercontent.com/YLeon2007/sub2api/v0.1.179-ru.1/deploy/install.sh
less "$tmpdir/install.sh"
read -r -p "Run the inspected installer? [y/N] " confirm
case "$confirm" in
  [yY]) sudo bash "$tmpdir/install.sh" ;;
  *) echo "Cancelled"; rm -rf "$tmpdir"; exit 1 ;;
esac
rm -rf "$tmpdir"
```

Installer поддерживает `upgrade` и `uninstall`; releases берутся из [YLeon2007/sub2api](https://github.com/YLeon2007/sub2api/releases).

```bash
sudo systemctl status sub2api
sudo journalctl -u sub2api -f
sudo systemctl restart sub2api
```

Setup wizard создаёт `/etc/sub2api/config.yaml`, binary/data находятся в `/opt/sub2api/`. PostgreSQL, Redis и systemd управляются отдельно.

## Gemini OAuth

Code Assist использует публичный built-in Gemini CLI client flow. AI Studio OAuth требует admin-supplied credentials через environment/systemd. Не коммитьте client secret и не выводите его в logs.

Правила Google consent/testing/verification меняются; следуйте текущей документации и callback из Admin UI. Access/refresh tokens могут истекать/отзываться даже в production consent mode.

## datamanagementd

Приложение проверяет `/tmp/sub2api-datamanagement.sock`. Docker должен смонтировать host socket по тому же пути. Следуйте `DATAMANAGEMENTD_CN.md` и проверьте privileges daemon.

## Диагностика

```bash
docker compose config
docker compose ps
docker compose logs --tail=200 sub2api
sudo systemctl status sub2api
sudo journalctl -u sub2api -n 100
```

Типичные причины: занятый port, missing/invalid `.env`, DB/Redis credentials, ownership volumes, недоступный image или migration error. Не обходите checksum failure правкой `schema_migrations`: восстановите точный migration file или используйте проверенный recovery plan.

Reverse proxy/TLS/trusted proxy/WAF — в `EDGE_SECURITY.md`. TLS fingerprint profiles — в `config.example.yaml`; перед включением проверьте текущую upstream policy.
