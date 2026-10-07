#!/usr/bin/env python3
"""Generate safe RU-fork upstream sync reports.

The upstream watcher uses this script to find the newest stable upstream tag and
to produce a PR body section listing migration changes and i18n key candidates.
It deliberately avoids network access and third-party dependencies; workflows do
all fetching before invoking it.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Iterable

STABLE_TAG_RE = re.compile(
    r"^v(?P<major>0|[1-9][0-9]*)\."
    r"(?P<minor>0|[1-9][0-9]*)\."
    r"(?P<patch>0|[1-9][0-9]*)$"
)
I18N_ROOT = "frontend/src/i18n/locales"
MIGRATIONS_ROOT = "backend/migrations"
DEFAULT_UPSTREAM_REF_PREFIX = "refs/tags/"


def run_git(repo_root: Path, args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=repo_root,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=check,
    )


def git_output(repo_root: Path, args: list[str]) -> str:
    return run_git(repo_root, args).stdout.strip()


def parse_stable_tag(tag: str) -> tuple[int, int, int] | None:
    match = STABLE_TAG_RE.fullmatch(tag.strip())
    if not match:
        return None
    major = int(match.group("major"))
    minor = int(match.group("minor"))
    patch = int(match.group("patch"))
    return major, minor, patch


def normalize_ref_prefix(ref_prefix: str) -> str:
    prefix = ref_prefix.strip()
    if not re.fullmatch(r"refs/(?:[A-Za-z0-9._-]+/)+", prefix):
        raise ValueError(f"invalid upstream ref prefix: {ref_prefix!r}")
    return prefix


def upstream_tag_ref(ref_prefix: str, tag: str) -> str:
    if parse_stable_tag(tag) is None:
        raise ValueError(f"tag is not stable semver: {tag}")
    return f"{normalize_ref_prefix(ref_prefix)}{tag}"


def stable_tags(
    repo_root: Path,
    *,
    merged: str | None = None,
    ref_prefix: str = DEFAULT_UPSTREAM_REF_PREFIX,
) -> list[str]:
    prefix = normalize_ref_prefix(ref_prefix)
    tags: list[str] = []
    for ref in git_output(
        repo_root,
        ["for-each-ref", "--format=%(refname)", prefix],
    ).splitlines():
        if not ref.startswith(prefix):
            continue
        tag = ref[len(prefix) :]
        if "/" in tag or parse_stable_tag(tag) is None:
            continue
        if merged and run_git(
            repo_root,
            ["merge-base", "--is-ancestor", f"{ref}^{{commit}}", merged],
            check=False,
        ).returncode != 0:
            continue
        tags.append(tag)
    tags.sort(key=lambda item: parse_stable_tag(item) or (-1, -1, -1))
    return tags


def latest_stable_tag(
    repo_root: Path,
    *,
    ref_prefix: str = DEFAULT_UPSTREAM_REF_PREFIX,
) -> str:
    tags = stable_tags(repo_root, ref_prefix=ref_prefix)
    if not tags:
        raise ValueError("no stable upstream tags found (expected vX.Y.Z)")
    return tags[-1]


def resolve_previous_ref(
    repo_root: Path,
    base_ref: str,
    target_tag: str,
    previous_tag: str | None,
    upstream_ref_prefix: str,
) -> tuple[str, str]:
    target_version = parse_stable_tag(target_tag)
    if target_version is None:
        raise ValueError(f"target tag is not a stable upstream tag: {target_tag}")

    if previous_tag:
        if parse_stable_tag(previous_tag) is None:
            raise ValueError(f"previous tag is not stable semver: {previous_tag}")
        return upstream_tag_ref(upstream_ref_prefix, previous_tag), previous_tag

    candidates = []
    for tag in stable_tags(
        repo_root,
        merged=base_ref,
        ref_prefix=upstream_ref_prefix,
    ):
        version = parse_stable_tag(tag)
        if version and version <= target_version:
            candidates.append(tag)
    if candidates:
        previous = candidates[-1]
        return upstream_tag_ref(upstream_ref_prefix, previous), previous

    target_ref = upstream_tag_ref(upstream_ref_prefix, target_tag)
    merge_base = git_output(repo_root, ["merge-base", base_ref, target_ref])
    return merge_base, f"{merge_base[:12]} (merge-base; no reachable stable tag)"


def diff_name_status(repo_root: Path, old_ref: str, new_ref: str, pathspec: str) -> list[str]:
    output = git_output(repo_root, ["diff", "--name-status", f"{old_ref}..{new_ref}", "--", pathspec])
    return [line for line in output.splitlines() if line.strip()]


def list_files_at_ref(repo_root: Path, ref: str, pathspec: str) -> set[str]:
    result = run_git(repo_root, ["ls-tree", "-r", "--name-only", ref, "--", pathspec], check=False)
    if result.returncode != 0:
        return set()
    return {line for line in result.stdout.splitlines() if line.endswith(".ts")}


def read_file_at_ref(repo_root: Path, ref: str, path: str) -> str:
    result = run_git(repo_root, ["show", f"{ref}:{path}"], check=False)
    if result.returncode != 0:
        return ""
    return result.stdout


def _skip_quoted(content: str, index: int) -> int:
    quote = content[index]
    index += 1
    while index < len(content):
        char = content[index]
        if char == "\\":
            index += 2
            continue
        index += 1
        if char == quote:
            break
    return index


def _skip_trivia(content: str, index: int) -> int:
    while index < len(content):
        if content[index].isspace():
            index += 1
            continue
        if content.startswith("//", index):
            newline = content.find("\n", index + 2)
            return len(content) if newline < 0 else _skip_trivia(content, newline + 1)
        if content.startswith("/*", index):
            end = content.find("*/", index + 2)
            return len(content) if end < 0 else _skip_trivia(content, end + 2)
        break
    return index


def _find_object_start(content: str, index: int) -> int:
    while index < len(content):
        index = _skip_trivia(content, index)
        if index >= len(content):
            return -1
        if content[index] in {"'", '"', "`"}:
            index = _skip_quoted(content, index)
            continue
        if content[index] == "{":
            return index
        index += 1
    return -1


def _read_property_key(content: str, index: int) -> tuple[str | None, int]:
    index = _skip_trivia(content, index)
    if index >= len(content):
        return None, index
    if content[index] in {"'", '"'}:
        quote = content[index]
        cursor = index + 1
        value: list[str] = []
        while cursor < len(content):
            char = content[cursor]
            if char == "\\" and cursor + 1 < len(content):
                value.append(content[cursor + 1])
                cursor += 2
                continue
            if char == quote:
                return "".join(value), cursor + 1
            value.append(char)
            cursor += 1
        return None, len(content)
    match = re.match(r"[A-Za-z_$][A-Za-z0-9_$-]*|[0-9]+", content[index:])
    if not match:
        return None, index
    return match.group(0), index + len(match.group(0))


def _skip_property_value(content: str, index: int) -> int:
    stack: list[str] = []
    pairs = {"(": ")", "[": "]", "{": "}"}
    while index < len(content):
        index = _skip_trivia(content, index)
        if index >= len(content):
            return index
        char = content[index]
        if char in {"'", '"', "`"}:
            index = _skip_quoted(content, index)
            continue
        if char in pairs:
            stack.append(pairs[char])
            index += 1
            continue
        if stack and char == stack[-1]:
            stack.pop()
            index += 1
            continue
        if not stack and char in {",", "}"}:
            return index
        index += 1
    return index


def extract_i18n_keys_from_ts(content: str) -> set[str]:
    """Extract candidate paths from an exported TypeScript object literal.

    This is deliberately a small dependency-free scanner, not a full TypeScript
    parser. It handles both formatted and compact nested objects while ignoring
    strings, comments, spreads, and non-object property values.
    """
    export_match = re.search(r"\bexport\s+default\b", content)
    search_from = export_match.end() if export_match else 0
    object_start = _find_object_start(content, search_from)
    if object_start < 0:
        return set()

    keys: set[str] = set()

    def parse_object(index: int, prefix: tuple[str, ...]) -> int:
        index += 1  # consume opening brace
        while index < len(content):
            index = _skip_trivia(content, index)
            if index >= len(content):
                return index
            if content[index] == "}":
                return index + 1
            if content.startswith("...", index):
                index = _skip_property_value(content, index + 3)
                if index < len(content) and content[index] == ",":
                    index += 1
                continue

            key, key_end = _read_property_key(content, index)
            if key is None:
                index = _skip_property_value(content, index)
                if index < len(content) and content[index] == ",":
                    index += 1
                continue

            cursor = _skip_trivia(content, key_end)
            if cursor >= len(content) or content[cursor] != ":":
                index = _skip_property_value(content, cursor)
                if index < len(content) and content[index] == ",":
                    index += 1
                continue

            path = (*prefix, key)
            keys.add(".".join(path))
            cursor = _skip_trivia(content, cursor + 1)
            if cursor < len(content) and content[cursor] == "{":
                index = parse_object(cursor, path)
            else:
                index = _skip_property_value(content, cursor)

            index = _skip_trivia(content, index)
            if index < len(content) and content[index] == ",":
                index += 1
        return index

    parse_object(object_start, ())
    return keys


def collect_i18n_keys(repo_root: Path, ref: str) -> set[str]:
    files = list_files_at_ref(repo_root, ref, I18N_ROOT)
    result: set[str] = set()
    for path in sorted(files):
        content = read_file_at_ref(repo_root, ref, path)
        for key in extract_i18n_keys_from_ts(content):
            result.add(f"{path}:{key}")
    return result


def format_list(items: Iterable[str], *, empty: str, limit: int = 300) -> str:
    materialized = list(items)
    if not materialized:
        return empty
    shown = materialized[:limit]
    lines = [f"- `{item}`" for item in shown]
    if len(materialized) > limit:
        lines.append(f"- ... truncated {len(materialized) - limit} more entries")
    return "\n".join(lines)


def build_report(
    repo_root: Path,
    *,
    base_ref: str,
    target_tag: str,
    previous_tag: str | None = None,
    sync_branch: str | None = None,
    upstream_ref_prefix: str = DEFAULT_UPSTREAM_REF_PREFIX,
) -> tuple[str, dict[str, object]]:
    target_ref = upstream_tag_ref(upstream_ref_prefix, target_tag)
    previous_ref, previous_label = resolve_previous_ref(
        repo_root,
        base_ref,
        target_tag,
        previous_tag,
        upstream_ref_prefix,
    )
    target_commit = git_output(repo_root, ["rev-parse", "--verify", f"{target_ref}^{{commit}}"])
    base_commit = git_output(repo_root, ["rev-parse", "--verify", f"{base_ref}^{{commit}}"])

    migrations = diff_name_status(repo_root, previous_ref, target_ref, MIGRATIONS_ROOT)
    i18n_files = diff_name_status(repo_root, previous_ref, target_ref, I18N_ROOT)

    old_keys = collect_i18n_keys(repo_root, previous_ref)
    new_keys = collect_i18n_keys(repo_root, target_ref)
    added_keys = sorted(new_keys - old_keys)
    removed_keys = sorted(old_keys - new_keys)

    already_contains_target = (
        run_git(repo_root, ["merge-base", "--is-ancestor", target_ref, base_ref], check=False).returncode == 0
    )

    data: dict[str, object] = {
        "base_ref": base_ref,
        "base_commit": base_commit,
        "target_tag": target_tag,
        "target_ref": target_ref,
        "target_commit": target_commit,
        "previous_ref": previous_ref,
        "previous_label": previous_label,
        "sync_branch": sync_branch,
        "already_contains_target": already_contains_target,
        "changed_migrations": migrations,
        "changed_i18n_files": i18n_files,
        "i18n_added_keys": added_keys,
        "i18n_removed_keys": removed_keys,
    }

    report = f"""# RU upstream sync report

