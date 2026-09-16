#!/usr/bin/env bash
set -euo pipefail

TARGET_IMAGE="${1:-}"
INSTALL_DIR="${2:-${INSTALL_DIR:-}}"

if [[ -z "${INSTALL_DIR}" ]]; then
  if [[ -f ./docker-compose.yml ]]; then
    INSTALL_DIR="$(pwd)"
  else
    INSTALL_DIR="/opt/sub2api-ru"
  fi
fi

cd "${INSTALL_DIR}"
docker compose config --quiet

if [[ -z "${TARGET_IMAGE}" ]]; then
  TARGET_IMAGE="$(docker compose config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["sub2api"]["image"])')"
fi

if [[ -z "${TARGET_IMAGE}" ]]; then
  printf '%s\n' 'Unable to resolve the Sub2API image from Compose.' >&2
  exit 1
fi

docker pull "${TARGET_IMAGE}" >/dev/null

RUNTIME_VOLUME="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app"}}{{.Name}}{{end}}{{end}}' sub2api 2>/dev/null || true)"
if [[ -z "${RUNTIME_VOLUME}" ]]; then
  printf '%s\n' 'Container sub2api has no named volume mounted at /app.' >&2
  printf '%s\n' 'Create the stack once with the RU Compose file before synchronizing an image.' >&2
  exit 1
fi

NEW_PATH='/runtime/.sub2api.image.new'
NEW_SHA="$(docker run --rm --entrypoint sh \
  -v "${RUNTIME_VOLUME}:/runtime" "${TARGET_IMAGE}" -ec '
    test -x /app/sub2api
    rm -f /runtime/.sub2api.image.new
    cp /app/sub2api /runtime/.sub2api.image.new
    chmod 0755 /runtime/.sub2api.image.new
    sha256sum /runtime/.sub2api.image.new | cut -d" " -f1
  ')"

if [[ -z "${NEW_SHA}" ]]; then
  printf '%s\n' 'Failed to stage the image binary.' >&2
  exit 1
fi

SWAPPED=0
restore_on_error() {
  status=$?
  if [[ ${status} -ne 0 && ${SWAPPED} -eq 1 ]]; then
    docker compose stop sub2api >/dev/null 2>&1 || true
    docker run --rm --entrypoint sh \
      -v "${RUNTIME_VOLUME}:/runtime" "${TARGET_IMAGE}" -ec '
        if [ -f /runtime/sub2api.backup ]; then
          rm -f /runtime/sub2api.failed
          [ ! -f /runtime/sub2api ] || mv /runtime/sub2api /runtime/sub2api.failed
          mv /runtime/sub2api.backup /runtime/sub2api
          chmod 0755 /runtime/sub2api
        fi
      ' >/dev/null 2>&1 || true
    docker compose up -d sub2api >/dev/null 2>&1 || true
  fi
  exit "${status}"
}
trap restore_on_error EXIT

docker compose stop sub2api >/dev/null

docker run --rm --entrypoint sh \
  -v "${RUNTIME_VOLUME}:/runtime" "${TARGET_IMAGE}" -ec '
    test -s /runtime/.sub2api.image.new
    rm -f /runtime/sub2api.backup
    mv /runtime/sub2api /runtime/sub2api.backup
    mv /runtime/.sub2api.image.new /runtime/sub2api
    chmod 0755 /runtime/sub2api
  '
SWAPPED=1

docker compose up -d sub2api >/dev/null
for _ in $(seq 1 90); do
  state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' sub2api 2>/dev/null || true)"
  [[ "${state}" == 'healthy' || "${state}" == 'running' ]] && break
  sleep 2
done

state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' sub2api)"
if [[ "${state}" != 'healthy' && "${state}" != 'running' ]]; then
  printf 'Sub2API failed to become healthy after syncing %s (state=%s).\n' "${TARGET_IMAGE}" "${state}" >&2
  exit 1
fi

INSTALLED_SHA="$(docker exec sub2api sha256sum /app/sub2api | cut -d' ' -f1)"
if [[ "${INSTALLED_SHA}" != "${NEW_SHA}" ]]; then
  printf 'Installed binary checksum mismatch: expected %s, got %s.\n' "${NEW_SHA}" "${INSTALLED_SHA}" >&2
  exit 1
fi

SWAPPED=0
trap - EXIT
printf 'runtime_image=%s\n' "${TARGET_IMAGE}"
printf 'runtime_sha256=%s\n' "${INSTALLED_SHA}"
printf '%s\n' 'RUNTIME_IMAGE_SYNC_PASS'
