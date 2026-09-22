"""
Sensitive medicine approval test.
Run from the Backend folder:
    python inventory/test_sensitive_medicines.py
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from decimal import Decimal
from django.test import Client
from django.contrib.auth import get_user_model
from inventory.models import Product

User = get_user_model()
HOST = "localhost"


def main():
    client = Client(SERVER_NAME=HOST)

    user = (
        User.objects.filter(role="admin", is_active=True).first()
        or User.objects.filter(role="pharmacist", is_active=True).first()
        or User.objects.filter(is_staff=True).first()
    )
    if not user:
        print("FAIL: No admin/pharmacist user exists.")
        return 1
    client.force_login(user)
    print(f"Logged in as: {user.username} (role: {getattr(user, 'role', 'staff')})\n")

    # Clean any leftover product
    Product.objects.filter(barcode="QA-SENSITIVE-999").delete()

    # Create a sensitive product
    product = Product.objects.create(
        name="QA Sensitive Medicine",
        brand="QA Pharma",
        barcode="QA-SENSITIVE-999",
        unit_price=Decimal("10.00"),
        cost_price=Decimal("5.00"),
        stock_quantity=10,
        reorder_level=2,
        expiry_date="2028-12-31",
        is_active=True,
        description="Temporary QA sensitive medicine",
        is_sensitive=True,
        box_price=Decimal("100.00"),
        strip_price=Decimal("50.00"),
        pcs_per_box=10,
        pcs_per_strip=5,
        strips_per_box=2,
    )
    print(f"Sensitive medicine ID: {product.id}")
    print(f"is_sensitive: {product.is_sensitive}\n")

    # Test: checkout WITHOUT approve_sensitive flag
    payload = {
        "customer": None,
        "items": [{
            "product": product.id,
            "quantity": 1,
            "unit": "pc",
            "unit_price": "10.00",
        }],
        "discount": "0.00",
        "payments": [{"method": "cash", "amount": "10.00"}],
        "approve_sensitive": False,
    }

    resp = client.post("/api/pos/checkout/", data=payload,
                       content_type="application/json", HTTP_HOST=HOST)
    print(f"Checkout WITHOUT approve_sensitive -> HTTP {resp.status_code}")

    requires_approval = False
    body = {}
    try:
        body = resp.json()
        requires_approval = bool(body.get("requires_approval", False))
    except Exception:
        pass

    print(f"requires_approval in response: {requires_approval}")

    # Refresh from DB to see if stock was deducted
    product.refresh_from_db()
    print(f"Stock after unapproved checkout: {product.stock_quantity}\n")

    # Verdict
    if resp.status_code == 201 and not requires_approval:
        print("FAIL:")
        print("Sensitive medicine was sold WITHOUT an approval gate.")
        print("Frontend expects restricted medicine approval,")
        print("but backend currently completes the sale directly.")
        result = 1
    else:
        print("PASS: Sensitive medicine approval is enforced.")
        result = 0

    # Cleanup
    Product.objects.filter(barcode="QA-SENSITIVE-999").delete()
    print("\nCleanup complete.")
    return result


if __name__ == "__main__":
    sys.exit(main())