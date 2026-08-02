#!/usr/bin/env python3
"""Static guards for RU fork GitHub automation.

This script is intentionally dependency-free.  It checks the security properties
that are easy to regress in workflow edits: least-privilege permissions,
release-only-by-RU-tag, no production secrets, no auto-merge/deploy in the
upstream watcher, and no mutable-only release image config.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import posixpath
import re
import shlex
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
APPROVED_GORELEASER_DOCKERFILE_SHA256 = "ec3b494986fa4e5076112a60b38918b7bb367a6ff40f5d58b67d2d53d3b94955"
APPROVED_DEPLOY_COMPOSE_SHA256 = "89399a9ef20a2ffced7099e017cb266b546caf5b60b517612bdd6b8929309e1b"
RU_VERSION_RE = re.compile(
    r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)-ru\.[1-9]\d*"
)


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


def text_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


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


def validate_goreleaser_dockerfile(
    text: str,
    errors: list[str],
    approved_sha256: str = APPROVED_GORELEASER_DOCKERFILE_SHA256,
) -> None:
    require(
        text_sha256(text) == approved_sha256,
        "Dockerfile.goreleaser: content must match approved content SHA-256",
        errors,
    )
    logical_dockerfile = re.sub(r"\\\r?\n[ \t]*", " ", text)
    require(
        re.search(r"^\s*ADD\s+", logical_dockerfile, re.M | re.I) is None,
        "Dockerfile.goreleaser: ADD instruction is forbidden",
        errors,
    )
    require(
        re.search(r"^\s*(?:RUN|COPY|ADD)\b[^\n]*<<-?", logical_dockerfile, re.M | re.I) is None,
        "Dockerfile.goreleaser: BuildKit heredoc instructions are forbidden",
        errors,
    )
    final_from_matches = list(re.finditer(r"^\s*FROM(?:\s|$)", text, re.M | re.I))
    require(bool(final_from_matches), "Dockerfile.goreleaser: missing final image stage", errors)
    final_stage = text[final_from_matches[-1].start() :] if final_from_matches else ""
    logical_final_stage = re.sub(r"\\\r?\n[ \t]*", " ", final_stage)
    arg_instructions = re.findall(
        r"^\s*ARG\s+([A-Za-z_][A-Za-z0-9_]*)([^\n]*)$",
        logical_final_stage,
        re.M | re.I,
    )
    target_os_args = [
        remainder.split("#", 1)[0].strip()
        for name, remainder in arg_instructions
        if name == "TARGETOS"
    ]
    target_arch_args = [
        remainder.split("#", 1)[0].strip()
        for name, remainder in arg_instructions
        if name == "TARGETARCH"
    ]
    require(
        target_os_args == [""] and target_arch_args == [""],
        "Dockerfile.goreleaser: final image stage must contain exactly one plain TARGETOS/TARGETARCH ARG",
        errors,
    )
    workdir = "/"
    binary_copy_instructions: list[str] = []
    copy_destinations_parse_cleanly = True
    for raw_instruction in logical_final_stage.splitlines():
        instruction = raw_instruction.strip()
        workdir_match = re.match(r"^WORKDIR\s+(.+)$", instruction, re.I)
        if workdir_match:
            try:
                workdir_tokens = shlex.split(workdir_match.group(1), comments=False, posix=True)
            except ValueError:
                copy_destinations_parse_cleanly = False
                continue
            if len(workdir_tokens) != 1 or "$" in workdir_tokens[0]:
                copy_destinations_parse_cleanly = False
                continue
            workdir = posixpath.normpath(
                workdir_tokens[0]
                if workdir_tokens[0].startswith("/")
                else posixpath.join(workdir, workdir_tokens[0])
            )
            continue
        copy_match = re.match(r"^COPY\s+(.+)$", instruction, re.I)
        if not copy_match:
            continue
        payload = copy_match.group(1).strip()
        while payload.startswith("--"):
            flag_match = re.match(r"^--[^\s]+\s+(.+)$", payload)
            if not flag_match:
                copy_destinations_parse_cleanly = False
                payload = ""
                break
            payload = flag_match.group(1).strip()
        if not payload:
            continue
        try:
            if payload.startswith("["):
                copy_items = json.loads(payload)
                if not isinstance(copy_items, list) or len(copy_items) < 2 or not all(
                    isinstance(item, str) for item in copy_items
                ):
                    raise ValueError("invalid JSON COPY")
            else:
                copy_items = shlex.split(payload, comments=False, posix=True)
                if len(copy_items) < 2:
                    raise ValueError("invalid shell COPY")
        except (json.JSONDecodeError, ValueError):
            copy_destinations_parse_cleanly = False
            continue
        sources = copy_items[:-1]
        destination = copy_items[-1]
        if "$" in destination:
            copy_destinations_parse_cleanly = False
            continue
        resolved_destination = posixpath.normpath(
            destination if destination.startswith("/") else posixpath.join(workdir, destination)
        )
        copies_binary = resolved_destination == "/app/sub2api"
        if resolved_destination == "/app":
            copies_binary = copies_binary or any(
                posixpath.basename(source.rstrip("/")) == "sub2api"
                or any(character in source for character in "*?[")
                for source in sources
            )
        if copies_binary:
            binary_copy_instructions.append(re.sub(r"\s+", " ", instruction))
    require(
        copy_destinations_parse_cleanly
        and binary_copy_instructions == ["COPY ${TARGETOS}/${TARGETARCH}/sub2api /app/sub2api"],
        "Dockerfile.goreleaser: final image stage must contain exactly one platform-qualified binary COPY",
        errors,
    )
    label_payloads = re.findall(r"^\s*LABEL\s+([^\n]+)$", logical_final_stage, re.M | re.I)
    source_key = "org.opencontainers.image.source"
    source_key_count = 0
    source_labels: list[str] = []
    labels_parse_cleanly = True
    for payload in label_payloads:
        try:
            tokens = shlex.split(payload, comments=False, posix=True)
        except ValueError:
            labels_parse_cleanly = False
            continue
        for index, token in enumerate(tokens):
            if "=" in token:
                key, value = token.split("=", 1)
                if key == source_key:
                    source_key_count += 1
                    source_labels.append(value)
            elif token == source_key:
                source_key_count += 1
                if index + 1 < len(tokens):
                    source_labels.append(tokens[index + 1])
    require(
        labels_parse_cleanly
        and source_key_count == 1
        and source_labels == ["https://github.com/YLeon2007/sub2api"],
        "Dockerfile.goreleaser: final image stage must contain exactly one fork source label for YLeon2007/sub2api",
        errors,
    )


def strip_yaml_comment(text: str) -> str:
    quote = ""
    escaped = False
    for index, char in enumerate(text):
        if quote == '"' and escaped:
            escaped = False
            continue
        if quote == '"' and char == "\\":
            escaped = True
            continue
        if quote:
            if char == quote:
                quote = ""
            continue
        if char in {"'", '"'}:
            quote = char
            continue
        if char == "#" and (index == 0 or text[index - 1].isspace()):
            return text[:index].rstrip()
    return text.rstrip()


def split_yaml_mapping(text: str) -> tuple[str, str] | None:
    quote = ""
    escaped = False
    for index, char in enumerate(text):
        if quote == '"' and escaped:
            escaped = False
            continue
        if quote == '"' and char == "\\":
            escaped = True
            continue
        if quote:
            if char == quote:
                quote = ""
            continue
        if char in {"'", '"'}:
            quote = char
            continue
        if char == ":":
            raw_key = text[:index].strip()
            value = text[index + 1 :].strip()
            if not raw_key:
                return None
            try:
                if raw_key.startswith('"'):
                    key = json.loads(raw_key)
                elif raw_key.startswith("'"):
                    if not raw_key.endswith("'"):
                        return None
                    key = raw_key[1:-1].replace("''", "'")
                else:
                    key = raw_key
            except (json.JSONDecodeError, TypeError):
                return None
            return str(key), value
    return None


def yaml_mapping_entries(text: str) -> tuple[list[tuple[int, int, str, str]], bool]:
    entries: list[tuple[int, int, str, str]] = []
    block_scalar_indent: int | None = None
    clean = True
    for line_number, raw_line in enumerate(text.splitlines()):
        if not raw_line.strip():
            continue
        leading = raw_line[: len(raw_line) - len(raw_line.lstrip())]
        if "\t" in leading:
            clean = False
            continue
        indent = len(leading)
        if block_scalar_indent is not None:
            if indent > block_scalar_indent:
                continue
            block_scalar_indent = None
        content = strip_yaml_comment(raw_line[indent:]).strip()
        if not content or content.startswith("-"):
            continue
        mapping = split_yaml_mapping(content)
        if mapping is None:
            continue
        key, value = mapping
        entries.append((line_number, indent, key, value))
        if re.fullmatch(r"[>|][+-]?\d*", value):
            block_scalar_indent = indent
    return entries, clean


def compose_service_images(text: str, service_name: str) -> tuple[int, list[str]]:
    entries, clean = yaml_mapping_entries(text)
    roots = [entry for entry in entries if entry[1] == 0 and entry[2] == "services"]
    if not clean or len(roots) != 1 or roots[0][3] != "":
        return 0, []
    root_line = roots[0][0]
    services_block = [
        entry
        for entry in entries
        if entry[0] > root_line
        and not any(
            later[0] > root_line and later[0] <= entry[0] and later[1] == 0
            for later in entries
            if later != roots[0]
        )
    ]
    services_block = [entry for entry in services_block if entry[1] > 0]
    if not services_block:
        return 0, []
    service_indent = min(entry[1] for entry in services_block)
    direct_services = [entry for entry in services_block if entry[1] == service_indent]
    matching_services = [entry for entry in direct_services if entry[2] == service_name]
    if len(matching_services) != 1 or matching_services[0][3] != "":
        return len(matching_services), []
    service = matching_services[0]
    service_block = []
    for entry in entries:
        if entry[0] <= service[0]:
            continue
        if entry[1] <= service_indent:
            break
        service_block.append(entry)
    if not service_block:
        return 1, []
    child_indent = min(entry[1] for entry in service_block)
    images = [entry[3] for entry in service_block if entry[1] == child_indent and entry[2] == "image"]
    normalized_images = []
    for image in images:
        try:
            if image.startswith('"'):
                normalized_images.append(str(json.loads(image)))
            elif image.startswith("'") and image.endswith("'"):
                normalized_images.append(image[1:-1].replace("''", "'"))
            else:
                normalized_images.append(image)
        except (json.JSONDecodeError, TypeError):
            return 1, []
    return 1, normalized_images


def validate_release_identity_texts(
    version_text: str,
    compose_text: str,
    env_example_text: str,
    legal_texts: dict[str, str],
    errors: list[str],
    approved_compose_sha256: str = APPROVED_DEPLOY_COMPOSE_SHA256,
) -> None:
    version = version_text.strip()
    require(
        RU_VERSION_RE.fullmatch(version) is not None,
        f"VERSION: invalid stable RU release version {version!r}",
        errors,
    )
    if not RU_VERSION_RE.fullmatch(version):
        return
    require(
        text_sha256(compose_text) == approved_compose_sha256,
        "deploy/docker-compose.yml: content must match approved content SHA-256",
        errors,
    )
    expected_image = f"ghcr.io/yleon2007/sub2api:{version}"
    sub2api_service_count, compose_images = compose_service_images(compose_text, "sub2api")
    require(
        sub2api_service_count == 1 and compose_images == [expected_image],
        f"deploy/docker-compose.yml: exactly one active fork image must match VERSION {version}",
        errors,
    )
    env_images = re.findall(
        r"^\s*APPLE_CONTAINER_SUB2API_IMAGE=([^\s#]+)\s*(?:#.*)?$",
        env_example_text,
        re.M,
    )
    require(
        env_images == [expected_image],
        f"deploy/.env.example: exactly one Apple image override must match VERSION {version}",
        errors,
    )
    immutable_tag = f"v{version}"
    expected_legal_urls = sorted(
        f"https://github.com/YLeon2007/sub2api/blob/{immutable_tag}/docs/legal/admin-compliance.{language}.md"
        for language in ("zh", "en", "ru")
    )
    legal_url_pattern = re.compile(
        r"(?:https?:)?//[^\s\"'<>\)\]\}]*admin-compliance\.(?:zh|en|ru)\.md"
        r"[^\s\"'<>\)\]\}]*"
    )
    for name, text in legal_texts.items():
        found_legal_urls = sorted(legal_url_pattern.findall(text))
        require(
            found_legal_urls == expected_legal_urls,
            f"{name}: legal document URLs must be the exact immutable ZH/EN/RU set for {immutable_tag}",
            errors,
        )


def validate_release_identity(
    repo_root: Path,
    errors: list[str],
    approved_compose_sha256: str = APPROVED_DEPLOY_COMPOSE_SHA256,
) -> None:
    legal_paths = {
        "backend/internal/service/admin_compliance.go": repo_root / "backend/internal/service/admin_compliance.go",
        "frontend/src/stores/adminCompliance.ts": repo_root / "frontend/src/stores/adminCompliance.ts",
        "frontend/src/components/admin/AdminComplianceDialog.vue": repo_root
        / "frontend/src/components/admin/AdminComplianceDialog.vue",
    }
    validate_release_identity_texts(
        read_text(repo_root / "backend/cmd/server/VERSION"),
        read_text(repo_root / "deploy/docker-compose.yml"),
        read_text(repo_root / "deploy/.env.example"),
        {name: read_text(path) for name, path in legal_paths.items()},
        errors,
        approved_compose_sha256,
    )


def validate_repo(
    repo_root: Path,
    goreleaser_config: Path | None = None,
    approved_dockerfile_sha256: str = APPROVED_GORELEASER_DOCKERFILE_SHA256,
    approved_compose_sha256: str = APPROVED_DEPLOY_COMPOSE_SHA256,
) -> list[str]:
    errors: list[str] = []
    workflow_texts: dict[str, str] = {}
    for name, relative in RU_WORKFLOWS.items():
        workflow_texts[name] = read_text(repo_root / relative)

    validate_ci(workflow_texts["ci"], errors)
    validate_release_workflow(workflow_texts["release"], errors)
    validate_upstream_workflow(workflow_texts["upstream"], errors)
    validate_security_workflow(workflow_texts["security"], errors)
    validate_goreleaser_dockerfile(
        read_text(repo_root / "Dockerfile.goreleaser"),
        errors,
        approved_dockerfile_sha256,
    )
    validate_release_identity(repo_root, errors, approved_compose_sha256)

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
    def test_compose(version: str) -> str:
        return f"services:\n  sub2api:\n    image: ghcr.io/yleon2007/sub2api:{version}\n"

    def test_legal_urls(version: str) -> str:
        tag = f"v{version}"
        return "".join(
            f"https://github.com/YLeon2007/sub2api/blob/{tag}/docs/legal/admin-compliance.{language}.md\n"
            for language in ("zh", "en", "ru")
        )

    assert disallowed_secret_refs("${{ secrets.GITHUB_TOKEN }}") == set()
    assert disallowed_secret_refs("${{ secrets.PRODUCTION_SSH_KEY }}") == {"PRODUCTION_SSH_KEY"}
    assert write_permissions("permissions:\n  contents: read\n") == set()
    assert write_permissions("permissions:\n  contents: write\n  packages: write\n") == {"contents", "packages"}
    pin_errors: list[str] = []
    assert_actions_pinned("test.yml", "- uses: actions/checkout@v6\n", pin_errors)
    assert pin_errors

    unsafe_docker_errors: list[str] = []
    validate_goreleaser_dockerfile(
        "FROM alpine:3.21\nCOPY sub2api /app/sub2api\n",
        unsafe_docker_errors,
    )
    assert any("platform-qualified binary COPY" in error for error in unsafe_docker_errors)
    safe_docker_errors: list[str] = []
    safe_docker_text = (
        "FROM alpine:3.21\nARG TARGETOS\nARG TARGETARCH\n"
        "LABEL org.opencontainers.image.source=\"https://github.com/YLeon2007/sub2api\"\n"
        "COPY ${TARGETOS}/${TARGETARCH}/sub2api /app/sub2api\n"
    )
    validate_goreleaser_dockerfile(
        safe_docker_text,
        safe_docker_errors,
        text_sha256(safe_docker_text),
    )
    assert not safe_docker_errors
    upstream_label_errors: list[str] = []
    validate_goreleaser_dockerfile(
        "FROM alpine:3.21\nARG TARGETOS\nARG TARGETARCH\n"
        "LABEL org.opencontainers.image.source=\"https://github.com/Wei-Shaw/sub2api\"\n"
        "COPY ${TARGETOS}/${TARGETARCH}/sub2api /app/sub2api\n",
        upstream_label_errors,
    )
    assert any("fork source label" in error for error in upstream_label_errors)
    comment_only_label_errors: list[str] = []
    validate_goreleaser_dockerfile(
        "FROM alpine:3.21\nARG TARGETOS\nARG TARGETARCH\n"
        "# LABEL org.opencontainers.image.source=\"https://github.com/YLeon2007/sub2api\"\n"
        "LABEL org.opencontainers.image.source=\"https://github.com/Wei-Shaw/sub2api\"\n"
        "COPY ${TARGETOS}/${TARGETARCH}/sub2api /app/sub2api\n",
        comment_only_label_errors,
    )
    assert any("fork source label" in error for error in comment_only_label_errors)
    global_only_arg_errors: list[str] = []
    validate_goreleaser_dockerfile(
        "ARG TARGETOS\nARG TARGETARCH\nFROM alpine:3.21\n"
        "LABEL org.opencontainers.image.source=\"https://github.com/YLeon2007/sub2api\"\n"
        "COPY ${TARGETOS}/${TARGETARCH}/sub2api /app/sub2api\n",
        global_only_arg_errors,
    )
    assert any("final image stage" in error for error in global_only_arg_errors)
    duplicate_docker_instructions_errors: list[str] = []
    validate_goreleaser_dockerfile(
        "FROM alpine:3.21\nARG TARGETOS\nARG TARGETOS\nARG TARGETARCH\n"
        "LABEL org.opencontainers.image.source=\"https://github.com/YLeon2007/sub2api\"\n"
        "COPY ${TARGETOS}/${TARGETARCH}/sub2api /app/sub2api\n"
        "COPY other-binary /app/sub2api\n",
        duplicate_docker_instructions_errors,
    )
    assert any("TARGETOS/TARGETARCH" in error for error in duplicate_docker_instructions_errors)
    assert any("binary COPY" in error for error in duplicate_docker_instructions_errors)
    alternate_docker_syntax_errors: list[str] = []
    validate_goreleaser_dockerfile(
        "FROM alpine:3.21\nARG TARGETOS\nARG TARGETOS=linux\n"
        "ARG TARGETARCH\nARG TARGETARCH=amd64\n"
        "LABEL org.opencontainers.image.source=\"https://github.com/YLeon2007/sub2api\"\n"
        "LABEL org.opencontainers.image.source=\"https://github.com/Wei-Shaw/sub2api\" other=value\n"
        "COPY ${TARGETOS}/${TARGETARCH}/sub2api /app/sub2api\n"
        "COPY [\"other-binary\", \"/app/sub2api\"]\n",
        alternate_docker_syntax_errors,
    )
    assert any("TARGETOS/TARGETARCH" in error for error in alternate_docker_syntax_errors)
    assert any("binary COPY" in error for error in alternate_docker_syntax_errors)
    assert any("fork source label" in error for error in alternate_docker_syntax_errors)
    add_overwrite_errors: list[str] = []
    add_overwrite_dockerfile = (
        "FROM alpine:3.21\nARG TARGETOS\nARG TARGETARCH\n"
        "LABEL org.opencontainers.image.source=\"https://github.com/YLeon2007/sub2api\"\n"
        "COPY ${TARGETOS}/${TARGETARCH}/sub2api /app/sub2api\n"
        "ADD deploy/docker-entrypoint.sh /app/sub2api\n"
    )
    validate_goreleaser_dockerfile(
        add_overwrite_dockerfile,
        add_overwrite_errors,
        text_sha256(add_overwrite_dockerfile),
    )
    assert any("ADD instruction" in error for error in add_overwrite_errors)
    heredoc_docker_errors: list[str] = []
    heredoc_dockerfile = (
        "FROM alpine:3.21\nCOPY sub2api /app/sub2api\n"
        "RUN true <<'EOF'\n"
        "FROM alpine:3.21\nARG TARGETOS\nARG TARGETARCH\n"
        "LABEL org.opencontainers.image.source=\"https://github.com/YLeon2007/sub2api\"\n"
        "COPY ${TARGETOS}/${TARGETARCH}/sub2api /app/sub2api\nEOF\n"
    )
    validate_goreleaser_dockerfile(
        heredoc_dockerfile,
        heredoc_docker_errors,
        text_sha256(heredoc_dockerfile),
    )
    assert any("heredoc" in error for error in heredoc_docker_errors)
    continued_heredoc_errors: list[str] = []
    continued_heredoc_dockerfile = (
        "FROM alpine:3.21\nCOPY sub2api /app/sub2api\n"
        "RUN \\\n  <<'EOF'\n"
        "FROM alpine:3.21\nARG TARGETOS\nARG TARGETARCH\n"
        "LABEL org.opencontainers.image.source=\"https://github.com/YLeon2007/sub2api\"\n"
        "COPY ${TARGETOS}/${TARGETARCH}/sub2api /app/sub2api\nEOF\n"
    )
    validate_goreleaser_dockerfile(
        continued_heredoc_dockerfile,
        continued_heredoc_errors,
        text_sha256(continued_heredoc_dockerfile),
    )
    assert any("heredoc" in error for error in continued_heredoc_errors)
    relative_copy_errors: list[str] = []
    relative_copy_dockerfile = (
        "FROM alpine:3.21\nARG TARGETOS\nARG TARGETARCH\n"
        "LABEL org.opencontainers.image.source=\"https://github.com/YLeon2007/sub2api\"\n"
        "WORKDIR /app\n"
        "COPY ${TARGETOS}/${TARGETARCH}/sub2api /app/sub2api\n"
        "COPY other-binary sub2api\n"
    )
    validate_goreleaser_dockerfile(
        relative_copy_dockerfile,
        relative_copy_errors,
        text_sha256(relative_copy_dockerfile),
    )
    assert any("binary COPY" in error for error in relative_copy_errors)
    embedded_label_key_errors: list[str] = []
    embedded_label_key_dockerfile = (
        "FROM alpine:3.21\nARG TARGETOS\nARG TARGETARCH\n"
        "LABEL description=\"note org.opencontainers.image.source=https://github.com/YLeon2007/sub2api\"\n"
        "COPY ${TARGETOS}/${TARGETARCH}/sub2api /app/sub2api\n"
    )
    validate_goreleaser_dockerfile(
        embedded_label_key_dockerfile,
        embedded_label_key_errors,
        text_sha256(embedded_label_key_dockerfile),
    )
    assert any("fork source label" in error for error in embedded_label_key_errors)

    mismatched_identity_errors: list[str] = []
    ru2_test_compose = test_compose("0.1.169-ru.2")
    validate_release_identity_texts(
        "0.1.169-ru.1\n",
        ru2_test_compose,
        "APPLE_CONTAINER_SUB2API_IMAGE=ghcr.io/yleon2007/sub2api:0.1.169-ru.2\n",
        {"backend": test_legal_urls("0.1.169-ru.2")},
        mismatched_identity_errors,
        text_sha256(ru2_test_compose),
    )
    assert mismatched_identity_errors
    matching_identity_errors: list[str] = []
    validate_release_identity_texts(
        "0.1.169-ru.2\n",
        ru2_test_compose,
        "APPLE_CONTAINER_SUB2API_IMAGE=ghcr.io/yleon2007/sub2api:0.1.169-ru.2\n",
        {"backend": test_legal_urls("0.1.169-ru.2")},
        matching_identity_errors,
        text_sha256(ru2_test_compose),
    )
    assert not matching_identity_errors
    leading_zero_version_errors: list[str] = []
    leading_zero_compose = test_compose("01.2.3-ru.1")
    validate_release_identity_texts(
        "01.2.3-ru.1\n",
        leading_zero_compose,
        "APPLE_CONTAINER_SUB2API_IMAGE=ghcr.io/yleon2007/sub2api:01.2.3-ru.1\n",
        {"backend": test_legal_urls("01.2.3-ru.1")},
        leading_zero_version_errors,
        text_sha256(leading_zero_compose),
    )
    assert any("invalid stable RU release version" in error for error in leading_zero_version_errors)
    mixed_identity_errors: list[str] = []
    mixed_compose = (
        "services:\n  sub2api:\n"
        "    # image: ghcr.io/yleon2007/sub2api:0.1.169-ru.2\n"
        "    image: ghcr.io/yleon2007/sub2api:0.1.169-ru.1\n"
    )
    validate_release_identity_texts(
        "0.1.169-ru.2\n",
        mixed_compose,
        "APPLE_CONTAINER_SUB2API_IMAGE=ghcr.io/yleon2007/sub2api:0.1.169-ru.2\n",
        {
            "backend": (
                "https://github.com/YLeon2007/sub2api/blob/v0.1.169-ru.2/docs/legal-ru.md\n"
                "https://github.com/YLeon2007/sub2api/blob/v0.1.169-ru.1/docs/legal-en.md\n"
            )
        },
        mixed_identity_errors,
        text_sha256(mixed_compose),
    )
    assert any("docker-compose.yml" in error for error in mixed_identity_errors)
    assert any("legal document URLs" in error for error in mixed_identity_errors)
    duplicate_image_errors: list[str] = []
    duplicate_compose = (
        "services:\n  sub2api:\n"
        "    image: ghcr.io/yleon2007/sub2api:0.1.169-ru.2\n"
        "    image: docker.io/wei-shaw/sub2api:0.1.169\n"
    )
    validate_release_identity_texts(
        "0.1.169-ru.2\n",
        duplicate_compose,
        "APPLE_CONTAINER_SUB2API_IMAGE=ghcr.io/yleon2007/sub2api:0.1.169-ru.2\n"
        "APPLE_CONTAINER_SUB2API_IMAGE=docker.io/wei-shaw/sub2api:0.1.169\n",
        {"backend": test_legal_urls("0.1.169-ru.2")},
        duplicate_image_errors,
        text_sha256(duplicate_compose),
    )
    assert any("docker-compose.yml" in error for error in duplicate_image_errors)
    assert any(".env.example" in error for error in duplicate_image_errors)
    nested_image_errors: list[str] = []
    nested_compose = (
        "services:\n  sub2api:\n    build:\n"
        "      image: ghcr.io/yleon2007/sub2api:0.1.169-ru.2\n"
    )
    validate_release_identity_texts(
        "0.1.169-ru.2\n",
        nested_compose,
        "APPLE_CONTAINER_SUB2API_IMAGE=ghcr.io/yleon2007/sub2api:0.1.169-ru.2\n",
        {"backend": test_legal_urls("0.1.169-ru.2")},
        nested_image_errors,
        text_sha256(nested_compose),
    )
    assert any("docker-compose.yml" in error for error in nested_image_errors)
    fake_compose_service_errors: list[str] = []
    fake_compose = (
        "x-fake:\n  sub2api:\n"
        "    image: ghcr.io/yleon2007/sub2api:0.1.169-ru.2\n"
        "services:\n  \"sub2api\":\n    image: docker.io/wei-shaw/sub2api:0.1.169\n"
    )
    validate_release_identity_texts(
        "0.1.169-ru.2\n",
        fake_compose,
        "APPLE_CONTAINER_SUB2API_IMAGE=ghcr.io/yleon2007/sub2api:0.1.169-ru.2\n",
        {
            "backend": (
                "https://github.com/YLeon2007/sub2api/blob/v0.1.169-ru.2/docs/legal/admin-compliance.zh.md\n"
                "https://github.com/YLeon2007/sub2api/blob/v0.1.169-ru.2/docs/legal/admin-compliance.en.md\n"
                "https://github.com/YLeon2007/sub2api/blob/v0.1.169-ru.2/docs/legal/admin-compliance.ru.md\n"
            )
        },
        fake_compose_service_errors,
        text_sha256(fake_compose),
    )
    assert any("docker-compose.yml" in error for error in fake_compose_service_errors)
    block_scalar_compose_errors: list[str] = []
    block_scalar_compose = (
        "x-text: |\n"
        "  services:\n    sub2api:\n"
        "      image: ghcr.io/yleon2007/sub2api:0.1.169-ru.2\n"
        "services:\n  'sub2api':\n    image: docker.io/wei-shaw/sub2api:0.1.169\n"
    )
    validate_release_identity_texts(
        "0.1.169-ru.2\n",
        block_scalar_compose,
        "APPLE_CONTAINER_SUB2API_IMAGE=ghcr.io/yleon2007/sub2api:0.1.169-ru.2\n",
        {"backend": test_legal_urls("0.1.169-ru.2")},
        block_scalar_compose_errors,
        text_sha256(block_scalar_compose),
    )
    assert any("docker-compose.yml" in error for error in block_scalar_compose_errors)
    mutable_legal_errors: list[str] = []
    validate_release_identity_texts(
        "0.1.169-ru.2\n",
        ru2_test_compose,
        "APPLE_CONTAINER_SUB2API_IMAGE=ghcr.io/yleon2007/sub2api:0.1.169-ru.2\n",
        {
            "backend": (
                "https://github.com/YLeon2007/sub2api/blob/v0.1.169-ru.2/docs/legal/admin-compliance.zh.md\n"
                "https://github.com/YLeon2007/sub2api/blob/v0.1.169-ru.2/docs/legal/admin-compliance.en.md\n"
                "https://github.com/YLeon2007/sub2api/blob/main/docs/legal/admin-compliance.ru.md\n"
            )
        },
        mutable_legal_errors,
        text_sha256(ru2_test_compose),
    )
    assert any("exact immutable ZH/EN/RU" in error for error in mutable_legal_errors)
    suffixed_legal_errors: list[str] = []
    validate_release_identity_texts(
        "0.1.169-ru.2\n",
        ru2_test_compose,
        "APPLE_CONTAINER_SUB2API_IMAGE=ghcr.io/yleon2007/sub2api:0.1.169-ru.2\n",
        {
            "backend": test_legal_urls("0.1.169-ru.2").replace(
                "admin-compliance.ru.md\n",
                "admin-compliance.ru.md?raw=1\n",
            )
        },
        suffixed_legal_errors,
        text_sha256(ru2_test_compose),
    )
    assert any("exact immutable ZH/EN/RU" in error for error in suffixed_legal_errors)
    upstream_extra_legal_errors: list[str] = []
    validate_release_identity_texts(
        "0.1.169-ru.2\n",
        ru2_test_compose,
        "APPLE_CONTAINER_SUB2API_IMAGE=ghcr.io/yleon2007/sub2api:0.1.169-ru.2\n",
        {
            "backend": test_legal_urls("0.1.169-ru.2")
            + "https://github.com/Wei-Shaw/sub2api/blob/main/docs/legal/admin-compliance.ru.md\n"
        },
        upstream_extra_legal_errors,
        text_sha256(ru2_test_compose),
    )
    assert any("exact immutable ZH/EN/RU" in error for error in upstream_extra_legal_errors)
    external_extra_legal_errors: list[str] = []
    validate_release_identity_texts(
        "0.1.169-ru.2\n",
        ru2_test_compose,
        "APPLE_CONTAINER_SUB2API_IMAGE=ghcr.io/yleon2007/sub2api:0.1.169-ru.2\n",
        {
            "backend": test_legal_urls("0.1.169-ru.2")
            + "https://example.invalid/docs/legal/admin-compliance.ru.md\n"
        },
        external_extra_legal_errors,
        text_sha256(ru2_test_compose),
    )
    assert any("exact immutable ZH/EN/RU" in error for error in external_extra_legal_errors)

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
        fixture_dockerfile = (
            "FROM alpine:3.21\nARG TARGETOS\nARG TARGETARCH\n"
            "LABEL org.opencontainers.image.source=\"https://github.com/YLeon2007/sub2api\"\n"
            "COPY ${TARGETOS}/${TARGETARCH}/sub2api /app/sub2api\n"
        )
        (root / "Dockerfile.goreleaser").write_text(fixture_dockerfile, encoding="utf-8")
        fixture_compose = test_compose("0.1.169-ru.2")
        fixture_legal_urls = test_legal_urls("0.1.169-ru.2")
        identity_files = {
            "backend/cmd/server/VERSION": "0.1.169-ru.2\n",
            "deploy/docker-compose.yml": fixture_compose,
            "deploy/.env.example": "APPLE_CONTAINER_SUB2API_IMAGE=ghcr.io/yleon2007/sub2api:0.1.169-ru.2\n",
            "backend/internal/service/admin_compliance.go": fixture_legal_urls,
            "frontend/src/stores/adminCompliance.ts": fixture_legal_urls,
            "frontend/src/components/admin/AdminComplianceDialog.vue": fixture_legal_urls,
        }
        for relative, contents in identity_files.items():
            path = root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(contents, encoding="utf-8")
        errors = validate_repo(
            root,
            approved_dockerfile_sha256=text_sha256(fixture_dockerfile),
            approved_compose_sha256=text_sha256(fixture_compose),
        )
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
