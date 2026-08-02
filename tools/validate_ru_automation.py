#!/usr/bin/env python3
"""Static guards for RU fork GitHub automation.

This script is intentionally dependency-free.  It checks the security properties
that are easy to regress in workflow edits: least-privilege permissions,
release-only-by-RU-tag, no production secrets, no auto-merge/deploy in the
upstream watcher, and no mutable-only release image config.
"""

from __future__ import annotations

import argparse
import re
import sys
import tempfile
from pathlib import Path

RU_WORKFLOWS = {
    "ci": Path(".github/workflows/backend-ci.yml"),
    "release": Path(".github/workflows/release.yml"),
    "upstream": Path(".github/workflows/upstream-watcher.yml"),
    "security": Path(".github/workflows/security-scan.yml"),
}
ALLOWED_SECRET_REFS = {"GITHUB_TOKEN"}
SECRET_REF_RE = re.compile(r"secrets\.([A-Za-z_][A-Za-z0-9_]*)")
WRITE_PERMISSION_RE = re.compile(r"^\s*(actions|checks|contents|deployments|id-token|issues|packages|pages|pull-requests|security-events|statuses)\s*:\s*write\s*$", re.M)
ACTION_REF_RE = re.compile(r"^\s*(?:-\s*)?uses:\s*[^@\s]+@([^\s#]+)", re.M)


class GuardError(RuntimeError):
    pass


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise GuardError(f"required file missing: {path}") from exc


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def secret_refs(text: str) -> set[str]:
    return set(SECRET_REF_RE.findall(text))


def disallowed_secret_refs(text: str) -> set[str]:
    return {ref for ref in secret_refs(text) if ref not in ALLOWED_SECRET_REFS}


def write_permissions(text: str) -> set[str]:
    return {match.group(1) for match in WRITE_PERMISSION_RE.finditer(text)}


def assert_no_production_secrets(name: str, text: str, errors: list[str]) -> None:
    refs = disallowed_secret_refs(text)
    require(not refs, f"{name}: disallowed secret refs found: {sorted(refs)}", errors)


def assert_actions_pinned(name: str, text: str, errors: list[str]) -> None:
    unpinned = sorted({ref for ref in ACTION_REF_RE.findall(text) if not re.fullmatch(r"[0-9a-f]{40}", ref)})
    require(not unpinned, f"{name}: actions must use full commit SHAs, found {unpinned}", errors)


def validate_ci(text: str, errors: list[str]) -> None:
    assert_no_production_secrets("backend-ci.yml", text, errors)
    writes = write_permissions(text)
    require(not writes, f"backend-ci.yml: CI must not request write permissions, found {sorted(writes)}", errors)
    require("contents: read" in text, "backend-ci.yml: expected contents: read permission", errors)
    require("pnpm run typecheck" in text, "backend-ci.yml: missing frontend typecheck", errors)
    require("pnpm run test:run" in text, "backend-ci.yml: missing frontend tests", errors)
    require("pnpm run build" in text, "backend-ci.yml: missing frontend build", errors)
    require("make test-unit" in text, "backend-ci.yml: missing backend unit tests", errors)
    require("govulncheck" in text, "backend-ci.yml: missing govulncheck security validation", errors)
    require("check_pnpm_audit_exceptions.py" in text, "backend-ci.yml: missing pnpm audit exception gate", errors)
    require("ru_release_guard.py --self-test" in text, "backend-ci.yml: missing release guard self-test", errors)
    require("validate_ru_automation.py" in text, "backend-ci.yml: missing workflow automation guard", errors)


