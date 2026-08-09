#!/bin/bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
TEST_ROOT=$(mktemp -d)
trap 'rm -rf "$TEST_ROOT"' EXIT
MOCK_BIN="$TEST_ROOT/bin"
mkdir -p "$MOCK_BIN"

cat > "$MOCK_BIN/curl" <<'EOF'
#!/bin/bash
set -euo pipefail
url=""
out=""
while [ "$#" -gt 0 ]; do
    case "$1" in
        -o|--output)
            out=$2
            shift 2
            ;;
        http://*|https://*)
            url=$1
            shift
            ;;
        *) shift ;;
    esac
done
[ -n "$url" ] && [ -n "$out" ]
archive_name="sub2api_0.1.173-ru.1_linux_amd64.tar.gz"
digest=$(printf 'archive' | /usr/bin/sha256sum | cut -d' ' -f1)
case "$url" in
    */checksums.txt)
        case "$CHECKSUM_MODE" in
            missing) exit 22 ;;
            confusable) printf '%s  %s.evil\n' "$digest" "$archive_name" > "$out" ;;
            duplicate) printf '%s  %s\n%s  %s\n' "$digest" "$archive_name" "$digest" "$archive_name" > "$out" ;;
            exact) printf '%s  %s\n' "$digest" "$archive_name" > "$out" ;;
            *) exit 97 ;;
        esac
        ;;
    *) printf 'archive' > "$out" ;;
esac
EOF
chmod +x "$MOCK_BIN/curl"

cat > "$MOCK_BIN/tar" <<'EOF'
#!/bin/bash
set -euo pipefail
printf 'tar-called\n' >> "$TAR_LOG"
dest=""
while [ "$#" -gt 0 ]; do
    if [ "$1" = "-C" ]; then
        dest=$2
        shift 2
    else
        shift
    fi
done
[ -n "$dest" ]
printf '#!/bin/sh\nexit 0\n' > "$dest/sub2api"
chmod +x "$dest/sub2api"
EOF
chmod +x "$MOCK_BIN/tar"

run_case() {
    local mode=$1
    local case_dir="$TEST_ROOT/$mode"
    mkdir -p "$case_dir/install"
    : > "$case_dir/tar.log"
    CHECKSUM_MODE=$mode TAR_LOG="$case_dir/tar.log" PATH="$MOCK_BIN:$PATH" \
        CASE_INSTALL_DIR="$case_dir/install" ROOT_DIR="$ROOT_DIR" bash -c '
            set -euo pipefail
            source <(head -n -1 "$ROOT_DIR/deploy/install.sh")
            print_info() { :; }
            print_success() { :; }
            print_warning() { :; }
            print_error() { :; }
            msg() { printf "%s" "$1"; }
            OS=linux
            ARCH=amd64
            LATEST_VERSION=v0.1.173-ru.1
            INSTALL_DIR=$CASE_INSTALL_DIR
            download_and_extract
        '
}

for mode in missing confusable duplicate; do
    if run_case "$mode"; then
        echo "installer accepted unsafe checksum manifest: $mode" >&2
        exit 1
    fi
    test ! -s "$TEST_ROOT/$mode/tar.log"
done

run_case exact
test -s "$TEST_ROOT/exact/tar.log"
test -x "$TEST_ROOT/exact/install/sub2api"

echo "installer checksum integrity checks passed"
