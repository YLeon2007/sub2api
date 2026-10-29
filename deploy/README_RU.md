# Файлы развёртывания Sub2API

[English](README.md) | Русский

Каталог содержит файлы развёртывания Docker/systemd для Linux и локальный стек для Apple silicon.

## Выбор способа

| Способ | Сценарий | Первоначальная настройка |
|---|---|---|
| Docker Compose | Рекомендуемый серверный вариант | `AUTO_SETUP=true` по умолчанию |
| Apple `container` | Локальный macOS 26+ на Apple silicon | Автоматическая настройка; перезапуск процесса внутри контейнера, но не всего стека |
| Исполняемый файл + systemd | PostgreSQL/Redis управляются отдельно | Веб-мастер первоначальной настройки |

## Основные файлы

| Файл | Назначение |
|---|---|
| `docker-compose.yml` | Именованные тома, включая постоянный том среды выполнения `/app` |
| `docker-compose.local.yml` | Локальные каталоги данных, подключённые к контейнерам |
| `docker-compose.standalone.yml` | Только приложение для внешних PostgreSQL/Redis |
| `docker-deploy.sh` | Подготовка развёртывания с локальными каталогами |
| `.env.example` | Шаблон переменных окружения |
| `DOCKER.md` | Руководство по контейнерам и GHCR |
| `apple-container.sh`, `APPLE_CONTAINER.md` | Управление жизненным циклом Apple `container` и руководство |
| `install.sh`, `sub2api.service` | Установка исполняемого файла и служба systemd |
| `install-datamanagementd.sh` и файлы службы/документации | Необязательная служба управления данными на хосте |
| `config.example.yaml` | Полный справочник настроек |
| `EDGE_SECURITY.md` | Защита обратного прокси, CDN, WAF и настройка доверенных прокси |

По умолчанию форк использует неизменяемый образ `ghcr.io/yleon2007/sub2api:0.2.19-ru.1`. Для нового релиза явно измените тег; не переводите рабочую установку на чужой изменяемый `latest`.

## Docker: скрипт подготовки

Скачайте и проверьте скрипт до запуска:

```bash
mkdir -p sub2api-deploy && cd sub2api-deploy
umask 077
tmpdir="$(mktemp -d)"
curl -fsSLo "$tmpdir/docker-deploy.sh" \
  https://raw.githubusercontent.com/YLeon2007/sub2api/v0.2.19-ru.1/deploy/docker-deploy.sh
less "$tmpdir/docker-deploy.sh"
read -r -p "Run the inspected deployment script? [y/N] " confirm
case "$confirm" in
  [yY]) chmod +x "$tmpdir/docker-deploy.sh"; "$tmpdir/docker-deploy.sh" ;;
  *) echo "Cancelled"; rm -rf "$tmpdir"; exit 1 ;;
esac
rm -rf "$tmpdir"
```

Скрипт:

- скачивает `docker-compose.local.yml` **под именем `docker-compose.yml`**;
- скачивает `.env.example`, создаёт `.env`;
- генерирует `POSTGRES_PASSWORD`, `JWT_SECRET`, `TOTP_ENCRYPTION_KEY`;
- задаёт `.env` права доступа `0600`;
- создаёт `data/`, `postgres_data/`, `redis_data/`.

Так как итоговый файл называется `docker-compose.yml`, `-f` не нужен:

```bash
docker compose config --quiet
docker compose up -d
docker compose ps
docker compose logs -f sub2api
```

Если `ADMIN_EMAIL` / `ADMIN_PASSWORD` не заданы, установщик заранее генерирует адрес электронной почты администратора (логин), записывает его в `.env` и выводит при установке; пароль приложение генерирует при первом запуске и печатает в логах. Сохраните оба значения в защищённом месте:

```bash
docker compose logs sub2api | grep "Generated admin"
```

Явно заданный `ADMIN_PASSWORD` должен быть длиной 8–72 байта, а `ADMIN_EMAIL` — корректным адресом электронной почты для входа; иначе автоматическая установка завершится ошибкой. На существующие установки это не влияет.

## Docker: копия репозитория

```bash
git clone https://github.com/YLeon2007/sub2api.git
cd sub2api/deploy
cp .env.example .env
chmod 600 .env
```

Заменяйте значения секретов в существующих строках, не добавляйте дублирующие записи:

