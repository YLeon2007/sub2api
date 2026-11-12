#!/usr/bin/env python3
"""Verify the scanner's complete module-content identity and active Go compiler."""
import argparse
import hashlib
from pathlib import Path
import re
import subprocess

EXPECTED_MODULES = {
    "golang.org/x/vuln": ("v1.6.0", "h1:FeMO9Rm/HwyduOztbvKcOw+zvDEPr4I4aQNSfevFcKY="),
    "golang.org/x/mod": ("v0.38.0", "h1:MECBjubtXD7yj4HrhIUcywNaGeNVUdfVnxmPajOk4yk="),
    "golang.org/x/sync": ("v0.22.0", "h1:SZjpbeLmrCk4xhRSZFNZW5gFUeCeFgjekvI/+gfScek="),
    "golang.org/x/telemetry": ("v0.0.0-20260708182218-49f421fb7959", "h1:RJhm5l6Fo4rmEIcndxDllNhhf/fAx8qIm4t6A7vpm2A="),
    "golang.org/x/tools": ("v0.48.0", "h1:3+hClM1aLL5mjMKm5ovokw9epgRXPuu2tILgismM6RE="),
}
EXPECTED_COMMAND = "golang.org/x/vuln/cmd/govulncheck"


def verify_identity(text: str, compiler: str) -> dict:
    lines = text.splitlines()
    if not re.fullmatch(r"go[0-9]+\.[0-9]+\.[0-9]+", compiler):
        raise ValueError("invalid active Go compiler identity")
    if not lines or not lines[0].endswith(": " + compiler):
        raise ValueError("scanner compiler differs from active Go compiler")
    modules = {}
    commands = []
    for line in lines[1:]:
        fields = line.split("\t")
        if len(fields) < 3 or fields[0] != "":
            raise ValueError("malformed build identity record")
        kind = fields[1]
        if kind == "path" and len(fields) == 3:
            commands.append(fields[2])
        elif kind in ("mod", "dep") and len(fields) == 5:
            name, version, checksum = fields[2:]
            if name in modules or (kind == "mod") != (name == "golang.org/x/vuln"):
                raise ValueError("duplicate or unexpected main module")
            modules[name] = (version, checksum)
        elif kind == "build" and len(fields) == 3 and "=" in fields[2]:
            continue
        else:
            raise ValueError("unsupported identity record or module replacement")
    if commands != [EXPECTED_COMMAND] or modules != EXPECTED_MODULES:
        raise ValueError("scanner module version/content identity mismatch")
    return {"compiler": compiler, "modules": modules}


def identity_fixture(compiler: str) -> str:
    rows = ["/private/govulncheck: " + compiler, "\tpath\t" + EXPECTED_COMMAND]
    for name, (version, checksum) in EXPECTED_MODULES.items():
        kind = "mod" if name == "golang.org/x/vuln" else "dep"
        rows.append(f"\t{kind}\t{name}\t{version}\t{checksum}")
    return "\n".join(rows) + "\n"


def self_test() -> None:
    fixture = identity_fixture("go1.27.0")
    verify_identity(fixture, "go1.27.0")
    bad = [
        "\n" + fixture,
        fixture.replace("govulncheck\n", "other\n"),
        fixture.replace("v1.6.0", "v1.6.1"),
        fixture.replace(EXPECTED_MODULES["golang.org/x/vuln"][1], "h1:bad"),
        fixture.replace(EXPECTED_MODULES["golang.org/x/tools"][1], "h1:bad"),
        fixture + fixture.splitlines()[2] + "\n",
        fixture + "\tdep\tunexpected.invalid/module\tv1.0.0\th1:bad\n",
        fixture + "\t=>\t./local\n",
        fixture.replace("go1.27.0", "go1.26.5"),
    ]
    for item in bad:
        try:
            verify_identity(item, "go1.27.0")
        except ValueError:
            continue
        raise AssertionError("invalid scanner identity was accepted")
    print("GOVULNCHECK_IDENTITY_SELF_TEST_PASS")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if args.binary is None:
        parser.error("--binary is required")
    go_version = subprocess.check_output(["go", "version"], text=True)
    match = re.fullmatch(r"go version (go[0-9]+\.[0-9]+\.[0-9]+) [^\r\n]+\n?", go_version)
    if match is None:
        raise ValueError("unrecognized active Go version")
    text = subprocess.check_output(["go", "version", "-m", str(args.binary)], text=True)
    verify_identity(text, match.group(1))
    print("GOVULNCHECK_CONTENT_IDENTITY_PASS sha256=" + hashlib.sha256(args.binary.read_bytes()).hexdigest())


if __name__ == "__main__":
    main()
