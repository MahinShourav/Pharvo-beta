"""
Supplier API test (supplier orders are managed via Purchase in this project).
Run from the Backend folder:
    python inventory/test_suppliers.py
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.test import Client
from django.contrib.auth import get_user_model
from inventory.models import Supplier

User = get_user_model()
HOST = "localhost"

PASS = []
FAIL = []


def check(name, condition, detail=""):
    if condition:
        PASS.append(name)
        print(f"OK   - {name}")
    else:
        FAIL.append(name)
        print(f"FAIL - {name} {detail}")


def main():
    client = Client(SERVER_NAME=HOST)

    staff = User.objects.filter(is_staff=True).first()
    if not staff:
        print("FAIL: No staff user found")
        return 1

    client.force_login(staff)
    print(f"Logged in as: {staff.username}\n")

    # Clean leftover test supplier from previous runs
    Supplier.objects.filter(phone="01711009999").delete()

    # ========== Test 1: List suppliers ==========
    resp = client.get("/api/inventory/suppliers/", HTTP_HOST=HOST)
    check("List suppliers endpoint (GET) returns 200",
          resp.status_code == 200,
          f"got {resp.status_code}")

    # ========== Test 2: Create supplier ==========
    payload = {
        "name": "QA Supplier Test",
        "company": "QA Co",
        "contact_person": "QA Person",
        "phone": "01711009999",
        "email": "qa.supplier@example.com",
        "address": "QA Test Address",
        "is_active": True,
    }
    resp = client.post("/api/inventory/suppliers/", data=payload,
                       content_type="application/json", HTTP_HOST=HOST)
    created_ok = resp.status_code in (200, 201)
    check("Create supplier (valid data)", created_ok,
          f"got {resp.status_code}, body={resp.content[:200]}")

    supplier_id = None
    if created_ok:
        data = resp.json()
        supplier_id = data.get("id")
        check("Create response contains id", supplier_id is not None,
              f"data keys={list(data.keys())}")

    # ========== Test 3: Retrieve supplier ==========
    if supplier_id:
        resp = client.get(f"/api/inventory/suppliers/{supplier_id}/", HTTP_HOST=HOST)
        check("Retrieve supplier by ID (GET)",
              resp.status_code == 200,
              f"got {resp.status_code}")

    # ========== Test 4: Reject missing name ==========
    resp = client.post("/api/inventory/suppliers/",
                       data={"phone": "01711009998"},
                       content_type="application/json", HTTP_HOST=HOST)
    check("Reject supplier without required name field",
          resp.status_code == 400,
          f"got {resp.status_code}")

    # ========== Test 5: Update supplier ==========
    if supplier_id:
        resp = client.patch(f"/api/inventory/suppliers/{supplier_id}/",
                            data={"name": "QA Supplier Updated"},
                            content_type="application/json", HTTP_HOST=HOST)
        check("Update supplier (PATCH)",
              resp.status_code in (200, 204),
              f"got {resp.status_code}")

    # ========== Test 6: Unauth blocked ==========
    client.logout()
    resp = client.get("/api/inventory/suppliers/", HTTP_HOST=HOST)
    check("Unauthenticated request blocked (401/403)",
          resp.status_code in (401, 403),
          f"got {resp.status_code}")

    # ========== Cleanup ==========
    if supplier_id:
        Supplier.objects.filter(id=supplier_id).delete()
    Supplier.objects.filter(phone__in=["01711009999", "01711009998"]).delete()
    print("\nCleanup complete.")

    print()
    print(f"Results: {len(PASS)} passed, {len(FAIL)} failed")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
    