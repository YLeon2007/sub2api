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
write("root-plus-deploy-binary", valid + [(member("deploy/sub2api", b"UNVERIFIED\n"), b"UNVERIFIED\n")])
write(
    "root-plus-deploy-binary-directory",
    valid
    + [
        (member("deploy/sub2api", kind=tarfile.DIRTYPE), b""),
        (member("deploy/sub2api/payload", b"UNVERIFIED\n"), b"UNVERIFIED\n"),
    ],
)
write("special", valid + [(member("deploy/fifo", kind=tarfile.FIFOTYPE), b"")])
write("member-budget", valid + [(member(f"deploy/f{index}", b""), b"") for index in range(1025)])
corrupt = bytearray((root / "exact.tar.gz").read_bytes())
corrupt[-1] ^= 0xFF
(root / "corrupt-gzip.tar.gz").write_bytes(corrupt)
tar_bytes = gzip.decompress((root / "exact.tar.gz").read_bytes())
(root / "trailing-budget.tar.gz").write_bytes(gzip.compress(tar_bytes + b"x" * (1024 * 1024 + 1)))
(root / "trailing-content.tar.gz").write_bytes(gzip.compress(tar_bytes + b"HIDDEN-TAR-TAIL"))
buffered_tail = bytearray(tar_bytes)
tar_eof = buffered_tail.find(b"\0" * 1024)
assert tar_eof >= 0
hidden_tail = b"BUFFERED-HIDDEN-TAR-TAIL"
buffered_tail[tar_eof + 1024 : tar_eof + 1024 + len(hidden_tail)] = hidden_tail
(root / "buffered-trailing-content.tar.gz").write_bytes(gzip.compress(buffered_tail))
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
headers=""
write_out=""
while [ "$#" -gt 0 ]; do
    case "$1" in
        -o|--output)
            out=$2
            shift 2
            ;;
        -D|--dump-header)
            headers=$2
            shift 2
            ;;
        -w|--write-out)
            write_out=$2
            shift 2
            ;;
        --max-filesize|--connect-timeout|--max-time|--proto|--proto-redir|--tlsv1.2)
            if [ "$1" = "--tlsv1.2" ]; then shift; else shift 2; fi
            ;;
        http://*|https://*)
            url=$1
            shift
            ;;
        *) shift ;;
    esac
done
[ -n "$url" ] && [ -n "$out" ]
archive_name="sub2api_0.1.178-ru.1_linux_amd64.tar.gz"
fixture="$FIXTURES/$ARCHIVE_MODE.tar.gz"
digest=$(/usr/bin/sha256sum "$fixture" | cut -d' ' -f1)

if [ "${DOWNLOAD_MODE:-exact}" = "untrusted-redirect" ] && [ -n "$write_out" ]; then
    printf 'HTTP/1.1 302 Found\r\nLocation: https://evil.example/payload\r\n\r\n' > "$headers"
    printf '302'
    exit 0
fi
if [ "${DOWNLOAD_MODE:-exact}" = "trusted-redirect" ] && [[ "$url" == https://github.com/* ]] && [ -n "$write_out" ]; then
    printf 'HTTP/1.1 302 Found\r\nLocation: https://release-assets.githubusercontent.com/test/%s\r\n\r\n' "${url##*/}" > "$headers"
    printf '302'
    exit 0
fi

if [ -n "$headers" ]; then
    printf 'HTTP/1.1 200 OK\r\n\r\n' > "$headers"
fi
case "$url" in
    */checksums.txt)
        case "$CHECKSUM_MODE" in
            missing) exit 22 ;;
            confusable) printf '%s  %s.evil\n' "$digest" "$archive_name" > "$out" ;;
            duplicate) printf '%s  %s\n%s  %s\n' "$digest" "$archive_name" "$digest" "$archive_name" > "$out" ;;
            exact)
                printf '%s  %s\n' "$digest" "$archive_name" > "$out"
                if [ "${DOWNLOAD_MODE:-exact}" = "oversized-checksum" ]; then
                    python3 - "$out" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
