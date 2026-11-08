#!/usr/bin/env python3
"""Validate RU fork release tags before GitHub release automation runs.

The RU fork only publishes tags shaped like ``vX.Y.Z-ru.N``.  The base
``vX.Y.Z`` tag must exist and must be an ancestor of the RU release tag commit.
This script intentionally has no third-party dependencies so it can run in a
plain GitHub Actions Python environment.
"""

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

RU_TAG_RE = re.compile(
    r"^v(?P<major>0|[1-9][0-9]*)\."
    r"(?P<minor>0|[1-9][0-9]*)\."
    r"(?P<patch>0|[1-9][0-9]*)-ru\."
    r"(?P<iteration>[1-9][0-9]*)$"
)
STABLE_TAG_RE = re.compile(
    r"^v(?P<major>0|[1-9][0-9]*)\."
    r"(?P<minor>0|[1-9][0-9]*)\."
    r"(?P<patch>0|[1-9][0-9]*)$"
)
VERSION_RELATIVE_PATH = Path("backend/cmd/server/VERSION")
DEFAULT_UPSTREAM_REF_PREFIX = "refs/tags/"


@dataclass(frozen=True)
class ReleaseTag:
    tag: str
    version: str
    base_tag: str
    iteration: int


def parse_ru_tag(tag: str) -> ReleaseTag:
    match = RU_TAG_RE.fullmatch(tag.strip())
    if not match:
        raise ValueError(
            f"invalid RU release tag {tag!r}; expected vX.Y.Z-ru.N with N >= 1"
        )
    base_tag = f"v{match.group('major')}.{match.group('minor')}.{match.group('patch')}"
    if not STABLE_TAG_RE.fullmatch(base_tag):  # defensive, should always pass.
        raise ValueError(f"derived base tag is not stable semver: {base_tag}")
    return ReleaseTag(
        tag=tag.strip(),
        version=tag.strip()[1:],
        base_tag=base_tag,
        iteration=int(match.group("iteration")),
    )


def parse_stable_tag(tag: str) -> tuple[int, int, int] | None:
    match = STABLE_TAG_RE.fullmatch(tag.strip())
    if not match:
        return None
    return (
        int(match.group("major")),
        int(match.group("minor")),
        int(match.group("patch")),
    )


def normalize_ref_prefix(ref_prefix: str) -> str:
    prefix = ref_prefix.strip()
    if not re.fullmatch(r"refs/(?:[A-Za-z0-9._-]+/)+", prefix):
        raise ValueError(f"invalid upstream ref prefix: {ref_prefix!r}")
    return prefix


def stable_upstream_refs(
    repo_root: Path,
    ref_prefix: str,
) -> list[tuple[tuple[int, int, int], str, str]]:
    prefix = normalize_ref_prefix(ref_prefix)
    refs: list[tuple[tuple[int, int, int], str, str]] = []
    for ref in git_output(
        repo_root,
        ["for-each-ref", "--format=%(refname)", prefix],
    ).splitlines():
        if not ref.startswith(prefix):
            continue
        tag = ref[len(prefix) :]
        if "/" in tag:
            continue
        version = parse_stable_tag(tag)
        if version is not None:
            refs.append((version, tag, ref))
    refs.sort()
    return refs


def infer_tag_from_github_env() -> str:
    ref_name = os.environ.get("GITHUB_REF_NAME", "").strip()
    ref_type = os.environ.get("GITHUB_REF_TYPE", "").strip()
    if ref_type == "tag" and ref_name:
        return ref_name

    ref = os.environ.get("GITHUB_REF", "").strip()
    prefix = "refs/tags/"
    if ref.startswith(prefix):
        return ref[len(prefix) :]

    raise ValueError("release tag not provided and GITHUB_REF is not a tag ref")


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


def resolve_commit(repo_root: Path, ref: str) -> str:
    return git_output(repo_root, ["rev-parse", "--verify", f"{ref}^{{commit}}"])


def validate_version_file(repo_root: Path, expected_version: str) -> None:
    version_path = repo_root / VERSION_RELATIVE_PATH
    try:
        actual_version = version_path.read_text(encoding="utf-8").strip()
    except FileNotFoundError as exc:
        raise ValueError(f"required VERSION file missing: {VERSION_RELATIVE_PATH}") from exc
    if actual_version != expected_version:
        raise ValueError(
            f"VERSION mismatch: {VERSION_RELATIVE_PATH} contains {actual_version!r}, "
            f"expected {expected_version!r} from release tag"
        )


