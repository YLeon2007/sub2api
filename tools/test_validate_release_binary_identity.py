#!/usr/bin/env python3
from __future__ import annotations

import unittest

from validate_release_binary_identity import validate_identity


class ReleaseBinaryIdentityTests(unittest.TestCase):
    VERSION = "0.1.177-ru.1"
    COMMIT = "a" * 40
    VALID = (
        "2026-08-18T05:25:44.123+03:00\tINFO\tstdlog\t"
        f"Sub2API {VERSION} (commit: {COMMIT}, built: 2026-08-18T02:20:01Z)\t"
        '{"service":"sub2api","env":"bootstrap","legacy_stdlog":true}'
    )

    def test_accepts_complete_structured_identity(self) -> None:
        validate_identity(self.VALID, self.VERSION, self.COMMIT)

    def test_rejects_substring_matches_and_malformed_metadata(self) -> None:
        mutations = (
            "prefix " + self.VALID,
            self.VALID + " suffix",
            self.VALID.replace(self.VERSION, "0.1.177-ru.2"),
            self.VALID.replace(self.COMMIT, "b" * 40),
            self.VALID.replace("2026-08-18T02:20:01Z", "2026-08-18T02:20:01"),
            self.VALID.replace("2026-08-18T02:20:01Z", "2026-02-30T02:20:01Z"),
            self.VALID.replace('"env":"bootstrap"', '"env":"production"'),
            self.VALID.replace('"legacy_stdlog":true', '"legacy_stdlog":false'),
            self.VALID + "\n" + self.VALID,
        )
        for mutation in mutations:
            with self.subTest(mutation=mutation):
                with self.assertRaises(ValueError):
                    validate_identity(mutation, self.VERSION, self.COMMIT)

    def test_rejects_malformed_expectations(self) -> None:
        with self.assertRaises(ValueError):
            validate_identity(self.VALID, "0.1.177-ru.01", self.COMMIT)
        with self.assertRaises(ValueError):
            validate_identity(self.VALID, self.VERSION, "A" * 40)


if __name__ == "__main__":
    unittest.main()
