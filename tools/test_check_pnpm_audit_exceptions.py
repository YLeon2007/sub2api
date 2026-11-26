import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CHECKER = ROOT / "tools" / "check_pnpm_audit_exceptions.py"
EXCEPTIONS = ROOT / ".github" / "audit-exceptions.yml"


class AuditPayloadContractTests(unittest.TestCase):
    def run_checker(self, payload: object) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as directory:
            audit = Path(directory) / "audit.json"
            audit.write_text(json.dumps(payload), encoding="utf-8")
            return subprocess.run(
                [sys.executable, str(CHECKER), "--audit", str(audit), "--exceptions", str(EXCEPTIONS)],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

    def test_rejects_empty_transport_error_and_metadata_only_payloads(self) -> None:
        counts = {"info": 0, "low": 0, "moderate": 0, "high": 1, "critical": 0}
        payloads = [
            {},
            {"error": {"code": "ERR_PNPM_META_FETCH_FAIL", "summary": "network failure"}},
            {"metadata": {"vulnerabilities": {"high": 0, "critical": 0}}},
            {"advisories": {}, "metadata": {"vulnerabilities": counts}},
            {"vulnerabilities": {}, "metadata": {"vulnerabilities": counts}},
            {"vulnerabilities": {"foo": {"severity": "high", "via": []}}, "metadata": {"vulnerabilities": counts}},
            {"advisories": {"one": {"severity": "low"}}, "metadata": {"vulnerabilities": counts}},
            {"advisories": {"one": {"severity": "high"}}, "metadata": {"vulnerabilities": {**counts, "high": 2}}},
            {"advisories": {"one": "bad"}, "metadata": {"vulnerabilities": counts}},
        ]
        for payload in payloads:
            with self.subTest(payload=payload):
                result = self.run_checker(payload)
                self.assertNotEqual(result.returncode, 0, result.stdout)

    def test_rejects_advisory_with_missing_package_name(self) -> None:
        counts = {"info": 0, "low": 0, "moderate": 0, "high": 1, "critical": 0}
        for name in (None, "", "   "):
            entry = {"severity": "high", "github_advisory_id": "GHSA-test-missing-package"}
            if name is not None:
                entry["module_name"] = name
            payload = {"advisories": {"one": entry}, "metadata": {"vulnerabilities": counts}}
            with self.subTest(package=name):
                result = self.run_checker(payload)
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertIn("package", result.stderr.lower())

    def test_accepts_consistent_zero_findings(self) -> None:
        counts = {level: 0 for level in ("info", "low", "moderate", "high", "critical")}
        result = self.run_checker({"advisories": {}, "metadata": {"vulnerabilities": counts}})
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
