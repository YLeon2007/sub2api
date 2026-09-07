#!/bin/bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
TEST_ROOT=$(mktemp -d)
trap 'rm -rf -- "$TEST_ROOT"' EXIT
INSTALL_DIR="$TEST_ROOT/install"
mkdir -p "$INSTALL_DIR"

cat > "$INSTALL_DIR/sub2api" <<'EOF'
#!/bin/sh
printf '%s\n' '2026-09-05T20:00:00+03:00	INFO	stdlog	Sub2API 0.2.2-ru.1 (commit: 576932739818cae8249090970059d59efa99fb7b, built: 2026-09-05T20:00:00+03:00)	{"service":"sub2api","env":"bootstrap","legacy_stdlog":true}'
EOF
chmod +x "$INSTALL_DIR/sub2api"

ROOT_DIR="$ROOT_DIR" CASE_INSTALL_DIR="$INSTALL_DIR" bash -c '
    set -euo pipefail
    source <(head -n -1 "$ROOT_DIR/deploy/install.sh")
    INSTALL_DIR=$CASE_INSTALL_DIR
    current=$(get_current_version)
    if [ "$current" != "0.2.2-ru.1" ]; then
        printf "expected full RU version 0.2.2-ru.1, got %s\n" "$current" >&2
        exit 1
    fi

    print_info() { :; }
    print_error() { :; }
    msg() { printf "%s" "$1"; }
    list_versions() { :; }
    github_api_curl() { printf "200"; }

    for valid in 0.2.2-ru.1 v0.2.2-ru.1; do
        normalized=$(validate_version "$valid")
        if [ "$normalized" != "v0.2.2-ru.1" ]; then
            printf "expected normalized v0.2.2-ru.1, got %s\n" "$normalized" >&2
            exit 1
        fi
    done

    for invalid in v0.2.1 v0.2.1-ru.0 v0.2.1-ru.01 v0.2.2-ru.1-debug; do
        if (validate_version "$invalid" >/dev/null 2>&1); then
            printf "accepted invalid RU release tag: %s\n" "$invalid" >&2
            exit 1
        fi
    done
'

MARKER="$TEST_ROOT/download-called"
ROOT_DIR="$ROOT_DIR" CASE_INSTALL_DIR="$INSTALL_DIR" MARKER="$MARKER" bash -c '
    set -euo pipefail
    source <(head -n -1 "$ROOT_DIR/deploy/install.sh")
    INSTALL_DIR=$CASE_INSTALL_DIR
    print_info() { :; }
    print_warning() { :; }
    print_error() { :; }
    msg() { printf "%s" "$1"; }
    list_versions() { :; }
    github_api_curl() { printf "200"; }
    download_and_extract() { : > "$MARKER"; }
    install_version v0.2.2-ru.1
'
test ! -e "$MARKER"

grep -Fq 'install -v v0.1.0-ru.1' "$ROOT_DIR/deploy/install.sh"
grep -Fq 'upgrade -v v0.2.0-ru.1' "$ROOT_DIR/deploy/install.sh"
grep -Fq 'rollback v0.1.0-ru.1' "$ROOT_DIR/deploy/install.sh"
if grep -Fq 'install -v v0.1.0      # Install specific version' "$ROOT_DIR/deploy/install.sh" ||
    grep -Fq 'upgrade -v v0.2.0      # Upgrade to specific version' "$ROOT_DIR/deploy/install.sh" ||
    grep -Fq 'rollback v0.1.0        # Rollback to v0.1.0' "$ROOT_DIR/deploy/install.sh"; then
    echo "installer help advertises a tag rejected by strict RU validation" >&2
    exit 1
fi

echo "installer RU version identity checks passed"
