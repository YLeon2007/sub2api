"""Content identity tests for the release vulnerability scanner."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import unittest

VERIFIER = Path(__file__).with_name("validate_govulncheck_identity.py")


class GovulncheckIdentityTests(unittest.TestCase):
    def test_content_identity_self_test(self):
        result = subprocess.run([sys.executable, str(VERIFIER), "--self-test"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("GOVULNCHECK_IDENTITY_SELF_TEST_PASS", result.stdout)

    def test_checksum_mismatch_is_rejected(self):
        if not VERIFIER.exists():
            self.fail("govulncheck content identity verifier is missing")
        spec = importlib.util.spec_from_file_location("govuln_identity", VERIFIER)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        fixture = module.identity_fixture("go1.27.0")
        fixture = fixture.replace(module.EXPECTED_MODULES["golang.org/x/vuln"][1], "h1:incorrect")
        with self.assertRaises(ValueError):
            module.verify_identity(fixture, "go1.27.0")


if __name__ == "__main__":
    unittest.main()
