#!/bin/bash

set -euo pipefail

ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
TEST_ROOT=$(mktemp -d)
trap 'rm -rf -- "$TEST_ROOT"' EXIT
INSTALL_DIR="$TEST_ROOT/install"
mkdir -p "$INSTALL_DIR"

cat > "$INSTALL_DIR/sub2api" <<'EOF'
#!/bin/sh
printf '%s\n' '2026-09-05T20:00:00+03:00	INFO	stdlog	Sub2API 0.2.13-ru.1 (commit: 576932739818cae8249090970059d59efa99fb7b, built: 2026-09-05T20:00:00+03:00)	{"service":"sub2api","env":"bootstrap","legacy_stdlog":true}'
EOF
chmod +x "$INSTALL_DIR/sub2api"

# Latest-release API fixtures live in real files so the mocks below cannot be
# defeated by quoting mistakes.
HTML='https://github.com/YLeon2007/sub2api/releases/tag/v0.2.13-ru.1'
printf '%s' '{"tag_name":"v0.2.13-ru.1","name":"Sub2API RU v0.2.13-ru.1","html_url":"'"$HTML"'"}' > "$TEST_ROOT/payload-canonical.json"
printf '%s' '{"tag_name":"v0.2.13-ru.1-debug","name":"v0.2.13-ru.1","html_url":"'"$HTML"'"}' > "$TEST_ROOT/payload-shadowed-by-name.json"
printf '%s' '{"tag_name":"v0.2.13-ru.1-debug","release":{"tag_name":"v0.2.13-ru.1"},"html_url":"'"$HTML"'"}' > "$TEST_ROOT/payload-nested-tag.json"
printf '%s' '{"tag_name":null,"name":"v0.2.13-ru.1","html_url":"'"$HTML"'"}' > "$TEST_ROOT/payload-null-tag.json"
printf '%s' '{"name":"v0.2.13-ru.1","html_url":"'"$HTML"'"}' > "$TEST_ROOT/payload-missing-tag.json"
printf '%s' '{"tag_name":"v0.2.13","name":"v0.2.13-ru.1","html_url":"'"$HTML"'"}' > "$TEST_ROOT/payload-nonru-tag.json"
printf '%s' '{"release":{"tag_name":"v0.2.13-ru.1"},"html_url":"'"$HTML"'"}' > "$TEST_ROOT/payload-nested-only.json"
printf '%s' '{"tag_name":null,"release":{"tag_name":"v0.2.13-ru.1"},"html_url":"'"$HTML"'"}' > "$TEST_ROOT/payload-null-plus-nested.json"
printf '%s' '{"release":{"tag_name":"v0.2.13-ru.1"},"tag_name":"v0.2.13","html_url":"'"$HTML"'"}' > "$TEST_ROOT/payload-nested-before-root.json"
printf '%s' '{"tag_name":"v0.2.13-ru.1","html_url":"https://github.com/YLeon2007/sub2api/releases/tag/v0.2.13-ru.2"}' > "$TEST_ROOT/payload-mismatched-html.json"
printf '%s' '{"tag_name":"v0.2.13-ru.1","name":"Sub2API RU v0.2.13-ru.1"}' > "$TEST_ROOT/payload-no-html.json"
printf '%s' '[{"tag_name":"v0.2.13-ru.1"},{"html_url":"'"$HTML"'"}]' > "$TEST_ROOT/payload-array.json"
printf '%s' '{"tag_name":null,"tag_name":"v0.2.13-ru.1","html_url":"'"$HTML"'"}' > "$TEST_ROOT/payload-dup-null-first.json"
printf '%s' '{"tag_name" "v0.2.13-ru.1","html_url":"'"$HTML"'"}' > "$TEST_ROOT/payload-no-colon.json"
printf '%s' '{"tag_name":"v0.2.13-ru.1","html_url":"'"$HTML"'' > "$TEST_ROOT/payload-unterminated.json"
printf '%s' '{"tag_name":"v0.2.13-ru.1","html_url":"'"$HTML"'"}}' > "$TEST_ROOT/payload-trailing-garbage.json"
printf '%s' '{"id":123456,"tag_name":"v0.2.13-ru.1","draft":false,"author":{"login":"tag_name","id":7},"assets":[{"name":"sub2api.tar.gz","size":1024}],"html_url":"'"$HTML"'"}' > "$TEST_ROOT/payload-realistic-author.json"
printf '%s' '{"tag_name":"v0.2.13-ru.1" "html_url":"'"$HTML"'"}' > "$TEST_ROOT/payload-missing-comma.json"
printf '%s' '{"tag_name":"v0.2.13-ru.1","html_url":"'"$HTML"'",}' > "$TEST_ROOT/payload-trailing-comma.json"
printf '%s' '{"tag_name":"v0.2.13-ru.1",garbage}' > "$TEST_ROOT/payload-garbage-in-root.json"
printf '%s' '{"tag_name":"v0.2.13-ru.1","html_url":"'"$HTML"'"]' > "$TEST_ROOT/payload-mismatched-bracket.json"
printf '%s' '{"html_url":"'"$HTML"'"} {"tag_name":"v0.2.13-ru.1"}' > "$TEST_ROOT/payload-trailing-second-root.json"
printf '%s' 'garbage{"tag_name":"v0.2.13-ru.1","html_url":"'"$HTML"'"}' > "$TEST_ROOT/payload-bare-garbage.json"

