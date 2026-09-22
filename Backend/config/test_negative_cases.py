"""
Negative API test — verifies that invalid inputs are rejected.
Run from the Backend folder:
    python config/test_negative_cases.py
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
from inventory.models import Product


print("=" * 70)
print("PHARVO NEGATIVE TESTING")
print("=" * 70)

passed = 0
failed = 0


def check(name, response, expected):
    global passed, failed
    if response.status_code in expected:
        passed += 1
        print(f"PASS: {name} status={response.status_code}")
    else:
        failed += 1
        print(f"FAIL: {name} status={response.status_code} expected={expected}")


# -------------------------------------------------
# INVALID LOGIN
# -------------------------------------------------
anon = APIClient(SERVER_NAME="localhost")

response = anon.post(
    "/api/auth/login/",
    {"username": "__invalid_user__", "password": "wrong-password"},
    format="json",
)
check("Invalid login rejected", response, (400, 401))


# -------------------------------------------------
# STAFF USER
# -------------------------------------------------
staff = (
    User.objects.filter(role__in=["admin", "pharmacist", "staff"], is_active=True).first()
    or User.objects.filter(is_staff=True).first()
)

if not staff:
    print("ERROR: No staff user found.")
    sys.exit(1)

client = APIClient(SERVER_NAME="localhost")
client.force_authenticate(user=staff)


# -------------------------------------------------
# EMPTY CHECKOUT
# -------------------------------------------------
response = client.post(
    "/api/pos/checkout/",
    {
        "customer": None,
        "items": [],
        "discount": "0.00",
        "payments": [],
    },
    format="json",
)
check("Empty checkout rejected", response, (400,))


# -------------------------------------------------
# PRODUCT-SPECIFIC NEGATIVE TESTS
# -------------------------------------------------
product = Product.objects.filter(stock_quantity__gt=0).first()

if product:
    # Quantity = 0
    response = client.post(
        "/api/pos/checkout/",
        {
            "customer": None,
            "items": [{
                "product": product.id,
                "quantity": 0,
                "unit": "pc",
                "unit_price": str(product.unit_price),
            }],
            "discount": "0.00",
            "payments": [{"method": "cash", "amount": "1.00"}],
        },
        format="json",
    )
    check("Zero quantity rejected", response, (400,))

    # Payment = 0
    response = client.post(
        "/api/pos/checkout/",
        {
            "customer": None,
            "items": [{
                "product": product.id,
                "quantity": 1,
                "unit": "pc",
                "unit_price": str(product.unit_price),
            }],
            "discount": "0.00",
            "payments": [{"method": "cash", "amount": "0.00"}],
        },
        format="json",
    )
    check("Zero payment rejected", response, (400,))
else:
    print("WARN - No product with stock found; skipping quantity/payment tests")


# -------------------------------------------------
# INVALID IDs
# -------------------------------------------------
response = client.get("/api/inventory/products/999999999/")
check("Invalid product ID returns not found", response, (404,))

response = client.get("/api/customers/999999999/")
check("Invalid customer ID returns not found", response, (404,))


# -------------------------------------------------
# EMPTY PURCHASE
# -------------------------------------------------
response = client.post("/api/purchases/", {}, format="json")
check("Empty purchase rejected", response, (400,))


print("")
print("=" * 70)
print(f"RESULT: {passed} passed, {failed} failed")
print("=" * 70)

sys.exit(1 if failed else 0)