```bash
POSTGRES_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
TOTP_ENCRYPTION_KEY=$(openssl rand -hex 32)

sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$POSTGRES_PASSWORD/" .env
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
sed -i "s/^TOTP_ENCRYPTION_KEY=.*/TOTP_ENCRYPTION_KEY=$TOTP_ENCRYPTION_KEY/" .env
```

Вариант с подключением локальных каталогов данных:

```bash
mkdir -p data postgres_data redis_data
docker compose -f docker-compose.local.yml config --quiet
docker compose -f docker-compose.local.yml up -d
```

Никогда не коммитьте `.env`, сгенерированные секреты, данные базы или учётные данные OAuth.

## Варианты хранения

| Файл | Хранилище | Особенности |
|---|---|---|
| `docker-compose.local.yml` | `./data`, `./postgres_data`, `./redis_data` | Удобен для переноса; для согласованности данных остановите стек или используйте резервное копирование с учётом работы БД |
| `docker-compose.yml` | Именованные тома | Содержит том среды выполнения `/app` для исполняемого файла, обновлённого через веб-интерфейс |
| `docker-compose.standalone.yml` | Только данные `/app/data`, без тома среды выполнения в `/app` | Нужны внешние `DATABASE_HOST`, `DATABASE_PASSWORD`, `REDIS_HOST` и связанные отдельные переменные |

Тег образа остаётся воспроизводимым источником версии. После обновления через веб-интерфейс закрепите в Compose соответствующий неизменяемый русский релиз до пересоздания контейнера.

## Первый запуск и миграции

При `AUTO_SETUP=true` приложение подключается к PostgreSQL/Redis, применяет миграции только вперёд, создаёт первого администратора и записывает конфигурацию в каталог данных.

### Запуск и восстановление базы данных

Во время запуска Sub2API применяет миграции базы данных. После перезапуска хоста или службы Docker PostgreSQL может некоторое время оставаться в режиме восстановления или запуска. Приложение повторяет временно неудачные подключения и ошибки запуска PostgreSQL с ограниченной экспоненциальной задержкой, а затем автоматически продолжает запуск, когда база данных становится доступна. Ошибки аутентификации, несовпадения контрольных сумм миграций, ошибки SQL и другие постоянные проблемы конфигурации или данных приводят к немедленному завершению.

В примерах Compose готовность PostgreSQL проверяется и через `pg_isready`, и простым SQL-запросом. `depends_on: condition: service_healthy` задаёт порядок зависимостей при новом запуске Compose, но не заменяет повторы на уровне приложения, когда Docker восстанавливает уже существующие контейнеры после перезапуска хоста.

Для systemd сохраняйте `Restart=always` и `RestartSec` в `sub2api.service`: повторы приложения покрывают временный запуск базы данных, а systemd продолжает контролировать и перезапускать завершающийся процесс. В Kubernetes проверяйте готовность PostgreSQL и сохраняйте механизм повторов запуска Sub2API; проверку жизнеспособности приложения настраивайте отдельно, чтобы период восстановления базы данных не считался постоянным отказом процесса.

`schema_migrations` хранит имена файлов и контрольные суммы. Автоматического отката миграций нет. Перед сменой версии:

1. прочитайте примечания к релизу и изменения миграций;
2. создайте и проверьте свежую резервную копию PostgreSQL;
3. сохраните предыдущие файлы Compose и переменных окружения, выполните `docker compose config`;
4. заранее скачайте новый неизменяемый образ;
5. подготовьте откат и восстановление.

## Безопасное обновление на неизменяемую версию

