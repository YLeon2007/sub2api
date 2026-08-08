# Sub2API deployment files

English | [Русский](README_RU.md)

This directory contains Linux Docker/systemd deployment assets and an Apple-silicon local stack.

## Choose a method

| Method | Use case | Setup |
|---|---|---|
| Docker Compose | Recommended server deployment | `AUTO_SETUP=true` by default |
| Apple `container` | Local macOS 26+ on Apple silicon | Automated stack, no restart supervisor |
| Binary + systemd | Administrators who manage PostgreSQL/Redis separately | Web setup wizard |

## Important files

| File | Purpose |
|---|---|
| `docker-compose.yml` | Named Docker volumes, including persistent `/app` runtime volume |
| `docker-compose.local.yml` | Bind-mounted local data directories for portable backups |
| `docker-compose.standalone.yml` | Application-only deployment for external PostgreSQL/Redis |
| `docker-deploy.sh` | Prepares a local-directory Compose deployment |
| `.env.example` | Environment template |
| `DOCKER.md` | Container/GHCR details |
| `apple-container.sh`, `APPLE_CONTAINER.md` | Apple `container` lifecycle and guide |
| `install.sh`, `sub2api.service` | Binary/systemd installation |
| `install-datamanagementd.sh` and related service/docs | Optional host data-management daemon |
| `config.example.yaml` | Full configuration reference |
| `EDGE_SECURITY.md` | Reverse proxy/CDN/WAF and trusted-proxy hardening |

All fork deployment defaults use the immutable image `ghcr.io/yleon2007/sub2api:0.1.172-ru.1`. Future releases must update the image tag deliberately; do not switch production to a mutable third-party `latest` tag.

## Docker: preparation script

For security, download and inspect the script before execution:

```bash
mkdir -p sub2api-deploy && cd sub2api-deploy
umask 077
tmpdir="$(mktemp -d)"
curl -fsSLo "$tmpdir/docker-deploy.sh" \
  https://raw.githubusercontent.com/YLeon2007/sub2api/v0.1.172-ru.1/deploy/docker-deploy.sh
less "$tmpdir/docker-deploy.sh"
read -r -p "Run the inspected deployment script? [y/N] " confirm
case "$confirm" in
  [yY]) chmod +x "$tmpdir/docker-deploy.sh"; "$tmpdir/docker-deploy.sh" ;;
  *) echo "Cancelled"; rm -rf "$tmpdir"; exit 1 ;;
esac
rm -rf "$tmpdir"
```

The script:

- downloads `docker-compose.local.yml` **as `docker-compose.yml`**;
- downloads `.env.example` and creates `.env`;
- generates `POSTGRES_PASSWORD`, `JWT_SECRET`, and `TOTP_ENCRYPTION_KEY`;
- sets `.env` mode to `0600`;
- creates `data/`, `postgres_data/`, and `redis_data/`.

Start the generated deployment without `-f` because the saved filename is `docker-compose.yml`:

```bash
docker compose config --quiet
docker compose up -d
docker compose ps
docker compose logs -f sub2api
```

If `ADMIN_PASSWORD` was not configured, find the one-time generated password in the initial application logs and store it securely.

## Docker: repository checkout

```bash
git clone https://github.com/YLeon2007/sub2api.git
cd sub2api/deploy
cp .env.example .env
chmod 600 .env
```

Edit `.env` and replace, rather than append duplicate entries:

```bash
POSTGRES_PASSWORD=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
TOTP_ENCRYPTION_KEY=$(openssl rand -hex 32)

sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$POSTGRES_PASSWORD/" .env
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
sed -i "s/^TOTP_ENCRYPTION_KEY=.*/TOTP_ENCRYPTION_KEY=$TOTP_ENCRYPTION_KEY/" .env
```

For local bind-mounted data:

```bash
mkdir -p data postgres_data redis_data
docker compose -f docker-compose.local.yml config --quiet
docker compose -f docker-compose.local.yml up -d
```

Never commit `.env`, generated secrets, database data or OAuth credentials.

## Storage variants

| File | Storage | Notes |
|---|---|---|
| `docker-compose.local.yml` | `./data`, `./postgres_data`, `./redis_data` | Easy filesystem-level transfer; stop or use DB-aware backups for consistency |
| `docker-compose.yml` | Named volumes | Includes `/app` runtime persistence needed for web-updated binaries across restart |
| `docker-compose.standalone.yml` | App data/runtime only | Requires external `DATABASE_HOST`, `DATABASE_PASSWORD`, `REDIS_HOST` and related split variables |

The image tag remains the reproducible source of truth. If a binary was updated from the web UI, update the Compose image pin to the matching immutable RU release before recreating containers.

## First start and migrations

With `AUTO_SETUP=true`, the application connects to PostgreSQL/Redis, applies forward-only migrations, creates the initial admin when needed and writes configuration under the data directory.

Migrations are tracked by filename/checksum in `schema_migrations`. There is no automatic down migration. Before any version change:

1. read release notes and migration delta;
2. create and verify a fresh PostgreSQL backup;
3. render `docker compose config` and preserve the previous Compose/env files;
4. pre-pull the new immutable image;
5. define and test the rollback/restore path.

## Safe immutable upgrade