ROOT_DIR="$ROOT_DIR" CASE_INSTALL_DIR="$INSTALL_DIR" PAYLOAD_DIR="$TEST_ROOT" bash -c '
    set -euo pipefail
    source <(head -n -1 "$ROOT_DIR/deploy/install.sh")
    INSTALL_DIR=$CASE_INSTALL_DIR
    current=$(get_current_version)
    if [ "$current" != "0.2.13-ru.1" ]; then
        printf "expected full RU version 0.2.13-ru.1, got %s\n" "$current" >&2
        exit 1
    fi

    print_info() { :; }
    print_error() { :; }
    msg() { printf "%s" "$1"; }
    list_versions() { :; }
    github_api_curl() { printf "200"; }
    PAYLOAD_HTML="https://github.com/YLeon2007/sub2api/releases/tag/v0.2.13-ru.1"

    for valid in 0.2.13-ru.1 v0.2.13-ru.1; do
        normalized=$(validate_version "$valid")
        if [ "$normalized" != "v0.2.13-ru.1" ]; then
            printf "expected normalized v0.2.13-ru.1, got %s\n" "$normalized" >&2
            exit 1
        fi
    done

    for invalid in v0.2.1 v0.2.1-ru.0 v0.2.1-ru.01 v0.2.13-ru.1-debug; do
        if (validate_version "$invalid" >/dev/null 2>&1); then
            printf "accepted invalid RU release tag: %s\n" "$invalid" >&2
            exit 1
        fi
    done

    # malformed tag_name values must be rejected
    for malformed in v00.2.13-ru.1 v0.2.13-ru.1-debug v0.2.13-rc.1; do
        if (github_api_curl() { printf "{\"tag_name\": \"%s\", \"html_url\": \"%s\"}" "$malformed" "$PAYLOAD_HTML"; }; get_latest_version >/dev/null 2>&1); then
            printf "get_latest_version accepted malformed tag_name: %s\n" "$malformed" >&2
            exit 1
        fi
    done

    # transport error after a partial valid stdout write must be rejected
    github_api_curl() { cat "$PAYLOAD_DIR/payload-canonical.json"; return 28; }
    if (get_latest_version >/dev/null 2>&1); then
        printf "get_latest_version accepted tag despite transport error\n" >&2
        exit 1
    fi

    # adversarial payloads must all be rejected
    for fixture in payload-shadowed-by-name payload-nested-tag payload-null-tag payload-missing-tag payload-nonru-tag payload-nested-only payload-null-plus-nested payload-nested-before-root payload-mismatched-html payload-no-html payload-array payload-dup-null-first payload-no-colon payload-unterminated payload-trailing-garbage payload-missing-comma payload-trailing-comma payload-garbage-in-root payload-mismatched-bracket payload-trailing-second-root payload-bare-garbage; do
        github_api_curl() { cat "$PAYLOAD_DIR/$fixture.json"; }
        if (get_latest_version >/dev/null 2>&1); then
            printf "get_latest_version accepted adversarial fixture: %s\n" "$fixture" >&2
            exit 1
        fi
    done

    # canonical payload is accepted
    github_api_curl() { cat "$PAYLOAD_DIR/payload-canonical.json"; }
    get_latest_version >/dev/null 2>&1
    if [ "$LATEST_VERSION" != "v0.2.13-ru.1" ]; then
        printf "get_latest_version rejected canonical tag, got %s\n" "$LATEST_VERSION" >&2
        exit 1
    fi

    # realistic GitHub payload with nested author object is accepted
    github_api_curl() { cat "$PAYLOAD_DIR/payload-realistic-author.json"; }
    get_latest_version >/dev/null 2>&1
    if [ "$LATEST_VERSION" != "v0.2.13-ru.1" ]; then
        printf "get_latest_version rejected realistic author payload, got %s\n" "$LATEST_VERSION" >&2
        exit 1
    fi
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
    install_version v0.2.13-ru.1
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