Используйте только опубликованный тег из [релизов форка](https://github.com/YLeon2007/sub2api/releases).

1. Измените `image:`:

   ```yaml
   image: ghcr.io/yleon2007/sub2api:<NEW_RU_VERSION>
   ```

2. Из каталога установки выберите фактически используемый файл Compose, проверьте конфигурацию и посмотрите монтирование `/app` у **существующего** контейнера (скрипт подготовки сохраняет локальный вариант под именем `docker-compose.yml`):

   ```bash
   export COMPOSE_FILE=docker-compose.yml
   docker compose config --quiet
   docker compose pull sub2api
   docker inspect sub2api --format '{{range .Mounts}}{{if eq .Destination "/app"}}{{.Type}} {{.Name}}{{end}}{{end}}'
   ```

   Вместо этого задайте `COMPOSE_FILE=docker-compose.local.yml` или `COMPOSE_FILE=docker-compose.standalone.yml`, если развёрнута установка с таким именем файла. Сохраняйте этот выбор для всех команд, включая вспомогательный скрипт ниже.

3. **Именованный том в `/app`: перед завершением обновления синхронизируйте исполняемый файл.** Стандартный `docker-compose.yml` использует том `sub2api_runtime`, перекрывающий `/app` нового образа. Вариант с локальными каталогами и стандартный автономный вариант не монтируют том среды выполнения в `/app`. Простые загрузка образа и пересоздание контейнера сохраняют старый бинарник; скрипт запуска его не заменяет. Не удаляйте том ради обновления.

   Скачайте вспомогательный скрипт из неизменяемого релиза, изучите его и явно подтвердите запуск:

   ```bash
   umask 077
   tmpdir="$(mktemp -d)"
   curl -fsSLo "$tmpdir/sync-runtime-from-image.sh" \
     https://raw.githubusercontent.com/YLeon2007/sub2api/v0.2.19-ru.1/deploy/sync-runtime-from-image.sh
   less "$tmpdir/sync-runtime-from-image.sh"
   read -r -p "Запустить проверенный скрипт синхронизации? [y/N] " confirm
   case "$confirm" in
     [yY]) bash "$tmpdir/sync-runtime-from-image.sh" "" "$PWD" ;;
     *) echo "Отменено"; rm -rf "$tmpdir"; exit 1 ;;
   esac
   rm -rf "$tmpdir"
   ```

   Пустой первый аргумент означает выбор образа из итоговой конфигурации Compose. Скрипт подготавливает бинарник из этого образа, останавливает и запускает только приложение, сравнивает SHA-256 установленного файла и при успехе выводит `RUNTIME_IMAGE_SYNC_PASS`. Он сохраняет предыдущий бинарник для отката и при ошибке пытается восстановить его; это **не** откат миграций базы данных. Ошибка скрипта означает неуспешное обновление, а не разрешение продолжать вслепую.

4. **Монтирования в `/app` нет** (вариант с локальными каталогами и стандартный автономный вариант): бинарник берётся непосредственно из образа, поэтому вместо скрипта синхронизации тома пересоздайте только приложение:

   ```bash
   docker compose up -d --no-deps --force-recreate sub2api
   ```

   Если обнаружено нестандартное монтирование каталога хоста в `/app`, остановитесь и подготовьте отдельный порядок обновления: ни один из двух стандартных вариантов не подходит.

5. В обоих поддерживаемых вариантах проверьте фактическую установленную версию и коммит по метаданным опубликованного релиза, а не только тег образа контейнера:

   ```bash
   docker exec sub2api /app/sub2api --version
   docker compose ps
   docker compose logs --tail=200 sub2api
   ```

Обычный `pull` не изменит закреплённую неизменяемую версию. Не пересоздавайте PostgreSQL/Redis при обновлении только приложения, если примечания к релизу этого не требуют.

## Резервное копирование и перенос

Архивирование файлов после остановки стека просто, но вызывает простой. Для рабочей установки или крупной БД используйте резервное копирование с учётом работы PostgreSQL и проверенное восстановление.

```bash
umask 077
cd /path/to/deployment
docker compose down
cd ..
tar --exclude='.env' -czf sub2api-data.tar.gz deployment/
chmod 600 sub2api-data.tar.gz
```

Ограничительная маска `umask` и явно заданные права защищают архив. `.env` передавайте отдельно по защищённому каналу с правами `0600`. Копирование файловой системы не заменяет проверенные `pg_dump` и восстановление, когда важна согласованность данных.

`docker compose down -v` и удаление `postgres_data/` уничтожают данные и не относятся к обычному обслуживанию.

## Обычные операции

```bash
docker compose ps
docker compose logs --tail=200 -f sub2api
docker compose restart sub2api
docker compose exec postgres pg_isready
docker compose exec redis redis-cli ping
```

Для явно выбранного файла последовательно добавляйте `-f docker-compose.local.yml` или `-f docker-compose.standalone.yml` ко всем командам.

## Основные переменные окружения

| Переменная | Требование | Назначение |
|---|---|---|
| `POSTGRES_PASSWORD` | Нужен встроенному PostgreSQL | Пароль базы данных |
| `JWT_SECRET` | Обязателен для стабильных сессий | Подпись JWT |
| `TOTP_ENCRYPTION_KEY` | Обязателен при 2FA | Шифрование TOTP |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Необязательные начальные данные администратора | При отсутствии адрес генерируется скриптом подготовки или приложением, пароль — приложением; заданный пароль — 8–72 байта |
| `BIND_HOST` | Необязательно, по умолчанию `0.0.0.0` | Адрес прослушивания приложения |
| `SERVER_PORT` | Необязательно, по умолчанию `8080` | Публикуемый на хосте порт; внутри контейнера приложение слушает `8080` |
| `TZ` | Необязательно | Часовой пояс |
| `UPDATE_GITHUB_TOKEN` | Необязательно | Только проверки релизов через GitHub API; загрузка файлов релиза анонимна |
| `GATEWAY_OPENAI_COMPACT_MODEL` | Необязательно, по умолчанию `gpt-5.5` | Модель вышестоящего провайдера для OpenAI `/responses/compact`; более старую поддерживаемую модель задавайте только если операция сжатия контекста этого требует |

Полный список для конкретной версии — в `.env.example` и `config.example.yaml`.

## Apple `container`

Apple silicon, macOS 26, `container` 1.1.0+:

```bash
./apple-container.sh init
./apple-container.sh up
./apple-container.sh status
./apple-container.sh logs app -f
```

Именованные тома сохраняют данные. Контролирующий процесс внутри контейнера позволяет веб-интерфейсу перезапустить активный исполняемый файл после обновления, но не запускает остановленные контейнеры или весь стек после перезагрузки; в этом случае снова выполните `up`. Это локальный вариант, для сервера рекомендуется Docker Compose. См. [APPLE_CONTAINER_RU.md](APPLE_CONTAINER_RU.md) ([English](APPLE_CONTAINER.md)).
Скрипт Apple принимает `SERVER_PORT` только в непривилегированном диапазоне `1025-65535`.

## Исполняемый файл + systemd

```bash
umask 077
tmpdir="$(mktemp -d)"
curl -fsSLo "$tmpdir/install.sh" \
  https://raw.githubusercontent.com/YLeon2007/sub2api/v0.2.19-ru.1/deploy/install.sh
less "$tmpdir/install.sh"
read -r -p "Run the inspected installer? [y/N] " confirm
case "$confirm" in
  [yY]) sudo bash "$tmpdir/install.sh" ;;
  *) echo "Cancelled"; rm -rf "$tmpdir"; exit 1 ;;
esac
rm -rf "$tmpdir"
```

Установщик поддерживает `upgrade` и `uninstall`; релизы берутся из [YLeon2007/sub2api](https://github.com/YLeon2007/sub2api/releases).

```bash
sudo systemctl status sub2api
sudo journalctl -u sub2api -f
sudo systemctl restart sub2api
```

Мастер настройки создаёт `/etc/sub2api/config.yaml`, исполняемый файл и данные находятся в `/opt/sub2api/`. PostgreSQL, Redis и systemd управляются отдельно.

## Gemini OAuth

Code Assist использует встроенную общедоступную процедуру авторизации клиента Gemini CLI. Для AI Studio OAuth администратор должен предоставить учётные данные через переменные окружения или systemd. Не коммитьте секрет клиента и не выводите его в логи.

Правила Google для экрана согласия, тестирования и проверки приложения меняются; следуйте текущей документации и адресу обратного вызова из панели администратора. Токены доступа и обновления могут истекать или отзываться даже при рабочем режиме экрана согласия.

## datamanagementd

Приложение проверяет `/tmp/sub2api-datamanagement.sock`. Docker должен подключить сокет хоста по тому же пути. Следуйте `DATAMANAGEMENTD_CN.md` и проверьте привилегии службы.

## Диагностика

```bash
docker compose config
docker compose ps
docker compose logs --tail=200 sub2api
sudo systemctl status sub2api
sudo journalctl -u sub2api -n 100
```

Типичные причины: занятый порт, отсутствующий или некорректный `.env`, неверные учётные данные БД/Redis, права владельца томов, недоступный образ или ошибка миграции. Не обходите ошибку контрольной суммы правкой `schema_migrations`: восстановите точный файл миграции или используйте проверенный план восстановления.

Обратный прокси, TLS, доверенные прокси и WAF описаны в `EDGE_SECURITY.md`. Профили отпечатков TLS — в `config.example.yaml`; перед включением проверьте текущую политику вышестоящего сервиса.