def validate_release_workflow(text: str, errors: list[str]) -> None:
    assert_no_production_secrets("release.yml", text, errors)
    require("workflow_dispatch" not in text, "release.yml: release must not be manually dispatchable", errors)
    require("tags:" in text and "-ru." in text, "release.yml: expected RU tag trigger pattern", errors)
    writes = write_permissions(text)
    require(writes <= {"contents", "packages"}, f"release.yml: unexpected write permissions {sorted(writes)}", errors)
    require("contents: write" in text, "release.yml: release needs contents: write for GitHub Releases", errors)
    require("packages: write" in text, "release.yml: release needs packages: write for GHCR", errors)
    require("tools/ru_release_guard.py" in text and "--emit-github-output" in text, "release.yml: missing RU tag/base guard", errors)
    require("goreleaser/goreleaser-action" in text, "release.yml: missing GoReleaser action", errors)
    require("checksums.txt" in text and "sha256sum -c" in text, "release.yml: missing checksum generation/verification", errors)
    require("dockers_v2" in text and "RELEASE_VERSION" in text, "release.yml: missing versioned multi-arch GHCR manifest", errors)
    require(
        "draft: true" in text and "--draft=false" in text,
        "release.yml: release must remain draft until verification",
        errors,
    )
    require(
        "IMAGE_DIGEST" in text and "release-metadata.txt" in text,
        "release.yml: missing verified image digest metadata",
        errors,
    )
    require(
        "steps.guard.outputs.version" in text,
        "release.yml: missing application/image version output",
        errors,
    )
    require(
        "--no-tags" in text
        and "+refs/tags/v*:refs/upstream-tags/v*" in text
        and "--upstream-ref-prefix refs/upstream-tags/" in text
        and "steps.guard.outputs.base_ref" in text
        and "RELEASE_BASE_REF" in text,
        "release.yml: official baseline must use the isolated trusted upstream ref namespace",
        errors,
    )
    require(
        "+refs/tags/v*:refs/tags/v*" not in text,
        "release.yml: official tags must not be imported into fork-local refs/tags",
        errors,
    )
    upstream_cleanup = "git for-each-ref --format='delete %(refname)' refs/upstream-tags/"
    upstream_fetch = "git fetch --force --no-tags upstream-release"
    require(
        upstream_cleanup in text
        and upstream_fetch in text
        and text.find(upstream_cleanup) < text.find(upstream_fetch),
        "release.yml: trusted upstream namespace must be cleared before fetch",
        errors,
    )
    require(
        "uuid.uuid4().hex" in text
        and "subprocess.run" in text
        and "message<<" in text
        and "GITHUB_OUTPUT" in text
        and "message<<EOF" not in text,
        "release.yml: tag message output must use a randomized collision-resistant delimiter",
        errors,
    )
    require(
        "prerelease: false" in text,
        "release.yml: RU release must be a stable non-prerelease for /releases/latest",
        errors,
    )
    frontend_gate_tokens = ["pnpm run lint:check", "pnpm run test:run", "pnpm run typecheck", "pnpm run build"]
    require(
        all(token in text for token in frontend_gate_tokens),
        "release.yml: missing exact-tag frontend gate",
        errors,
    )
    require("make test-unit" in text, "release.yml: missing exact-tag backend gate", errors)
    security_gate_tokens = [
        "check_pnpm_audit_exceptions.py",
        "govulncheck@v1.6.0",
        "govulncheck ./...",
    ]
    require(
        all(token in text for token in security_gate_tokens),
        "release.yml: missing exact-tag security gate",
        errors,
    )
    require(
        "GOFLAGS=-mod=readonly" in text and "go mod tidy" not in text,
        "release.yml: release must use a read-only Go module graph",
        errors,
    )
    require(
        "- name: Verify Linux release binary identity" in text
        and "dist/sub2api_linux_amd64_v1/sub2api --version" in text
        and "Sub2API ${RELEASE_VERSION}" in text
        and "commit: ${EXPECTED_COMMIT}" in text,
        "release.yml: missing exact binary identity version/commit gate",
        errors,
    )
    goreleaser_step_position = text.find("- name: Run GoReleaser")
    exact_gate_positions = [
        text.find("check_pnpm_audit_exceptions.py"),
        text.find("pnpm run test:run"),
        text.find("govulncheck@v1.6.0"),
        text.find("make test-unit"),
    ]
    require(
        goreleaser_step_position >= 0
        and all(0 <= position < goreleaser_step_position for position in exact_gate_positions),
        "release.yml: exact-tag gates must pass before GoReleaser",
        errors,
    )
    ordered_tokens = [
        "- name: Run GoReleaser",
        "- name: Verify Linux release binary identity",
        "- name: Verify local release checksums",
        "- name: Verify versioned GHCR manifest",
        "- name: Publish verified metadata and release",
    ]
    ordered_positions = [text.find(token) for token in ordered_tokens]
    require(
        all(position >= 0 for position in ordered_positions)
        and ordered_positions == sorted(ordered_positions),
        "release.yml: draft verification/publish steps are out of order",
        errors,
    )
    forbidden = ["DOCKERHUB", "TELEGRAM", ".goreleaser.simple", "simple_release", "dockerhub-description"]
    for token in forbidden:
        require(token not in text, f"release.yml: forbidden production/simple-release token {token!r}", errors)
    mutable_image_patterns = [r"sub2api:latest", r"\.Major", r"\.Minor"]
    for pattern in mutable_image_patterns:
        require(not re.search(pattern, text), f"release.yml: mutable image template detected: {pattern}", errors)