def validate_release_tag(
    repo_root: Path,
    tag: str,
    *,
    skip_git: bool = False,
    upstream_ref_prefix: str = DEFAULT_UPSTREAM_REF_PREFIX,
) -> dict[str, str]:
    parsed = parse_ru_tag(tag)
    validate_version_file(repo_root, parsed.version)
    result = {
        "tag": parsed.tag,
        "version": parsed.version,
        "base_tag": parsed.base_tag,
        "ru_iteration": str(parsed.iteration),
    }

    if skip_git:
        return result

    prefix = normalize_ref_prefix(upstream_ref_prefix)
    base_ref = f"{prefix}{parsed.base_tag}"
    release_ref = f"refs/tags/{parsed.tag}"
    base_commit = resolve_commit(repo_root, base_ref)
    release_commit = resolve_commit(repo_root, release_ref)

    ancestry = run_git(
        repo_root,
        ["merge-base", "--is-ancestor", base_commit, release_commit],
        check=False,
    )
    if ancestry.returncode != 0:
        raise ValueError(
            f"official base tag {parsed.base_tag} ({base_commit[:12]}) is not an ancestor "
            f"of {parsed.tag} ({release_commit[:12]}); refuse to publish"
        )

    reachable_stable_tags: list[tuple[tuple[int, int, int], str]] = []
    for version, reachable_tag, reachable_ref in stable_upstream_refs(repo_root, prefix):
        reachable_commit = resolve_commit(repo_root, reachable_ref)
        reachable = run_git(
            repo_root,
            ["merge-base", "--is-ancestor", reachable_commit, release_commit],
            check=False,
        )
        if reachable.returncode == 0:
            reachable_stable_tags.append((version, reachable_tag))
    if not reachable_stable_tags:
        raise ValueError("release commit has no reachable stable tag from the trusted upstream namespace")
    _, latest_reachable_stable_tag = max(reachable_stable_tags)
    if latest_reachable_stable_tag != parsed.base_tag:
        raise ValueError(
            f"newer reachable stable tag {latest_reachable_stable_tag} does not match "
            f"declared base {parsed.base_tag}; refuse to publish"
        )

    result["base_ref"] = base_ref
    result["base_commit"] = base_commit
    result["commit"] = release_commit
    return result


def emit_github_outputs(values: dict[str, str], output_path: str | None = None) -> None:
    destination = output_path or os.environ.get("GITHUB_OUTPUT")
    if not destination:
        return
    with open(destination, "a", encoding="utf-8") as handle:
        for key, value in values.items():
            safe_value = value.replace("\n", "%0A")
            handle.write(f"{key}={safe_value}\n")


