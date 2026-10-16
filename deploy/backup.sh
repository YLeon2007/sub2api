#!/usr/bin/env bash
set -euo pipefail

umask 077

INSTALL_DIR="${INSTALL_DIR:-/opt/sub2api-ru}"
BACKUP_DIR="${BACKUP_DIR:-${INSTALL_DIR}/backups}"
mkdir -p "${BACKUP_DIR}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK_DIR="$(mktemp -d "${BACKUP_DIR}/.sub2api-${STAMP}.XXXXXX")"
ARCHIVE="${BACKUP_DIR}/sub2api-${STAMP}.tar.gz"

cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

cd "${INSTALL_DIR}"
mkdir -p "${BACKUP_DIR}"

# Read PostgreSQL credentials inside the container so secrets never appear in
# process arguments or backup logs.
docker compose exec -T postgres sh -ec \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "${WORK_DIR}/postgres.dump"

docker compose exec -T postgres pg_restore --list \
  < "${WORK_DIR}/postgres.dump" \
  > "${WORK_DIR}/postgres.restore.list"

install -m 0600 .env "${WORK_DIR}/env"
install -m 0600 docker-compose.yml "${WORK_DIR}/docker-compose.yml"
docker cp sub2api:/app/sub2api "${WORK_DIR}/sub2api"
chmod 0700 "${WORK_DIR}/sub2api"

docker inspect sub2api > "${WORK_DIR}/container-inspect.json"
docker image inspect "$(docker inspect -f '{{.Image}}' sub2api)" \
  > "${WORK_DIR}/image-inspect.json"

if [[ -f /etc/nginx/sites-available/sub2api-ru ]]; then
  install -m 0600 /etc/nginx/sites-available/sub2api-ru "${WORK_DIR}/nginx.conf"
fi
if [[ -d /etc/ssl/sub2api-ru ]]; then
  mkdir -m 0700 "${WORK_DIR}/tls"
  cp -a /etc/ssl/sub2api-ru/. "${WORK_DIR}/tls/"
fi

(
  cd "${WORK_DIR}"
  sha256sum postgres.dump env docker-compose.yml sub2api \
    container-inspect.json image-inspect.json > manifest.sha256
  sha256sum --check manifest.sha256 >/dev/null
)

tar -C "${WORK_DIR}" -czf "${ARCHIVE}" .
chmod 0600 "${ARCHIVE}"
tar -tzf "${ARCHIVE}" >/dev/null

printf '%s\n' "${ARCHIVE}"
