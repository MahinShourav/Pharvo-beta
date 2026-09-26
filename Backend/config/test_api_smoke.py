"""
API smoke test — hits every major endpoint as staff and verifies
that anonymous requests are blocked.
Run from the Backend folder:
    python config/test_api_smoke.py
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
print("PHARVO API SMOKE TEST")
print("=" * 70)


staff = (
    User.objects.filter(role__in=["admin", "pharmacist", "staff"], is_active=True).first()
    or User.objects.filter(is_superuser=True, is_active=True).first()
)

if not staff:
    print("FAIL: No staff/admin user available.")
    sys.exit(1)

print(f"Authenticated as: {staff.username}\n")

# SERVER_NAME='localhost' makes APIClient send HTTP_HOST: localhost,
# which is allowed in ALLOWED_HOSTS.
client = APIClient(SERVER_NAME="localhost")
client.force_authenticate(user=staff)


endpoints = [
    "/api/auth/me/",
    "/api/inventory/",
    "/api/inventory/products/",
    "/api/inventory/interactions/",
    "/api/customers/",
    "/api/sales/",
    "/api/purchases/",
    "/api/dashboard/",
    "/api/reports/sales/",
    "/api/reports/purchases/",
    "/api/reports/stock/",
    "/api/reports/customers/",
    "/api/notifications/",
    "/api/notifications/unread-count/",
    "/api/crm/reminders/",
]

passed = 0
failed = 0

for endpoint in endpoints:
    response = client.get(endpoint)
    if response.status_code == 200:
        passed += 1
        print(f"PASS: GET {endpoint:<40} {response.status_code}")
    else:
        failed += 1
        print(f"FAIL: GET {endpoint:<40} {response.status_code}")


print("\nTesting anonymous protection...")

anonymous = APIClient(SERVER_NAME="localhost")

protected_endpoints = [
    "/api/inventory/",
    "/api/sales/",
    "/api/dashboard/",
    "/api/notifications/",
]

for endpoint in protected_endpoints:
    response = anonymous.get(endpoint)
    if response.status_code in (401, 403):
        passed += 1
        print(f"PASS: Anonymous blocked {endpoint} ({response.status_code})")
    else:
        failed += 1
        print(f"FAIL: Anonymous accessed {endpoint} ({response.status_code})")


print("\n" + "=" * 70)
print(f"RESULT: {passed} passed, {failed} failed")
print("=" * 70)

sys.exit(1 if failed else 0)