Replace `<NEW_RU_VERSION>` only with a published immutable tag from [fork Releases](https://github.com/YLeon2007/sub2api/releases), for example `0.1.172-ru.1`.

1. Update the `image:` field in the selected Compose file:

   ```yaml
   image: ghcr.io/yleon2007/sub2api:<NEW_RU_VERSION>
   ```

2. Validate, pull, and recreate the app:

   ```bash
   docker compose config --quiet
   docker compose pull sub2api
   docker compose up -d --no-deps --force-recreate sub2api
   docker compose ps
   docker compose logs --tail=200 sub2api
   ```

Do not run a blind `pull` expecting an immutable pin to become newer. Do not recreate PostgreSQL/Redis during an app-only upgrade unless release notes explicitly require it.

## Backups and transfer

A stopped filesystem archive is simple but causes downtime. For online/large production databases use a PostgreSQL-aware backup and verify restore.

Stopped local-directory archive:

```bash
umask 077
cd /path/to/deployment
docker compose down
cd ..
tar --exclude='.env' -czf sub2api-data.tar.gz deployment/
chmod 600 sub2api-data.tar.gz
```

The restrictive umask and explicit mode keep the archive private. The example excludes `.env`; transfer it separately over a protected channel and keep mode `0600`. A filesystem copy is not a substitute for a verified `pg_dump`/restore plan when consistency matters.

Destructive deletion commands are intentionally not presented as routine maintenance. `docker compose down -v` or removing `postgres_data/` destroys state.

## Common Docker operations

```bash
docker compose ps
docker compose logs --tail=200 -f sub2api
docker compose restart sub2api
docker compose exec postgres pg_isready
docker compose exec redis redis-cli ping
```

For an explicitly named file, add `-f docker-compose.local.yml` or `-f docker-compose.standalone.yml` consistently to every command.

## Key environment variables

| Variable | Requirement | Purpose |
|---|---|---|
| `POSTGRES_PASSWORD` | Required by bundled PostgreSQL | Database password |
| `JWT_SECRET` | Strongly required for stable sessions | JWT signing secret |
| `TOTP_ENCRYPTION_KEY` | Strongly required when 2FA is used | Encrypts TOTP secrets |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Optional initial admin values | Password is generated if omitted |
| `BIND_HOST` | Optional, default `0.0.0.0` | Application bind address |
| `SERVER_PORT` | Optional, default `8080` | Host-published port; the container listens on `8080` internally |
| `TZ` | Optional | Runtime timezone |
| `UPDATE_GITHUB_TOKEN` | Optional | GitHub API release checks only; asset downloads are anonymous |

See `.env.example` and `config.example.yaml` for the complete version-specific list.

## Apple `container`

On Apple silicon with macOS 26 and Apple `container` 1.1.0+:

```bash
./apple-container.sh init
./apple-container.sh up
./apple-container.sh status
./apple-container.sh logs app -f
```

Apple named volumes persist data. There is no continuous restart supervisor; run `up` after host reboot. This path is intended for local use; Docker Compose remains the recommended server deployment. See [APPLE_CONTAINER.md](APPLE_CONTAINER.md).
The Apple helper validates `SERVER_PORT` in the non-privileged range `1025-65535`.

## Binary + systemd

```bash
umask 077
tmpdir="$(mktemp -d)"
curl -fsSLo "$tmpdir/install.sh" \
  https://raw.githubusercontent.com/YLeon2007/sub2api/v0.1.172-ru.1/deploy/install.sh
less "$tmpdir/install.sh"
read -r -p "Run the inspected installer? [y/N] " confirm
case "$confirm" in
  [yY]) sudo bash "$tmpdir/install.sh" ;;
  *) echo "Cancelled"; rm -rf "$tmpdir"; exit 1 ;;
esac
rm -rf "$tmpdir"
```

The installer supports `upgrade` and `uninstall` subcommands. Releases come from [YLeon2007/sub2api](https://github.com/YLeon2007/sub2api/releases).

Service operations:

```bash
sudo systemctl status sub2api
sudo journalctl -u sub2api -f
sudo systemctl restart sub2api
```

The setup wizard creates `/etc/sub2api/config.yaml`; the binary and runtime data are under `/opt/sub2api/`. A binary deployment requires separately managed PostgreSQL, Redis and systemd.

## Gemini OAuth

Code Assist uses the built-in public Gemini CLI client flow. AI Studio OAuth requires administrator-supplied client credentials through environment/systemd configuration. Never commit a client secret or paste it into public logs.

OAuth consent-screen/testing/verification rules are controlled by Google and can change. Follow the current Google Cloud Console documentation and configure the callback shown by the Admin UI. Access/refresh tokens can expire or be revoked even in production consent mode.

## Optional data-management daemon

The application probes `/tmp/sub2api-datamanagement.sock`. A Docker deployment must explicitly mount the host socket at the same path. Follow `DATAMANAGEMENTD_CN.md` and review the daemon privileges before enabling it.

## Troubleshooting

```bash
# Rendered configuration
docker compose config

# Health/logs
docker compose ps
docker compose logs --tail=200 sub2api

# Binary service
sudo systemctl status sub2api
sudo journalctl -u sub2api -n 100
```

Typical failures: occupied port, invalid/missing `.env`, database/Redis credentials, volume ownership, unavailable image, or a migration error. Do not bypass checksum/migration failures by editing `schema_migrations`; restore the exact migration file or follow a reviewed recovery plan.

Reverse-proxy, TLS, trusted-proxy and WAF guidance is in `EDGE_SECURITY.md`. TLS fingerprint profiles are configured in `config.example.yaml`; verify current upstream policy before enabling impersonation profiles.
