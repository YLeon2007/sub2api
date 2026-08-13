# Sub2API Docker image

Sub2API is an AI API gateway for distributing and managing AI product subscription/API quotas.

Fork releases use immutable images such as:

```text
ghcr.io/yleon2007/sub2api:0.1.175-ru.2
```

Floating `latest`, `main`, or `dev` tags are intentionally not deployment targets. Pin an explicit release tag or digest.

## Recommended quick start

Use the reviewed Compose files rather than constructing an incomplete `docker run` command:

```bash
git clone https://github.com/YLeon2007/sub2api.git
cd sub2api/deploy
cp .env.example .env
chmod 600 .env
# Edit .env with a local editor and replace every required/placeholder secret.

docker compose -f docker-compose.local.yml config --quiet
docker compose -f docker-compose.local.yml up -d
docker compose -f docker-compose.local.yml ps
```

Before startup, replace all required/placeholder secrets in `.env`. Never commit `.env`.

Compose variants:

| File | Use case |
|---|---|
| `docker-compose.yml` | Bundled PostgreSQL/Redis with named volumes and persistent `/app` runtime |
| `docker-compose.local.yml` | Bundled PostgreSQL/Redis with bind-mounted local data directories |
| `docker-compose.standalone.yml` | Application only; PostgreSQL and Redis are external |

See [`README.md`](README.md) for backup, upgrade, rollback and inspect-before-run instructions.

## External PostgreSQL and Redis

`docker-compose.standalone.yml` uses split configuration variables, not `DATABASE_URL` or `REDIS_URL`.

After copying `.env.example`, explicitly add and review at least:

```dotenv
DATABASE_HOST=replace-with-postgresql-host
DATABASE_PORT=5432
DATABASE_USER=sub2api
DATABASE_PASSWORD=replace-with-database-password
DATABASE_DBNAME=sub2api
DATABASE_SSLMODE=require

REDIS_HOST=replace-with-redis-host
REDIS_PORT=6379
REDIS_USERNAME=
REDIS_PASSWORD=
REDIS_DB=0
REDIS_ENABLE_TLS=true

JWT_SECRET=replace-with-random-secret
TOTP_ENCRYPTION_KEY=replace-with-random-secret
```

Choose `DATABASE_SSLMODE` and `REDIS_ENABLE_TLS` according to the actual trusted network and server certificates; do not copy the example blindly.

Validate before creating a container:

```bash
docker compose --env-file .env -f docker-compose.standalone.yml config --quiet
docker compose --env-file .env -f docker-compose.standalone.yml up -d
docker compose --env-file .env -f docker-compose.standalone.yml logs -f sub2api
```

## Key environment variables

| Variable | Meaning | Required/default |
|---|---|---|
| `DATABASE_HOST` | PostgreSQL host | Required for standalone |
| `DATABASE_PORT` | PostgreSQL port | `5432` |
| `DATABASE_USER` | PostgreSQL user | `sub2api` |
| `DATABASE_PASSWORD` | PostgreSQL password | Required for standalone |
| `DATABASE_DBNAME` | PostgreSQL database | `sub2api` |
| `DATABASE_SSLMODE` | PostgreSQL TLS mode | Compose default `disable`; review for production |
| `REDIS_HOST` | Redis host | Required for standalone |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_USERNAME`, `REDIS_PASSWORD` | Redis ACL credentials | Empty by default |
| `REDIS_DB` | Redis database | `0` |
| `REDIS_ENABLE_TLS` | Redis TLS switch | `false`; review for production |
| `SERVER_MODE` | Server mode (`debug`/`release`) | `release` |
| `BIND_HOST` | Host interface used for published port | `0.0.0.0` |
| `SERVER_PORT` | Host-published port in Compose | `8080`; container listens on `8080` |
| `JWT_SECRET` | JWT signing secret | Generate and persist |
| `TOTP_ENCRYPTION_KEY` | Encrypts TOTP material | Generate and persist when 2FA is used |

The complete version-specific list is in `.env.example`, `config.example.yaml`, and the selected Compose file.

## Supported architectures

- `linux/amd64`
- `linux/arm64`

## Image tags

- `0.1.175-ru.2` — current immutable Russian release;
- `x.y.z-ru.n` — immutable Russian release format.

## Links

- [Fork repository](https://github.com/YLeon2007/sub2api)
- [Container package](https://github.com/YLeon2007/sub2api/pkgs/container/sub2api)
- [Fork releases](https://github.com/YLeon2007/sub2api/releases)
