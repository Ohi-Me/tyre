"""pytest configuration for TYRE AI gateway tests."""
import os
import sys
from pathlib import Path

# Add the app directory to sys.path so tests can import app.*
GATEWAY_ROOT = Path(__file__).parent
sys.path.insert(0, str(GATEWAY_ROOT))

# Set test env vars
os.environ.setdefault("NODE_ENV", "test")
os.environ.setdefault("TYRE_AGENT_TIER", "Y1")  # Y1 agents only in tests
os.environ.setdefault("GROQ_API_KEY", "test_key_for_ci")
os.environ.setdefault("DATABASE_URL", "file:./db/test.db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/15")  # DB 15 for tests
# PII encryption key for hash_pii tests (32-byte base64 — matches the format
# the BFF's Prisma extension expects). Setting it here so PIIEncryptor.hash_pii
# doesn't raise "TYRE_PII_ENCRYPTION_KEY not set" in the security tests.
os.environ.setdefault(
    "TYRE_PII_ENCRYPTION_KEY",
    "dGVzdC1waWktZW5jcnlwdGlvbi1rZXktZm9yLWNpLTEyOC1ieXRlcw==",
)