- Base ref: `{base_ref}` (`{base_commit[:12]}`)
- Latest stable upstream tag: `{target_tag}` (`{target_commit[:12]}`)
- Previous stable upstream ref used for audit: `{previous_label}`
- Sync branch: `{sync_branch or '<not provided>'}`
- Base already contains latest upstream tag: `{'yes' if already_contains_target else 'no'}`

## Safety policy

- This automation only creates or updates a review PR.
- It never enables auto-merge, never merges the PR, and never deploys.
- The sync branch points at the upstream tag; humans must review and resolve the PR.

## Changed migrations (`{previous_label}` → `{target_tag}`)

{format_list(migrations, empty='No migration file changes detected.')}

## Changed i18n files (`{previous_label}` → `{target_tag}`)

{format_list(i18n_files, empty='No i18n locale file changes detected.')}

## i18n key candidates added

{format_list(added_keys, empty='No added i18n key candidates detected.')}

## i18n key candidates removed

{format_list(removed_keys, empty='No removed i18n key candidates detected.')}
"""
    return report, data


def write_outputs(report: str, data: dict[str, object], out: str | None, json_out: str | None) -> None:
    if out:
        Path(out).write_text(report, encoding="utf-8")
    else:
        print(report)
    if json_out:
        Path(json_out).write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def self_test() -> None:
    assert parse_stable_tag("v1.2.3") == (1, 2, 3)
    assert parse_stable_tag("v1.2.3-ru.1") is None
    assert parse_stable_tag("v1.2.3-rc.1") is None
    sample_keys = extract_i18n_keys_from_ts(
        """