with p.open('ab') as stream:
    stream.write(b'x' * (2 * 1024 * 1024))
PY
                fi
                ;;
            *) exit 97 ;;
        esac
        ;;
    *) cp "$fixture" "$out" ;;
esac
if [ -n "$write_out" ]; then printf '200'; fi
EOF
chmod +x "$MOCK_BIN/curl"

run_case() {
    local name=$1 checksum_mode=$2 archive_mode=$3 tmp_parent=${4:-} download_mode=${5:-exact} fresh_install=${6:-false}
    local case_dir="$TEST_ROOT/$name"
    mkdir -p "$case_dir/install"
    if [ "$fresh_install" = true ]; then
        rm -rf -- "$case_dir/install/sub2api"
    else
        printf 'ORIGINAL\n' > "$case_dir/install/sub2api"
        chmod +x "$case_dir/install/sub2api"
    fi
    if [ -z "$tmp_parent" ]; then
        tmp_parent="$case_dir/tmp"
    fi
    mkdir -p "$tmp_parent"
    CHECKSUM_MODE=$checksum_mode ARCHIVE_MODE=$archive_mode DOWNLOAD_MODE=$download_mode FIXTURES="$FIXTURES" \
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
            LATEST_VERSION=v0.1.178-ru.1
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

for mode in traversal symlink duplicate nested-binary root-plus-deploy-binary special member-budget corrupt-gzip trailing-budget trailing-content buffered-trailing-content concatenated-gzip; do
    if run_case "archive-$mode" exact "$mode"; then
        echo "installer accepted unsafe release archive: $mode" >&2
        exit 1
    fi
    grep -Fxq 'ORIGINAL' "$TEST_ROOT/archive-$mode/install/sub2api"
done

if run_case archive-root-plus-deploy-binary-directory exact root-plus-deploy-binary-directory "" exact true; then
    echo "installer accepted a deploy/sub2api directory that occupies the executable destination" >&2
    exit 1
fi
if [ -e "$TEST_ROOT/archive-root-plus-deploy-binary-directory/install/sub2api" ]; then
    echo "installer mutated the executable destination before rejecting deploy/sub2api directory shadowing" >&2
    exit 1
fi

if run_case redirect-untrusted exact exact "" untrusted-redirect; then
    echo "installer accepted an untrusted release redirect" >&2
    exit 1
fi
grep -Fxq 'ORIGINAL' "$TEST_ROOT/redirect-untrusted/install/sub2api"

if run_case checksum-oversized exact exact "" oversized-checksum; then
    echo "installer accepted an oversized checksum manifest" >&2
    exit 1
fi
grep -Fxq 'ORIGINAL' "$TEST_ROOT/checksum-oversized/install/sub2api"

run_case redirect-trusted exact exact "" trusted-redirect
grep -Fq 'NEW' "$TEST_ROOT/redirect-trusted/install/sub2api"

ROOT_DIR="$ROOT_DIR" bash -c '
    set -euo pipefail
    source <(head -n -1 "$ROOT_DIR/deploy/install.sh")
    for url in \
        "https://github.com/YLeon2007/sub2api/releases/download/v1/a" \
        "https://release-assets.githubusercontent.com/test/a" \
        "https://objects.githubusercontent.com/test/a"; do
        is_trusted_github_release_asset_url "$url"
    done
    for url in \
        "http://github.com/YLeon2007/sub2api/a" \
        "https://user@github.com/YLeon2007/sub2api/a" \
        "https://github.com:443/YLeon2007/sub2api/a" \
        "https://github.com.evil.example/a" \
        "https://notgithub.com/a" \
        "https://evil.githubusercontent.com/a"; do
        if is_trusted_github_release_asset_url "$url"; then
            echo "trusted invalid release asset authority: $url" >&2
            exit 1
        fi
    done
'

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
