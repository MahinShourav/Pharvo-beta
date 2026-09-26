"""
Error handling test — verifies that the API returns proper JSON errors
for common failure modes.
Run from the Backend folder:
    python config/test_error_handling.py
"""
import os
import sys

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from rest_framework.test import APIClient
from accounts.models import User


print("=" * 70)
print("PHARVO ERROR HANDLING TEST")
print("=" * 70)

passed = 0
failed = 0


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"PASS: {name}")
    else:
        failed += 1
        print(f"FAIL: {name}")
        if detail:
            print(f"      {detail}")


def is_json_response(resp):
    """Return True if the response body looks like JSON."""
    content_type = resp.get("Content-Type", "").lower()
    if "application/json" in content_type:
        return True
    # Fallback: try parsing the body
    try:
        resp.json()
        return True
    except Exception:
        return False


# -------------------------------------------------
# SETUP
# -------------------------------------------------
staff = (
    User.objects.filter(role__in=["admin", "pharmacist", "staff"], is_active=True).first()
    or User.objects.filter(is_staff=True).first()
)

if not staff:
    print("FAIL: No staff user available")
    sys.exit(1)

client = APIClient(SERVER_NAME="localhost")
client.force_authenticate(user=staff)


# -------------------------------------------------
# 400 — Validation Error (empty checkout)
# -------------------------------------------------
resp = client.post("/api/pos/checkout/", {}, format="json")
check("Empty checkout returns 400", resp.status_code == 400,
      f"got {resp.status_code}")
check("Validation error returns JSON", is_json_response(resp),
      f"content-type={resp.get('Content-Type')}")


# -------------------------------------------------
# 400 — Malformed JSON
# -------------------------------------------------
resp = client.generic(
    "POST",
    "/api/pos/checkout/",
    '{"items":',
    content_type="application/json",
)
check("Malformed JSON returns 400", resp.status_code == 400,
      f"got {resp.status_code}")


# -------------------------------------------------
# 404 — Not Found
# -------------------------------------------------
resp = client.get("/api/inventory/products/999999999/")
check("Missing product returns 404", resp.status_code == 404,
      f"got {resp.status_code}")
check("404 returns JSON", is_json_response(resp),
      f"content-type={resp.get('Content-Type')}")


resp = client.get("/api/customers/999999999/")
check("Missing customer returns 404", resp.status_code == 404,
      f"got {resp.status_code}")


# -------------------------------------------------
# 403 — Permission Denied (customer hitting staff endpoint)
# -------------------------------------------------
customer = User.objects.filter(role="customer", is_active=True).first()

if customer:
    cust_client = APIClient(SERVER_NAME="localhost")
    cust_client.force_authenticate(user=customer)

    resp = cust_client.get("/api/dashboard/")
    check("Customer hitting dashboard returns 403", resp.status_code == 403,
          f"got {resp.status_code}")
    check("403 returns JSON", is_json_response(resp),
          f"content-type={resp.get('Content-Type')}")
else:
    print("WARN - No customer user found; skipping 403 tests")


# -------------------------------------------------
# 401 — Unauthenticated
# -------------------------------------------------
anon = APIClient(SERVER_NAME="localhost")
resp = anon.get("/api/inventory/")
check("Unauthenticated request returns 401", resp.status_code == 401,
      f"got {resp.status_code}")
check("401 returns JSON", is_json_response(resp),
      f"content-type={resp.get('Content-Type')}")


# -------------------------------------------------
# 405 — Method Not Allowed
# -------------------------------------------------
resp = client.delete("/api/reports/sales/")
check("DELETE on a list endpoint returns 405",
      resp.status_code in (403, 405),
      f"got {resp.status_code}")


print("")
print("=" * 70)
print(f"RESULT: {passed} passed, {failed} failed")
print("=" * 70)

sys.exit(1 if failed else 0)