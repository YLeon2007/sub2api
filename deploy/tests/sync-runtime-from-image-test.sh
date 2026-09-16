#!/usr/bin/env bash
set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${TEST_DIR}/.." && pwd)"
SCRIPT="${DEPLOY_DIR}/sync-runtime-from-image.sh"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/sub2api-sync-runtime-test.XXXXXX")"
RUNTIME_DIR="${TEST_ROOT}/runtime"
INSTALL_DIR="${TEST_ROOT}/install"
LOG_FILE="${TEST_ROOT}/docker.log"

cleanup() {
  rm -rf "${TEST_ROOT}"
}
trap cleanup EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

mkdir -p "${RUNTIME_DIR}" "${INSTALL_DIR}"
printf '%s\n' old-runtime-binary > "${RUNTIME_DIR}/sub2api"
chmod 0755 "${RUNTIME_DIR}/sub2api"
printf '%s\n' 'services: {}' > "${INSTALL_DIR}/docker-compose.yml"
: > "${LOG_FILE}"

export PATH="${TEST_DIR}/fixtures/sync-runtime:${PATH}"
export FAKE_SYNC_RUNTIME_DIR="${RUNTIME_DIR}"
export FAKE_SYNC_LOG="${LOG_FILE}"
export FAKE_FAIL_SECOND_MV=1

set +e
"${SCRIPT}" ghcr.io/yleon2007/sub2api:test "${INSTALL_DIR}" >"${TEST_ROOT}/stdout" 2>"${TEST_ROOT}/stderr"
status=$?
set -e

[[ ${status} -ne 0 ]] || fail 'sync unexpectedly succeeded after the injected second mv failure'
[[ -f "${RUNTIME_DIR}/sub2api" ]] || fail 'live runtime was not restored after the injected second mv failure'
[[ "$(<"${RUNTIME_DIR}/sub2api")" == old-runtime-binary ]] || fail 'restored runtime does not match the original binary'
[[ ! -e "${RUNTIME_DIR}/sub2api.backup" ]] || fail 'backup remained after rollback restoration'
[[ "$(grep -c '^first-move-complete$' "${LOG_FILE}")" -eq 1 ]] || fail 'the injected failure did not occur after the first mv'
[[ "$(grep -c '^second-move-failed$' "${LOG_FILE}")" -eq 1 ]] || fail 'the second mv failure was not injected exactly once'
[[ "$(grep -c '^restore-run$' "${LOG_FILE}")" -eq 1 ]] || fail 'rollback restore container did not run exactly once'
[[ "$(grep -c '^compose-up$' "${LOG_FILE}")" -eq 1 ]] || fail 'service was not restarted exactly once after rollback'

: > "${LOG_FILE}"
unset FAKE_FAIL_SECOND_MV
"${SCRIPT}" ghcr.io/yleon2007/sub2api:test "${INSTALL_DIR}" >"${TEST_ROOT}/success.stdout" 2>"${TEST_ROOT}/success.stderr"
[[ "$(<"${RUNTIME_DIR}/sub2api")" == new-image-binary ]] || fail 'successful sync did not install the staged image binary'
[[ "$(<"${RUNTIME_DIR}/sub2api.backup")" == old-runtime-binary ]] || fail 'successful sync did not preserve the original binary as rollback material'
[[ "$(grep -c '^compose-stop$' "${LOG_FILE}")" -eq 1 ]] || fail 'successful sync did not stop the service exactly once'
[[ "$(grep -c '^compose-up$' "${LOG_FILE}")" -eq 1 ]] || fail 'successful sync did not restart the service exactly once'
grep -Fxq 'RUNTIME_IMAGE_SYNC_PASS' "${TEST_ROOT}/success.stdout" || fail 'successful sync did not report completion'

printf '%s\n' 'sync-runtime success and second-mv rollback tests passed'
