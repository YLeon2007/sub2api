#!/usr/bin/env python3
"""Fail-closed validator for the complete structured Sub2API --version record."""
from __future__ import annotations

import argparse
import datetime
import json
import re
import stat
import subprocess
import tempfile
from pathlib import Path

VERSION_RE = re.compile(
    r"(?:0|[1-9][0-9]*)[.](?:0|[1-9][0-9]*)[.](?:0|[1-9][0-9]*)-ru[.][1-9][0-9]*"
)
COMMIT_RE = re.compile(r"[0-9a-f]{40}")
TIMESTAMP = (
    r"[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T"
    r"(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]"
    r"(?:[.][0-9]{1,9})?(?:Z|[+-](?:[01][0-9]|2[0-3]):?[0-5][0-9])"
)
EXPECTED_CONTEXT = {"service": "sub2api", "env": "bootstrap", "legacy_stdlog": True}


def _strict_json_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate context key: {key}")
        result[key] = value
    return result


def validate_identity(identity: str, version: str, commit: str) -> None:
    if VERSION_RE.fullmatch(version) is None:
        raise ValueError("malformed expected RU version")
    if COMMIT_RE.fullmatch(commit) is None:
        raise ValueError("malformed expected commit")

    match = re.fullmatch(
        rf"(?P<logged>{TIMESTAMP})\tINFO\tstdlog\t"
        + re.escape(f"Sub2API {version} (commit: {commit}, built: ")
        + rf"(?P<built>{TIMESTAMP})\)\t(?P<context>\{{[^\r\n]*\}})",
        identity,
    )
    if match is None:
        raise ValueError("binary identity does not match the complete structured grammar")

    try:
        datetime.datetime.fromisoformat(match.group("logged").replace("Z", "+00:00"))
        datetime.datetime.fromisoformat(match.group("built").replace("Z", "+00:00"))
        context = json.loads(match.group("context"), object_pairs_hook=_strict_json_object)
    except (ValueError, json.JSONDecodeError) as exc:
        raise ValueError("binary identity contains malformed timestamp/context") from exc
    if (
        set(context) != set(EXPECTED_CONTEXT)
        or type(context.get("service")) is not str
        or type(context.get("env")) is not str
        or type(context.get("legacy_stdlog")) is not bool
        or context != EXPECTED_CONTEXT
    ):
        raise ValueError("binary identity context is not exact")


def validate_binary(binary: Path, version: str, commit: str) -> str:
    metadata = binary.stat()
    if not stat.S_ISREG(metadata.st_mode):
        raise ValueError("binary path is not a regular file")
    completed = subprocess.run(
        [str(binary), "--version"],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=15,
    )
    if completed.returncode != 0:
        raise ValueError(f"binary --version exited {completed.returncode}")
    raw_identity = completed.stdout
    if raw_identity.endswith("\r\n"):
        identity = raw_identity[:-2]
    elif raw_identity.endswith("\n"):
        identity = raw_identity[:-1]
    else:
        identity = raw_identity
    validate_identity(identity, version, commit)
    return identity


def self_test() -> None:
    version = "0.1.999-ru.1"
    commit = "a" * 40
    valid = (
        "2026-08-18T05:25:44.123+03:00\tINFO\tstdlog\t"
        f"Sub2API {version} (commit: {commit}, built: 2026-08-18T02:20:01Z)\t"
        '{"service":"sub2api","env":"bootstrap","legacy_stdlog":true}'
    )
    validate_identity(valid, version, commit)
    mutations = (
        "prefix " + valid,
        valid + " suffix",
        valid.replace(version, "0.1.999-ru.2"),
        valid.replace(commit, "b" * 40),
        valid.replace("2026-08-18T02:20:01Z", "2026-08-18T02:20:01"),
        valid.replace("2026-08-18T02:20:01Z", "2026-02-30T02:20:01Z"),
        valid.replace('"env":"bootstrap"', '"env":"production"'),
        valid.replace('"legacy_stdlog":true', '"legacy_stdlog":1'),
        valid.replace('"service":"sub2api"', '"service":"attacker","service":"sub2api"'),
        valid + "\n" + valid,
    )
    for mutation in mutations:
        try:
            validate_identity(mutation, version, commit)
        except ValueError:
            continue
        raise AssertionError("binary identity mutation was accepted")

    with tempfile.TemporaryDirectory() as tmp:
        binary = Path(tmp) / "identity-binary"
        outputs = (valid + "\n", "\n" + valid, " " + valid, valid + " \n", valid + "\n\n")
        for index, output in enumerate(outputs):
            binary.write_text(
                "#!/usr/bin/env python3\nimport sys\nsys.stdout.write(" + json.dumps(output) + ")\n",
                encoding="utf-8",
            )
            binary.chmod(0o755)
            if index == 0:
                validate_binary(binary, version, commit)
                continue
            try:
                validate_binary(binary, version, commit)
            except ValueError:
                continue
            raise AssertionError("binary stdout normalization bypass was accepted")
    print("validate_release_binary_identity.py self-test passed")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--binary", type=Path)
    parser.add_argument("--version")
    parser.add_argument("--commit")
    args = parser.parse_args()
    if args.self_test:
        if args.binary is not None or args.version is not None or args.commit is not None:
            parser.error("--self-test cannot be combined with binary identity arguments")
        self_test()
        return 0
    if args.binary is None or args.version is None or args.commit is None:
        parser.error("--binary, --version and --commit are required")
    identity = validate_binary(args.binary, args.version, args.commit)
    print(identity)
    print("release binary identity passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
