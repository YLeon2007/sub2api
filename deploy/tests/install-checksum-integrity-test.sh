#!/bin/bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
TEST_ROOT=$(mktemp -d)
cleanup_test_root() {
    rm -rf -- "$TEST_ROOT"
}
trap cleanup_test_root EXIT
MOCK_BIN="$TEST_ROOT/bin"
FIXTURES="$TEST_ROOT/fixtures"
mkdir -p "$MOCK_BIN" "$FIXTURES"

FIXTURES="$FIXTURES" python3 - <<'PY'
import gzip
import io
import os
import tarfile
from pathlib import Path

root = Path(os.environ["FIXTURES"])


def member(name: str, data: bytes = b"", *, kind: bytes = tarfile.REGTYPE, link: str = "") -> tarfile.TarInfo:
    info = tarfile.TarInfo(name)
    info.type = kind
    info.linkname = link
    info.mode = 0o755 if name == "sub2api" else 0o644
    info.size = len(data) if kind == tarfile.REGTYPE else 0
    return info


def write(name: str, entries: list[tuple[tarfile.TarInfo, bytes]]) -> None:
    with tarfile.open(root / f"{name}.tar.gz", "w:gz") as archive:
        for info, data in entries:
            archive.addfile(info, io.BytesIO(data) if info.isreg() else None)

binary = b"#!/bin/sh\nprintf 'NEW\\n'\n"
valid = [
    (member("sub2api", binary), binary),
    (member("README.md", b"readme\n"), b"readme\n"),
    (member("deploy/docker-entrypoint.sh", b"#!/bin/sh\n"), b"#!/bin/sh\n"),
]
write("exact", valid)
write("traversal", valid + [(member("../escaped", b"pwned"), b"pwned")])
write("symlink", valid + [(member("deploy/host", kind=tarfile.SYMTYPE, link="/etc/passwd"), b"")])
write("duplicate", valid + [(member("README.md", b"second\n"), b"second\n")])
write("nested-binary", [(member("nested/sub2api", binary), binary)])
write("special", valid + [(member("deploy/fifo", kind=tarfile.FIFOTYPE), b"")])
write("member-budget", valid + [(member(f"deploy/f{index}", b""), b"") for index in range(1025)])
corrupt = bytearray((root / "exact.tar.gz").read_bytes())
corrupt[-1] ^= 0xFF
(root / "corrupt-gzip.tar.gz").write_bytes(corrupt)
tar_bytes = gzip.decompress((root / "exact.tar.gz").read_bytes())
(root / "trailing-budget.tar.gz").write_bytes(gzip.compress(tar_bytes + b"x" * (1024 * 1024 + 1)))
(root / "trailing-content.tar.gz").write_bytes(gzip.compress(tar_bytes + b"HIDDEN-TAR-TAIL"))
with gzip.open(root / "second-member.gz", "wb") as stream:
    stream.write(b"SECOND-GZIP-MEMBER")
(root / "concatenated-gzip.tar.gz").write_bytes(
    (root / "exact.tar.gz").read_bytes() + (root / "second-member.gz").read_bytes()
)
PY

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
archive_name="sub2api_0.1.175-ru.2_linux_amd64.tar.gz"
fixture="$FIXTURES/$ARCHIVE_MODE.tar.gz"
digest=$(/usr/bin/sha256sum "$fixture" | cut -d' ' -f1)
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
    *) cp "$fixture" "$out" ;;
esac
EOF
chmod +x "$MOCK_BIN/curl"

run_case() {
    local name=$1 checksum_mode=$2 archive_mode=$3 tmp_parent=${4:-}
    local case_dir="$TEST_ROOT/$name"
    mkdir -p "$case_dir/install"
    printf 'ORIGINAL\n' > "$case_dir/install/sub2api"
    chmod +x "$case_dir/install/sub2api"
    if [ -z "$tmp_parent" ]; then
        tmp_parent="$case_dir/tmp"
    fi
    mkdir -p "$tmp_parent"
    CHECKSUM_MODE=$checksum_mode ARCHIVE_MODE=$archive_mode FIXTURES="$FIXTURES" \
        PATH="$MOCK_BIN:$PATH" TMPDIR="$tmp_parent" CASE_INSTALL_DIR="$case_dir/install" \
        ROOT_DIR="$ROOT_DIR" bash -c '
            set -euo pipefail
            source <(head -n -1 "$ROOT_DIR/deploy/install.sh")
            print_info() { :; }
            print_success() { :; }
            print_warning() { :; }
            print_error() { :; }
            msg() { printf "%s" "$1"; }
            OS=linux
            ARCH=amd64
            LATEST_VERSION=v0.1.175-ru.2
            INSTALL_DIR=$CASE_INSTALL_DIR
            download_and_extract
        '
}

for mode in missing confusable duplicate; do
    if run_case "checksum-$mode" "$mode" exact; then
        echo "installer accepted unsafe checksum manifest: $mode" >&2
        exit 1
    fi
    grep -Fxq 'ORIGINAL' "$TEST_ROOT/checksum-$mode/install/sub2api"
done

for mode in traversal symlink duplicate nested-binary special member-budget corrupt-gzip trailing-budget trailing-content concatenated-gzip; do
    if run_case "archive-$mode" exact "$mode"; then
        echo "installer accepted unsafe release archive: $mode" >&2
        exit 1
    fi
    grep -Fxq 'ORIGINAL' "$TEST_ROOT/archive-$mode/install/sub2api"
done

evil_tmp="$TEST_ROOT/evil; touch $TEST_ROOT/TRAP_PWNED; #"
run_case exact exact exact "$evil_tmp"
test ! -e "$TEST_ROOT/TRAP_PWNED"
grep -Fq "NEW" "$TEST_ROOT/exact/install/sub2api"
test -f "$TEST_ROOT/exact/install/docker-entrypoint.sh"

# The production installer must use fixed cleanup code and an atomic sibling replacement.
grep -Fq 'cleanup_download_temp()' "$ROOT_DIR/deploy/install.sh"
grep -Fq 'trap cleanup_download_temp EXIT' "$ROOT_DIR/deploy/install.sh"
grep -Fq 'mv -f -- "$staged_binary" "$INSTALL_DIR/sub2api"' "$ROOT_DIR/deploy/install.sh"

echo "installer checksum and archive integrity checks passed"