def validate_upstream_workflow(text: str, errors: list[str]) -> None:
    assert_no_production_secrets("upstream-watcher.yml", text, errors)
    require("schedule:" in text, "upstream-watcher.yml: missing schedule trigger", errors)
    require("workflow_dispatch:" in text, "upstream-watcher.yml: missing workflow_dispatch trigger", errors)
    writes = write_permissions(text)
    require(writes <= {"contents", "pull-requests"}, f"upstream-watcher.yml: unexpected write permissions {sorted(writes)}", errors)
    require("contents: write" in text, "upstream-watcher.yml: needs contents: write to update sync branch", errors)
    require("pull-requests: write" in text, "upstream-watcher.yml: needs pull-requests: write to create/update PR", errors)
    require(
        "BASE_BRANCH: main" in text and "base_branch:" not in text,
        "upstream-watcher.yml: stable PR base must be fixed to main",
        errors,
    )
    require(
        "UPSTREAM_REPO: Wei-Shaw/sub2api" in text and "upstream_repo:" not in text,
        "upstream-watcher.yml: source must be fixed to official Wei-Shaw/sub2api",
        errors,
    )
    require(
        "tools/ru_upstream_sync_report.py" in text and "latest-stable-tag" in text,
        "upstream-watcher.yml: missing latest stable tag detection",
        errors,
    )
    require(
        "tools/ru_upstream_sync_report.py" in text and "report" in text,
        "upstream-watcher.yml: missing migration/i18n report generation",
        errors,
    )
    require(
        "--no-tags" in text
        and "+refs/tags/v*:refs/upstream-tags/v*" in text
        and "--upstream-ref-prefix refs/upstream-tags/" in text
        and "git branch -f \"$sync_branch\" \"refs/upstream-tags/${latest_tag}\"" in text,
        "upstream-watcher.yml: detection and sync branch must use the isolated trusted upstream ref namespace",
        errors,
    )
    require(
        "+refs/tags/v*:refs/tags/v*" not in text,
        "upstream-watcher.yml: official tags must not be imported into fork-local refs/tags",
        errors,
    )
    upstream_cleanup = "git for-each-ref --format='delete %(refname)' refs/upstream-tags/"
    upstream_fetch = "git fetch --force --no-tags upstream-watch"
    require(
        upstream_cleanup in text
        and upstream_fetch in text
        and text.find(upstream_cleanup) < text.find(upstream_fetch),
        "upstream-watcher.yml: trusted upstream namespace must be cleared before fetch",
        errors,
    )
    require(
        "gh pr create" in text and "--draft" in text and "--base \"$BASE_BRANCH\"" in text,
        "upstream-watcher.yml: sync PR must be created as a draft against stable main",
        errors,
    )
    require(
        "git fetch origin \"+refs/heads/${sync_branch}:refs/remotes/origin/${sync_branch}\"" in text
        and "git rev-parse --verify \"refs/remotes/origin/${sync_branch}\"" in text
        and "--force-with-lease=\"refs/heads/${sync_branch}:${remote_sha}\"" in text,
        "upstream-watcher.yml: sync branch update must use an explicit fetched remote SHA lease",
        errors,
    )
    forbidden = ["gh pr merge", "gh pr ready", "--auto", "enablePullRequestAutoMerge", "/merge", "deployments: write", "packages: write"]
    for token in forbidden:
        require(token not in text, f"upstream-watcher.yml: forbidden auto-merge/deploy token {token!r}", errors)


def validate_security_workflow(text: str, errors: list[str]) -> None:
    assert_no_production_secrets("security-scan.yml", text, errors)
    writes = write_permissions(text)
    require(not writes, f"security-scan.yml: security scan must not request write permissions, found {sorted(writes)}", errors)
    require("contents: read" in text, "security-scan.yml: expected contents: read permission", errors)


