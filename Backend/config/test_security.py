"""
Security / authorization test.
Run from the Backend folder:
    python config/test_security.py
"""
import os
import sys
import uuid

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.db import transaction
from rest_framework.test import APIClient

from accounts.models import User
from inventory.models import Product


print("=" * 72)
print("PHARVO SECURITY / AUTHORIZATION TEST")
print("=" * 72)

passed = 0
failed = 0


def security_check(name, actual, expected, severity="HIGH"):
    global passed, failed
    if actual in expected:
        passed += 1
        print(f"PASS: {name} status={actual}")
    else:
        failed += 1
        print(f"FAIL: {name}")
        print(f"      status={actual}, expected={expected}")
        print(f"      Severity: {severity}")


try:
    with transaction.atomic():

        # -----------------------------------------
        # ANONYMOUS TESTS
        # -----------------------------------------
        anonymous = APIClient(SERVER_NAME="localhost")

        protected = [
            "/api/inventory/",
            "/api/sales/",
            "/api/dashboard/",
            "/api/customers/",
            "/api/notifications/",
        ]

        for endpoint in protected:
            response = anonymous.get(endpoint)
            security_check(
                f"Anonymous blocked from {endpoint}",
                response.status_code,
                (401, 403),
                "CRITICAL",
            )

        # -----------------------------------------
        # CUSTOMER ACCOUNT
        # -----------------------------------------
        customer = User.objects.filter(role="customer", is_active=True).first()

        if not customer:
            customer = User.objects.create_user(
                username="__qa_security_customer__" + uuid.uuid4().hex[:6],
                password="QaSecurity123!",
                role="customer",
                is_active=True,
            )

        customer_client = APIClient(SERVER_NAME="localhost")
        customer_client.force_authenticate(user=customer)

        # POS checkout blocked
        response = customer_client.post("/api/pos/checkout/", {}, format="json")
        security_check(
            "Customer blocked from POS checkout",
            response.status_code,
            (403,),
            "CRITICAL",
        )

        # Dashboard blocked
        response = customer_client.get("/api/dashboard/")
        security_check(
            "Customer blocked from dashboard",
            response.status_code,
            (403,),
        )

        # Notifications blocked
        response = customer_client.get("/api/notifications/")
        security_check(
            "Customer blocked from staff notifications",
            response.status_code,
            (403,),
        )

        # Customer management blocked
        response = customer_client.get("/api/customers/")
        security_check(
            "Customer blocked from CRM customer list",
            response.status_code,
            (403,),
            "CRITICAL",
        )

        # -----------------------------------------
        # INVENTORY CREATE
        # -----------------------------------------
        unique_barcode = "QA-SEC-" + uuid.uuid4().hex[:12]

        response = customer_client.post(
            "/api/inventory/products/",
            {
                "name": "QA Security Medicine",
                "brand": "QA",
                "barcode": unique_barcode,
                "unit_price": "10.00",
                "cost_price": "5.00",
                "stock_quantity": 10,
                "reorder_level": 2,
                "is_active": True,
                "description": "Security test",
                "is_sensitive": False,
            },
            format="json",
        )
        security_check(
            "Customer cannot create inventory products",
            response.status_code,
            (403,),
            "CRITICAL",
        )

        # -----------------------------------------
        # INVENTORY UPDATE
        # -----------------------------------------
        product = Product.objects.first()

        if product:
            response = customer_client.patch(
                f"/api/inventory/products/{product.id}/",
                {"name": product.name + " SECURITY TEST"},
                format="json",
            )
            security_check(
                "Customer cannot modify inventory",
                response.status_code,
                (403,),
                "CRITICAL",
            )

        # -----------------------------------------
        # SALES / PURCHASE PRIVACY
        # -----------------------------------------
        response = customer_client.get("/api/sales/")
        security_check(
            "Customer cannot view complete staff sales list",
            response.status_code,
            (403,),
            "CRITICAL",
        )

        response = customer_client.get("/api/purchases/")
        security_check(
            "Customer cannot view complete purchase list",
            response.status_code,
            (403,),
            "CRITICAL",
        )

        # -----------------------------------------
        # PUBLIC ADMIN SIGNUP
        # -----------------------------------------
        signup_client = APIClient(SERVER_NAME="localhost")

        email = f"__qa_fake_admin_{uuid.uuid4().hex[:6]}@example.com"

        response = signup_client.post(
            "/api/auth/signup/",
            {
                "full_name": "QA Security",
                "email": email,
                "password": "QaSecurity123!",
                "confirm_password": "QaSecurity123!",
                "role": "admin",
            },
            format="json",
        )
        security_check(
            "Public signup cannot create admin role",
            response.status_code,
            (400, 403),
            "CRITICAL",
        )

        transaction.set_rollback(True)

except Exception as exc:
    print(f"\nERROR DURING SECURITY TEST: {exc}")
    sys.exit(1)


print("")
print("=" * 72)
print(f"RESULT: {passed} passed, {failed} failed")
print("=" * 72)

if failed:
    print("\nSECURITY STATUS: ACTION REQUIRED")
    print("Review FAIL results before considering the application release-ready.")
else:
    print("\nSECURITY STATUS: PASS")

sys.exit(1 if failed else 0)