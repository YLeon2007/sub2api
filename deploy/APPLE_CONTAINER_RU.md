# Развёртывание с Apple container

[English](APPLE_CONTAINER.md) | Русский

Sub2API можно запустить как нативный стек из трёх сервисов с помощью Apple `container` CLI. Этот сценарий запускает опубликованные OCI-образы Sub2API, PostgreSQL и Redis без Docker Desktop или Docker-совместимого daemon (фонового процесса).

## Уровень поддержки

Поддержка Apple `container` предназначена для локальной разработки и управляемых оператором развёртываний на Mac. Для production (рабочей среды) по-прежнему рекомендуется Docker Compose.

Apple `container` 1.1 не предоставляет restart policies (политики перезапуска), автоматический запуск, планирование health checks (проверок работоспособности), Docker API socket или полную Compose-оркестрацию. Скрипт `apple-container.sh` выполняет упорядоченный запуск и проверки готовности при вызове, но не является постоянно работающим supervisor (диспетчером процессов).

## Требования

- Mac с Apple silicon;
- macOS 26 или новее;
- Apple `container` 1.1.0 или новее;
- `openssl` для создания начальных секретов;
- разрешение Local Network для `container-runtime-linux`, когда macOS запросит его при первом запуске опубликованного контейнера.

Установите Apple `container` из [официальных релизов](https://github.com/apple/container/releases), затем проверьте версию:

```bash
container --version
```

## Быстрый старт

```bash
git clone https://github.com/YLeon2007/sub2api.git
cd sub2api/deploy

# Создаёт .env со случайными секретами PostgreSQL, JWT и TOTP.
./apple-container.sh init

# Проверьте необязательные настройки перед запуском.
nano .env

# Создаёт volumes, сеть и контейнеры, ждёт зависимости и запускает Sub2API.
./apple-container.sh up

# Проверяет PostgreSQL, Redis и endpoint приложения.
./apple-container.sh status
```

Откройте `http://localhost:8080`. Если `ADMIN_PASSWORD` пуст, получите созданный пароль из логов:

```bash
./apple-container.sh logs app
```

Env-файл использует буквальный синтаксис `KEY=value`. Не применяйте Compose-выражения вроде `${VALUE:-default}` и не заключайте значения в кавычки, если сами кавычки не должны быть частью значения. `BIND_HOST` должен быть IPv4-адресом, а `SERVER_PORT` — числом от 1025 до 65535.

## Команды

```bash
# Запускает зависимости и пересоздаёт лёгкий app-контейнер с текущими IP-адресами.
./apple-container.sh up

# Дополнительно пересоздаёт контейнеры PostgreSQL и Redis, сохраняя их volumes.
./apple-container.sh up --recreate

# Останавливает контейнеры, сохраняя все ресурсы и данные.
./apple-container.sh down

# Перезапускает PostgreSQL, Redis и Sub2API в порядке зависимостей.
./apple-container.sh restart

# Показывает состояние ресурсов и выполняет live health probes.
./apple-container.sh status

# Показывает логи одного сервиса в реальном времени.
./apple-container.sh logs app -f
./apple-container.sh logs postgres -f
./apple-container.sh logs redis -f

# Загружает все настроенные образы для linux/arm64, затем пересоздаёт контейнеры.
./apple-container.sh pull
./apple-container.sh up --recreate

# Удаляет контейнеры и сеть, сохраняя named volumes.
./apple-container.sh destroy --yes

# Безвозвратно удаляет стек и все данные приложения, БД и кэша.
./apple-container.sh destroy --volumes --yes
```

`destroy --volumes` не удаляет `.env`, backup-файлы или загруженные образы. При выводе развёртывания из эксплуатации удалите credentials (учётные данные) и backups отдельно. Используйте `container image delete <image>` только после проверки, что этот образ не нужен другим Apple containers.

После перезагрузки хоста или `container system stop` снова выполните `./apple-container.sh up`. Apple `container` не перезапускает сохранённые контейнеры автоматически.

## Конфигурация

Скрипт использует `deploy/.env` — тот же исходный файл, что и Docker Compose. Чтобы все команды текущей shell-сессии использовали другой файл, экспортируйте `SUB2API_ENV_FILE`:

```bash
export SUB2API_ENV_FILE=/absolute/path/to/sub2api.env
./apple-container.sh init
./apple-container.sh up
```

Доступны отдельные переопределения образов для Apple:

```dotenv
APPLE_CONTAINER_SUB2API_IMAGE=ghcr.io/yleon2007/sub2api:0.2.4-ru.1
APPLE_CONTAINER_POSTGRES_IMAGE=postgres:18-alpine
APPLE_CONTAINER_REDIS_IMAGE=redis:8-alpine
```

По умолчанию Apple `container` сам выбирает частную IPv4-подсеть для управляемой сети. Задавайте `APPLE_CONTAINER_NETWORK_SUBNET` только тогда, когда host-side tooling (инструментам на хосте) нужен стабильный network gateway (сетевой шлюз):

```dotenv
APPLE_CONTAINER_NETWORK_SUBNET=
```

Оставьте значение пустым, чтобы сохранить автоматический выбор подсети. Если задаёте его, выберите CIDR, который не пересекается с LAN или VPN хоста. Скрипт применяет настройку только при создании сети `sub2api-apple`. Если существующая управляемая сеть использует другую подсеть, скрипт завершится с ошибкой, не удаляя ресурсы. Для намеренной миграции выполните `./apple-container.sh destroy --yes`: команда удалит управляемые контейнеры и сеть, но сохранит named volumes; после этого выполните `./apple-container.sh up`.

Обычная команда `up` пересоздаёт контейнер приложения, поэтому изменения environment приложения применяются сразу. Используйте `up --recreate` при изменении образов PostgreSQL или Redis либо runtime-конфигурации Redis. Постоянные данные остаются в named volumes.

`POSTGRES_USER`, `POSTGRES_PASSWORD` и `POSTGRES_DB` применяются только при инициализации PostgreSQL в пустом data volume. Изменение этих значений в `.env` и пересоздание контейнера не меняют существующую БД. Пароль следует менять через `ALTER ROLE`, а изменения пользователя или БД — проводить как явную миграцию. Чтобы намеренно создать новую пустую БД, сначала сохраните backup старой, затем используйте `destroy --volumes`.

Обработка общих настроек в сценарии Apple:

| Настройка | Поведение сценария Apple |
|---|---|
| Переменные приложения и gateway | Передаются Sub2API из `.env` |
| `BIND_HOST`, `SERVER_PORT` | Используются для опубликованного порта macOS |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Только первая инициализация PostgreSQL |
| `REDIS_PASSWORD` | Применяется к Redis и Sub2API |
| `DATABASE_PORT`, `REDIS_PORT` | Внутренние порты зафиксированы как 5432 и 6379 |
| `POSTGRES_MAX_*`, `REDIS_MAXCLIENTS` | Сейчас не применяются к серверу БД или кэша |

## Управляемые ресурсы

Скрипт создаёт только ресурсы с label (меткой) `org.sub2api.stack=apple-container`:

| Тип | Имена |
|---|---|
| Контейнеры | `sub2api-apple`, `sub2api-apple-postgres`, `sub2api-apple-redis` |
| Сеть | `sub2api-apple` |
| Volumes | `sub2api-apple-data`, `sub2api-apple-postgres-data`, `sub2api-apple-redis-data` |

PostgreSQL volume монтируется в `/var/lib/postgresql`, сохраняя стандартный дочерний data directory PostgreSQL 18. Sub2API и Redis также хранят данные в дочерних каталогах внутри точек монтирования Apple volumes. Это требуется потому, что Apple named volumes не поддерживают Docker-поведение copy-up и назначение владельца mount point.

## Сеть

Apple `container` 1.1 не поддерживает network-scoped service aliases из Compose. После запуска PostgreSQL и Redis скрипт считывает их текущие IPv4-адреса в частной сети через `container inspect`, передаёт эти адреса в новый контейнер приложения и затем запускает Sub2API. Скрипт не изменяет `~/.config/container/config.toml` или resolver (службу разрешения имён) macOS.

Все три сервиса подключены только к частной сети `sub2api-apple`. Host port публикует только приложение; порты БД и Redis наружу не публикуются.

Контейнер приложения намеренно пересоздаётся при каждой операции `up` и `restart`, потому что адреса VM зависимостей после остановки могут измениться. Данные приложения остаются в `sub2api-apple-data`.

Перед сообщением об успешном запуске скрипт проверяет опубликованный endpoint `/health` с macOS. При первом запуске разрешите доступ Local Network. Если внутренняя проверка проходит, но host-port probe завершается с connection reset, включите Local Network для `container-runtime-linux`, выполните `container system stop`, затем `container system start` и снова запустите `up`. После обновления runtime разрешение может потребоваться повторно.

## Backup и обновление

Перед использованием этого сценария с постоянными данными закрепите release tags или digests образов в `.env`. Перед обновлением образа приложения или БД создайте backups при исправном стеке:

```bash
umask 077
mkdir -p backups

# Логический backup PostgreSQL.
container exec sub2api-apple sh -c \
  'PGPASSWORD="$DATABASE_PASSWORD" pg_dump -h "$DATABASE_HOST" -U "$DATABASE_USER" "$DATABASE_DBNAME"' \
  > backups/sub2api.sql

# Конфигурация приложения и локальные файлы.
container exec sub2api-apple sh -c 'tar -C "$DATA_DIR" -czf - .' \
  > backups/sub2api-data.tar.gz

./apple-container.sh pull
./apple-container.sh up --recreate
./apple-container.sh status
```

Миграции БД выполняются только вперёд. Сохраняйте ссылку на предыдущий образ и оба backup-файла, пока обновлённый стек не будет проверен: один только rollback образа не отменяет применённую миграцию БД. Проверьте процедуру восстановления до того, как полагаться на этот сценарий для важных данных.

Чтобы восстановить эти backups в существующий стек, сначала убедитесь в совместимости версий образов, затем остановите запись и замените оба набора данных:

```bash
# Убедитесь, что пустые/текущие ресурсы существуют, затем остановите стек.
./apple-container.sh up
./apple-container.sh down

# Удалите только app-контейнер, чтобы helper мог смонтировать его named volume.
container delete sub2api-apple
SUB2API_IMAGE=ghcr.io/yleon2007/sub2api:0.2.4-ru.1 # Должен совпадать с APPLE_CONTAINER_SUB2API_IMAGE в .env.
container run --rm --name sub2api-apple-data-restore \
  --entrypoint /bin/sh \
  --volume sub2api-apple-data:/restore \
  --volume "$PWD/backups:/backup:ro" \
  "$SUB2API_IMAGE" \
  -c 'rm -rf /restore/data && mkdir -p /restore/data && tar -xzf /backup/sub2api-data.tar.gz -C /restore/data'

# Восстановите логическую БД, пока приложение отсутствует.
container start sub2api-apple-postgres
until container exec sub2api-apple-postgres sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; do sleep 1; done
container copy backups/sub2api.sql sub2api-apple-postgres:/tmp/sub2api.sql
container exec sub2api-apple-postgres sh -c '
  export PGPASSWORD="$POSTGRES_PASSWORD"
  dropdb -h 127.0.0.1 -U "$POSTGRES_USER" --if-exists --force "$POSTGRES_DB"
  createdb -h 127.0.0.1 -U "$POSTGRES_USER" "$POSTGRES_DB"
  psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -f /tmp/sub2api.sql
  rm /tmp/sub2api.sql
'

./apple-container.sh up
./apple-container.sh status
```

Для аварийного восстановления после удаления named volumes один раз выполните `up`, чтобы создать чистый стек, затем следуйте процедуре восстановления. Сначала отработайте восстановление на непроизводственных данных.

Чтобы обновить сам Apple runtime:

```bash
./apple-container.sh down
container system stop
# Установите/обновите Apple container до версии 1.1.0 или новее.
container system start
./apple-container.sh up
```

## Эксплуатационные ограничения

- Эквивалента `restart: unless-stopped` нет. После перезагрузки выполните `up` или добавьте собственный launchd supervisor.
- Health probes выполняются во время `up`, `restart` и `status`; Apple `container` не планирует их постоянно.
- Docker Compose, Testcontainers, Buildx и инструменты, которым нужен `/var/run/docker.sock`, не могут напрямую использовать этот runtime.
- Процедуры backup и восстановления named volumes необходимо проверить до использования сценария с важными данными.
- Скрипт рассчитан на нативные образы `linux/arm64`. Обычный релиз Sub2API публикует вариант arm64.
- Runtime environment values, включая credentials, сохраняются в конфигурации Apple container и видны пользователям, которые могут просматривать локальный runtime.