def self_test() -> None:
    invalid_tags = [
        "v1.2.3",
        "1.2.3-ru.1",
        "v1.2-ru.1",
        "v1.2.3-ru.0",
        "v1.2.3-ru.01",
        "v1.2.3-rc.1",
        "v1.2.3-ru.1+build",
    ]
    for tag in invalid_tags:
        try:
            parse_ru_tag(tag)
        except ValueError:
            pass
        else:  # pragma: no cover - guarded by explicit failure.
            raise AssertionError(f"invalid tag accepted: {tag}")

    parsed = parse_ru_tag("v1.2.3-ru.4")
    assert parsed.base_tag == "v1.2.3"
    assert parsed.version == "1.2.3-ru.4"
    assert parsed.iteration == 4

    with tempfile.TemporaryDirectory(prefix="ru-release-version-guard-") as tmp:
        repo = Path(tmp)
        version_file = repo / "backend" / "cmd" / "server" / "VERSION"
        version_file.parent.mkdir(parents=True)
        version_file.write_text("1.2.3\n", encoding="utf-8")
        try:
            validate_release_tag(repo, "v1.2.3-ru.4", skip_git=True)
        except ValueError as exc:
            assert "VERSION" in str(exc)
        else:  # pragma: no cover - guarded by explicit failure.
            raise AssertionError("mismatched VERSION accepted")

    with tempfile.TemporaryDirectory(prefix="ru-release-guard-") as tmp:
        repo = Path(tmp)
        run_git(repo, ["init", "-q"])
        run_git(repo, ["config", "user.email", "guard@example.invalid"])
        run_git(repo, ["config", "user.name", "RU Release Guard"])

        version_file = repo / "backend" / "cmd" / "server" / "VERSION"
        version_file.parent.mkdir(parents=True)
        version_file.write_text("1.2.3-ru.1\n", encoding="utf-8")

        (repo / "README.md").write_text("base\n", encoding="utf-8")
        run_git(repo, ["add", "README.md", "backend/cmd/server/VERSION"])
        run_git(repo, ["commit", "-q", "-m", "base"])
        run_git(repo, ["tag", "v1.2.3"])
        run_git(repo, ["update-ref", "refs/upstream-tags/v1.2.3", "HEAD"])

        (repo / "README.md").write_text("ru release\n", encoding="utf-8")
        run_git(repo, ["commit", "-q", "-am", "ru release"])
        run_git(repo, ["tag", "v1.2.3-ru.1"])
        run_git(repo, ["tag", "v9.9.9"])
        run_git(repo, ["branch", "v1.2.3-ru.1", "HEAD~1"])
        ok = validate_release_tag(
            repo,
            "v1.2.3-ru.1",
            upstream_ref_prefix="refs/upstream-tags/",
        )
        assert ok["base_tag"] == "v1.2.3"
        assert len(ok["commit"]) == 40

        (repo / "README.md").write_text("newer upstream content\n", encoding="utf-8")
        run_git(repo, ["commit", "-q", "-am", "upstream v1.2.4"])
        run_git(repo, ["tag", "v1.2.4"])
        run_git(repo, ["update-ref", "refs/upstream-tags/v1.2.4", "HEAD"])
        version_file.write_text("1.2.3-ru.2\n", encoding="utf-8")
        run_git(repo, ["commit", "-q", "-am", "mislabelled ru release"])
        run_git(repo, ["tag", "v1.2.3-ru.2"])
        try:
            validate_release_tag(
                repo,
                "v1.2.3-ru.2",
                upstream_ref_prefix="refs/upstream-tags/",
            )
        except ValueError as exc:
            assert "newer reachable stable tag" in str(exc)
        else:  # pragma: no cover - guarded by explicit failure.
            raise AssertionError("release containing a newer stable base was accepted")

        current_branch = git_output(repo, ["branch", "--show-current"])
        run_git(repo, ["checkout", "--orphan", "upstream-v2"])
        (repo / "README.md").write_text("independent upstream\n", encoding="utf-8")
        run_git(repo, ["add", "README.md"])
        run_git(repo, ["commit", "-q", "-m", "independent upstream"])
        run_git(repo, ["tag", "v2.0.0"])
        run_git(repo, ["update-ref", "refs/upstream-tags/v2.0.0", "HEAD"])
        run_git(repo, ["checkout", "-q", current_branch])
        version_file.write_text("2.0.0-ru.1\n", encoding="utf-8")
        run_git(repo, ["tag", "v2.0.0-ru.1"])
        try:
            validate_release_tag(
                repo,
                "v2.0.0-ru.1",
                upstream_ref_prefix="refs/upstream-tags/",
            )
        except ValueError as exc:
            assert "is not an ancestor" in str(exc)
        else:  # pragma: no cover - guarded by explicit failure.
            raise AssertionError("non-ancestor base tag accepted")

    print("ru_release_guard.py self-test passed")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", default=".", help="Git repository root")
    parser.add_argument("--tag", help="Release tag; defaults to GITHUB_REF_NAME/GITHUB_REF")
    parser.add_argument(
        "--upstream-ref-prefix",
        default=DEFAULT_UPSTREAM_REF_PREFIX,
        help="Trusted namespace containing official stable tag refs",
    )
    parser.add_argument(
        "--skip-git",
        action="store_true",
        help="Only validate the tag format and derived version/base tag",
    )
    parser.add_argument(
        "--emit-github-output",
        action="store_true",
        help="Write tag/version/base_tag/commit values to $GITHUB_OUTPUT",
    )
    parser.add_argument("--self-test", action="store_true", help="Run built-in tests")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.self_test:
        self_test()
        return 0

    try:
        tag = args.tag or infer_tag_from_github_env()
        values = validate_release_tag(
            Path(args.repo_root).resolve(),
            tag,
            skip_git=args.skip_git,
            upstream_ref_prefix=args.upstream_ref_prefix,
        )
    except (subprocess.CalledProcessError, ValueError) as exc:
        if isinstance(exc, subprocess.CalledProcessError):
            message = exc.stderr.strip() or exc.stdout.strip() or str(exc)
        else:
            message = str(exc)
        print(f"RU release guard failed: {message}", file=sys.stderr)
        return 1

    if args.emit_github_output:
        emit_github_outputs(values)

    print("RU release tag validated:")
    for key in ("tag", "version", "base_tag", "ru_iteration", "base_ref", "base_commit", "commit"):
        if key in values:
            print(f"  {key}: {values[key]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
