"""
Standalone customer API test.
Run from the Backend folder:
    python customers/test_customers.py
"""
import os
import sys
import django

# Setup Django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.test import Client
from django.contrib.auth import get_user_model

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
        print("No staff user found.")
        return 1

    client.force_login(staff)
    print(f"Logged in as: {staff.username}\n")

    # 1. List customers
    resp = client.get("/api/customers/", HTTP_HOST=HOST)
    check("List customers endpoint (GET)", resp.status_code == 200,
          f"got {resp.status_code}")

    # 2. Create customer with valid data
    payload = {
        "name": "QA Test Customer",
        "phone": "01711000001",
        "email": "qa.customer@example.com",
        "address": "123 QA Street, Test City",
    }
    resp = client.post("/api/customers/", data=payload,
                       content_type="application/json",
                       HTTP_HOST=HOST)
    created_ok = resp.status_code in (200, 201)
    check("Create customer (valid data)", created_ok,
          f"got {resp.status_code}, body={resp.content[:200]}")

    customer_id = None
    if created_ok:
        try:
            data = resp.json()
            customer_id = data.get("id")
            check("Response has membership tier field",
                  "membership_tier" in data or "tier" in data,
                  f"keys={list(data.keys())}")
            check("Response has loyalty points field",
                  "loyalty_points" in data or "points" in data,
                  f"keys={list(data.keys())}")
        except Exception as e:
            check("Parse create response", False, str(e))

    # 3. Reject customer without required fields (no name)
    resp = client.post("/api/customers/",
                       data={"phone": "01711000099"},
                       content_type="application/json",
                       HTTP_HOST=HOST)
    check("Reject customer without required fields",
          resp.status_code == 400,
          f"got {resp.status_code}")

    # 4. Reject customer missing the email field (email is required by this API)
    resp = client.post("/api/customers/",
                       data={
                           "name": "QA NoEmail",
                           "phone": "01711000002",
                           "address": "456 QA Ave",
                       },
                       content_type="application/json",
                       HTTP_HOST=HOST)
    check("Reject customer missing email field",
          resp.status_code == 400,
          f"got {resp.status_code}, body={resp.content[:200]}")

    # 5. Reject blank email (API validation)
    resp = client.post("/api/customers/",
                       data={
                           "name": "QA BlankEmail",
                           "phone": "01711000004",
                           "email": "",
                           "address": "789 QA Blvd",
                       },
                       content_type="application/json",
                       HTTP_HOST=HOST)
    check("Reject blank email (API validation)",
          resp.status_code == 400,
          f"got {resp.status_code}")

    # 6. Update existing customer
    if customer_id:
        resp = client.patch(f"/api/customers/{customer_id}/",
                            data={"name": "QA Updated Customer"},
                            content_type="application/json",
                            HTTP_HOST=HOST)
        check("Update customer (PATCH)",
              resp.status_code in (200, 201, 204),
              f"got {resp.status_code}")

    # 7. Cleanup
    from customers.models import Customer
    for phone in ["01711000001", "01711000002", "01711000004", "01711000099"]:
        Customer.objects.filter(phone=phone).delete()

    print()
    print(f"Results: {len(PASS)} passed, {len(FAIL)} failed")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())
    