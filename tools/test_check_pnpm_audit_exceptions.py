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
        payloads = [
            {},
            {"error": {"code": "ERR_PNPM_META_FETCH_FAIL", "summary": "network failure"}},
            {"metadata": {"vulnerabilities": {"high": 0, "critical": 0}}},
        ]
        for payload in payloads:
            with self.subTest(payload=payload):
                result = self.run_checker(payload)
                self.assertNotEqual(result.returncode, 0, result.stdout)


if __name__ == "__main__":
    unittest.main()