def validate_goreleaser_config(path: Path, errors: list[str]) -> None:
    text = read_text(path)
    require("checksums.txt" in text, f"{path}: missing checksums.txt", errors)
    require("disable: true" not in text.split("checksum:", 1)[-1].split("changelog:", 1)[0], f"{path}: checksum disabled", errors)
    require("ghcr.io/{{ .Env.GITHUB_REPO_OWNER_LOWER }}/sub2api" in text and "{{ .Env.RELEASE_VERSION }}" in text, f"{path}: missing versioned GHCR image tag", errors)
    require("dockers_v2" in text, f"{path}: missing multi-arch docker manifest", errors)
    forbidden = ["DOCKERHUB", "TELEGRAM", "simple_release", "sub2api:latest", ".Major", ".Minor"]
    for token in forbidden:
        require(token not in text, f"{path}: forbidden release config token {token!r}", errors)


def validate_repo(repo_root: Path, goreleaser_config: Path | None = None) -> list[str]:
    errors: list[str] = []
    workflow_texts: dict[str, str] = {}
    for name, relative in RU_WORKFLOWS.items():
        workflow_texts[name] = read_text(repo_root / relative)

    validate_ci(workflow_texts["ci"], errors)
    validate_release_workflow(workflow_texts["release"], errors)
    validate_upstream_workflow(workflow_texts["upstream"], errors)
    validate_security_workflow(workflow_texts["security"], errors)

    all_workflows = (repo_root / ".github" / "workflows").glob("*.yml")
    for workflow in all_workflows:
        name = str(workflow.relative_to(repo_root))
        text = read_text(workflow)
        assert_no_production_secrets(name, text, errors)
        assert_actions_pinned(name, text, errors)

    if goreleaser_config:
        validate_goreleaser_config(goreleaser_config, errors)
    return errors


