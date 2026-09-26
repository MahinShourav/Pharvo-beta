"""
Boundary value test.
Run from the Backend folder:
    python config/test_boundaries.py
"""
import os
import sys
from decimal import Decimal

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from accounts.serializers import SignupSerializer
from inventory.models import Product
from inventory.serializers import ProductSerializer
from pos.serializers import PosCheckoutSerializer


print("=" * 70)
print("PHARVO BOUNDARY VALUE TESTING")
print("=" * 70)

passed = 0
failed = 0


def result(name, condition, detail=""):
    global passed, failed
    if condition:
        passed += 1
        print(f"PASS: {name}")
    else:
        failed += 1
        print(f"FAIL: {name} {detail}")


# -------------------------------------------------
# PASSWORD BOUNDARY (actual min_length = 6)
# -------------------------------------------------
def make_signup(password):
    return SignupSerializer(data={
        "full_name": "QA Boundary",
        "email": f"qa_boundary_{len(password)}_{password[:3]}@example.com",
        "password": password,
        "confirm_password": password,
        "role": "customer",
    })


result("5-character password rejected (min=6)",
       not make_signup("12345").is_valid())
result("6-character password accepted",
       make_signup("123456").is_valid())


# -------------------------------------------------
# PRODUCT BARCODE / NAME LENGTH
# -------------------------------------------------
base = {
    "name": "QA Product",
    "brand": "QA",
    "unit_price": "10.00",
    "cost_price": "5.00",
    "stock_quantity": 10,
    "reorder_level": 2,
    "is_active": True,
    "description": "QA",
    "is_sensitive": False,
    "expiry_date": "2028-12-31",
    "box_price": "100.00",
    "strip_price": "50.00",
    "pcs_per_box": 10,
    "pcs_per_strip": 5,
    "strips_per_box": 2,
}

d = base.copy(); d["barcode"] = "B" * 100
result("100-character barcode accepted",
       ProductSerializer(data=d).is_valid())

d = base.copy(); d["barcode"] = "B" * 101
result("101-character barcode rejected",
       not ProductSerializer(data=d).is_valid())

d = base.copy(); d["barcode"] = "QA-BOUND-255"; d["name"] = "N" * 255
result("255-character product name accepted",
       ProductSerializer(data=d).is_valid())

d = base.copy(); d["barcode"] = "QA-BOUND-256"; d["name"] = "N" * 256
result("256-character product name rejected",
       not ProductSerializer(data=d).is_valid())


# -------------------------------------------------
# POS BOUNDARIES (payment must equal price × qty − discount)
# -------------------------------------------------
product = Product.objects.filter(stock_quantity__gt=5).first()

if product:
    price = Decimal(str(product.unit_price))

    def checkout(quantity, discount="0.00", payment_amount=None):
        qty = Decimal(str(quantity))
        disc = Decimal(str(discount))
        # Compute the correct payment if not overridden
        expected = (price * qty) - disc
        amount = payment_amount if payment_amount is not None else str(expected)
        return {
            "customer": None,
            "items": [{
                "product": product.id,
                "quantity": quantity,
                "unit": "pc",
                "unit_price": str(price),
            }],
            "discount": str(discount),
            "payments": [{"method": "cash", "amount": amount}],
        }

    # Quantity 1 with matching payment
    valid_s = PosCheckoutSerializer(data=checkout(quantity=1))
    result("Quantity 1 accepted", valid_s.is_valid(), str(valid_s.errors))

    # Quantity 0
    result("Quantity 0 rejected",
           not PosCheckoutSerializer(data=checkout(quantity=0)).is_valid())

    # Negative discount (with payment adjusted so only discount is wrong)
    result("Negative discount rejected",
           not PosCheckoutSerializer(
               data=checkout(quantity=1, discount="-1.00")
           ).is_valid())

    # Zero payment (mismatched with payable)
    result("Zero payment rejected",
           not PosCheckoutSerializer(
               data=checkout(quantity=1, payment_amount="0.00")
           ).is_valid())
else:
    print("WARN - No product with stock > 5 found; skipping POS boundary tests")


print("")
print("=" * 70)
print(f"RESULT: {passed} passed, {failed} failed")
print("=" * 70)

sys.exit(1 if failed else 0)