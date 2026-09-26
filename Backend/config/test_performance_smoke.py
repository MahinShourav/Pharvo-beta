"""
Performance smoke test — 10 requests per endpoint.
Run from the Backend folder:
    python config/test_performance_smoke.py
"""
import os
import sys
import time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from rest_framework.test import APIClient
from accounts.models import User


print("=" * 70)
print("PHARVO PERFORMANCE SMOKE TEST")
print("=" * 70)


staff = (
    User.objects.filter(role__in=["admin", "pharmacist", "staff"], is_active=True).first()
    or User.objects.filter(is_staff=True).first()
)

if not staff:
    print("FAIL: No staff account found.")
    sys.exit(1)

print(f"Using user: {staff.username}\n")

# SERVER_NAME fixes the DisallowedHost error we saw in Phase 22
client = APIClient(SERVER_NAME="localhost")
client.force_authenticate(user=staff)


ENDPOINTS = [
    "/api/dashboard/",
    "/api/inventory/",
    "/api/sales/",
    "/api/customers/",
]

REQUESTS_PER_ENDPOINT = 10
AVG_LIMIT_MS = 1500
P95_LIMIT_MS = 3000

passed = 0
failed = 0

for endpoint in ENDPOINTS:
    # Warm-up request
    client.get(endpoint)

    timings = []
    bad_status = 0

    for _ in range(REQUESTS_PER_ENDPOINT):
        started = time.perf_counter()
        response = client.get(endpoint)
        elapsed = (time.perf_counter() - started) * 1000
        timings.append(elapsed)
        if response.status_code != 200:
            bad_status += 1

    timings.sort()
    average = sum(timings) / len(timings)
    p95_index = max(0, int(len(timings) * 0.95) - 1)
    p95 = timings[p95_index]

    print(endpoint)
    print(f"  Requests : {REQUESTS_PER_ENDPOINT}")
    print(f"  Average  : {average:.2f} ms")
    print(f"  P95      : {p95:.2f} ms")
    print(f"  Errors   : {bad_status}")

    condition = (
        bad_status == 0
        and average <= AVG_LIMIT_MS
        and p95 <= P95_LIMIT_MS
    )

    if condition:
        passed += 1
        print("  STATUS   : PASS\n")
    else:
        failed += 1
        print("  STATUS   : FAIL\n")


print("=" * 70)
print(f"RESULT: {passed} passed, {failed} failed")
print("=" * 70)
print("")
print("NOTE: This is a local performance smoke test, not a production load test.")

sys.exit(1 if failed else 0)