def self_test() -> None:
    assert disallowed_secret_refs("${{ secrets.GITHUB_TOKEN }}") == set()
    assert disallowed_secret_refs("${{ secrets.PRODUCTION_SSH_KEY }}") == {"PRODUCTION_SSH_KEY"}
    assert write_permissions("permissions:\n  contents: read\n") == set()
    assert write_permissions("permissions:\n  contents: write\n  packages: write\n") == {"contents", "packages"}
    pin_errors: list[str] = []
    assert_actions_pinned("test.yml", "- uses: actions/checkout@v6\n", pin_errors)
    assert pin_errors

    unsafe_release_errors: list[str] = []
    validate_release_workflow(
        """name: Unsafe RU Release
on:
  push:
    tags:
      - 'v*.*.*-ru.*'
permissions:
  contents: write
  packages: write
jobs:
  release:
    steps:
      - run: python tools/ru_release_guard.py --emit-github-output
      - uses: goreleaser/goreleaser-action@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
      - run: sha256sum -c checksums.txt
      - run: |
          dockers_v2
          RELEASE_TAG
          RELEASE_VERSION
          draft: false
""",
        unsafe_release_errors,
    )
    assert any("draft until verification" in error for error in unsafe_release_errors)
    assert any("verified image digest metadata" in error for error in unsafe_release_errors)
    assert any("application/image version output" in error for error in unsafe_release_errors)
    assert any("stable non-prerelease" in error for error in unsafe_release_errors)
    assert any("exact-tag frontend gate" in error for error in unsafe_release_errors)
    assert any("exact-tag backend gate" in error for error in unsafe_release_errors)
    assert any("read-only Go module graph" in error for error in unsafe_release_errors)
    assert any("binary identity" in error for error in unsafe_release_errors)

    with tempfile.TemporaryDirectory(prefix="ru-automation-guard-") as tmp:
        root = Path(tmp)
        workflow_dir = root / ".github" / "workflows"
        workflow_dir.mkdir(parents=True)
        (workflow_dir / "backend-ci.yml").write_text(
            """name: RU CI
permissions:
  contents: read
jobs:
  guard:
    steps:
      - run: python tools/ru_release_guard.py --self-test
      - run: python tools/validate_ru_automation.py --repo-root .
  frontend:
    steps:
      - run: pnpm run typecheck
      - run: pnpm run test:run
      - run: pnpm run build
  backend:
    steps:
      - run: make test-unit
      - run: govulncheck ./...
      - run: python tools/check_pnpm_audit_exceptions.py
""",
            encoding="utf-8",
        )
        (workflow_dir / "release.yml").write_text(
            """name: RU Release
on:
  push:
    tags:
      - 'v*.*.*-ru.*'
permissions:
  contents: write
  packages: write
jobs:
  release:
    steps:
      - run: |
          git for-each-ref --format='delete %(refname)' refs/upstream-tags/ | git update-ref --stdin
          git fetch --force --no-tags upstream-release '+refs/tags/v*:refs/upstream-tags/v*'
      - run: python tools/ru_release_guard.py --upstream-ref-prefix refs/upstream-tags/ --emit-github-output
      - name: Read tag message
        run: |
          python - <<'PY'
          import subprocess
          import uuid
          delimiter = uuid.uuid4().hex
          message = subprocess.run(["git", "tag"], check=True, text=True).stdout
          print(f"message<<{delimiter}", file=open(GITHUB_OUTPUT, "a"))
          PY
      - run: python tools/check_pnpm_audit_exceptions.py
      - run: pnpm run lint:check && pnpm run test:run && pnpm run typecheck && pnpm run build
      - run: go install golang.org/x/vuln/cmd/govulncheck@v1.6.0 && govulncheck ./... && make test-unit
      - name: Run GoReleaser
        uses: goreleaser/goreleaser-action@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa # v7
      - name: Verify Linux release binary identity
        run: |
          dist/sub2api_linux_amd64_v1/sub2api --version
          echo "Sub2API ${RELEASE_VERSION}"
          echo "commit: ${EXPECTED_COMMIT}"
      - name: Verify local release checksums
        run: sha256sum -c checksums.txt
      - name: Verify versioned GHCR manifest
        run: |
          dockers_v2
          RELEASE_VERSION=${{ steps.guard.outputs.version }}
          GOFLAGS=-mod=readonly
          draft: true
          prerelease: false
          ghcr.io/example/sub2api:${{ steps.guard.outputs.version }}
      - name: Publish verified metadata and release
        run: |
          IMAGE_DIGEST=sha256:test
          RELEASE_BASE_REF=${{ steps.guard.outputs.base_ref }}
          release-metadata.txt
          gh release edit "$RELEASE_TAG" --draft=false
""",
            encoding="utf-8",
        )
        (workflow_dir / "upstream-watcher.yml").write_text(
            """name: RU Upstream Watcher
on:
  schedule:
    - cron: '17 4 * * *'
  workflow_dispatch:
permissions:
  contents: write
  pull-requests: write
env:
  BASE_BRANCH: main
  UPSTREAM_REPO: Wei-Shaw/sub2api
jobs:
  watch:
    steps:
      - run: |
          git for-each-ref --format='delete %(refname)' refs/upstream-tags/ | git update-ref --stdin
          git fetch --force --no-tags upstream-watch '+refs/tags/v*:refs/upstream-tags/v*'
      - run: python tools/ru_upstream_sync_report.py --upstream-ref-prefix refs/upstream-tags/ latest-stable-tag
      - run: python tools/ru_upstream_sync_report.py --upstream-ref-prefix refs/upstream-tags/ report
      - run: |
          git branch -f "$sync_branch" "refs/upstream-tags/${latest_tag}"
          git fetch origin "+refs/heads/${sync_branch}:refs/remotes/origin/${sync_branch}"
          remote_sha="$(git rev-parse --verify "refs/remotes/origin/${sync_branch}")"
          git push --force-with-lease="refs/heads/${sync_branch}:${remote_sha}"
      - run: gh pr create --draft --base "$BASE_BRANCH"
""",
            encoding="utf-8",
        )
        (workflow_dir / "security-scan.yml").write_text(
            """name: Security Scan
permissions:
  contents: read
jobs:
  scan:
    steps:
      - run: govulncheck ./...
""",
            encoding="utf-8",
        )
        errors = validate_repo(root)
        assert not errors, errors

    print("validate_ru_automation.py self-test passed")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", default=".", help="Repository root")
    parser.add_argument("--goreleaser-config", help="Optional generated GoReleaser config to validate")
    parser.add_argument("--self-test", action="store_true", help="Run built-in tests")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.self_test:
        self_test()
        return 0

    repo_root = Path(args.repo_root).resolve()
    goreleaser_config = Path(args.goreleaser_config).resolve() if args.goreleaser_config else None
    try:
        errors = validate_repo(repo_root, goreleaser_config)
    except GuardError as exc:
        print(f"RU automation guard failed: {exc}", file=sys.stderr)
        return 1

    if errors:
        print("RU automation guard failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("RU automation guard passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