export default {
  common: {
    loading: 'Loading...',
    nested: {
      title: 'Title',
    },
  },
}
"""
    )
    assert "common.loading" in sample_keys
    assert "common.nested.title" in sample_keys
    compact_keys = extract_i18n_keys_from_ts(
        "export default { common: { loading: 'Loading...', nested: { title: 'Title' } } }\n"
    )
    assert "common.loading" in compact_keys
    assert "common.nested.title" in compact_keys
    commented_export_keys = extract_i18n_keys_from_ts(
        "export default /* misleading { brace } */ { common: { loading: 'Loading...' } }\n"
    )
    assert "common.loading" in commented_export_keys

    with tempfile.TemporaryDirectory(prefix="ru-upstream-report-") as tmp:
        repo = Path(tmp)
        run_git(repo, ["init", "-q"])
        run_git(repo, ["config", "user.email", "report@example.invalid"])
        run_git(repo, ["config", "user.name", "RU Upstream Report"])
        (repo / MIGRATIONS_ROOT).mkdir(parents=True)
        (repo / I18N_ROOT / "en").mkdir(parents=True)
        (repo / MIGRATIONS_ROOT / "001_init.sql").write_text("select 1;\n", encoding="utf-8")
        (repo / I18N_ROOT / "en" / "common.ts").write_text(
            "export default { common: { loading: 'Loading...' } }\n",
            encoding="utf-8",
        )
        run_git(repo, ["add", "."])
        run_git(repo, ["commit", "-q", "-m", "v1.0.0"])
        run_git(repo, ["tag", "v1.0.0"])
        run_git(repo, ["update-ref", "refs/upstream-tags/v1.0.0", "HEAD"])
        (repo / MIGRATIONS_ROOT / "002_next.sql").write_text("select 2;\n", encoding="utf-8")
        (repo / I18N_ROOT / "en" / "common.ts").write_text(
            """export default {
  common: {
    loading: 'Loading...',
    saved: 'Saved',
  },
}
""",
            encoding="utf-8",
        )
        run_git(repo, ["add", "."])
        run_git(repo, ["commit", "-q", "-m", "v1.1.0"])
        run_git(repo, ["tag", "v1.1.0"])
        run_git(repo, ["update-ref", "refs/upstream-tags/v1.1.0", "HEAD"])
        run_git(repo, ["tag", "v9.9.9"])

        assert latest_stable_tag(repo, ref_prefix="refs/upstream-tags/") == "v1.1.0"
        report, data = build_report(
            repo,
            base_ref="v1.0.0",
            target_tag="v1.1.0",
            previous_tag="v1.0.0",
            sync_branch="ru/upstream-sync/v1.1.0",
            upstream_ref_prefix="refs/upstream-tags/",
        )
        assert "002_next.sql" in report
        added = data["i18n_added_keys"]
        assert isinstance(added, list)
        assert any("common.saved" in str(key) for key in added)
        assert not any("common.loading" in str(key) for key in added)

    print("ru_upstream_sync_report.py self-test passed")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", default=".", help="Git repository root")
    parser.add_argument(
        "--upstream-ref-prefix",
        default=DEFAULT_UPSTREAM_REF_PREFIX,
        help="Trusted namespace containing official stable tag refs",
    )
    parser.add_argument("--self-test", action="store_true", help="Run built-in tests")

    subparsers = parser.add_subparsers(dest="command")
    subparsers.add_parser("latest-stable-tag", help="Print newest vX.Y.Z tag available locally")

    report = subparsers.add_parser("report", help="Generate markdown/json upstream sync report")
    report.add_argument("--base-ref", required=True)
    report.add_argument("--target-tag", required=True)
    report.add_argument("--previous-tag")
    report.add_argument("--sync-branch")
    report.add_argument("--out")
    report.add_argument("--json-out")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    repo_root = Path(args.repo_root).resolve()

    if args.self_test:
        self_test()
        return 0

    try:
        if args.command == "latest-stable-tag":
            print(latest_stable_tag(repo_root, ref_prefix=args.upstream_ref_prefix))
            return 0
        if args.command == "report":
            report, data = build_report(
                repo_root,
                base_ref=args.base_ref,
                target_tag=args.target_tag,
                previous_tag=args.previous_tag,
                sync_branch=args.sync_branch,
                upstream_ref_prefix=args.upstream_ref_prefix,
            )
            write_outputs(report, data, args.out, args.json_out)
            return 0
    except (subprocess.CalledProcessError, ValueError) as exc:
        if isinstance(exc, subprocess.CalledProcessError):
            message = exc.stderr.strip() or exc.stdout.strip() or str(exc)
        else:
            message = str(exc)
        print(f"RU upstream report failed: {message}", file=sys.stderr)
        return 1

    parser.print_help(sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
