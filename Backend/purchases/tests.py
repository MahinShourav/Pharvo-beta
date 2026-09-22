"""
Purchase workflow test.
Run from the Backend folder:
    python purchases/tests.py
"""
import os
import sys
import django
import uuid
from decimal import Decimal
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.test import Client
from django.contrib.auth import get_user_model
from inventory.models import Product, Supplier
from purchases.models import Purchase, PurchaseItem

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

    customer = User.objects.filter(role="customer", is_active=True).first()

    print(f"Staff user: {staff.username}")
    print(f"Customer user: {customer.username if customer else '(none found)'}\n")

    # ---- Setup: Supplier + Product ----
    supplier = Supplier.objects.create(
        name="QA Purchase Supplier",
        company="QA Co",
        contact_person="QA Contact",
        phone="01700009999",
        email="qa-purchase@example.com",
        address="QA Address",
        is_active=True,
    )

    product = Product.objects.create(
        name="QA Purchase Medicine",
        brand="QA Pharma",
        barcode=f"QA-PUR-{uuid.uuid4().hex[:8]}",
        unit_price=Decimal("20.00"),
        cost_price=Decimal("10.00"),
        stock_quantity=50,
        reorder_level=5,
        expiry_date=date(2028, 12, 31),
        is_active=True,
        description="QA Purchase Product",
        is_sensitive=False,
        box_price=Decimal("200.00"),
        strip_price=Decimal("100.00"),
        pcs_per_box=20,
        pcs_per_strip=10,
        strips_per_box=2,
    )

    before_stock = product.stock_quantity
    invoice_num = f"PUR-QA-{uuid.uuid4().hex[:8].upper()}"

    print(f"Supplier ID: {supplier.id}")
    print(f"Product ID: {product.id}, initial stock: {before_stock}")
    print(f"Invoice: {invoice_num}\n")

    # ---- Login as staff ----
    client.force_login(staff)

    # ========== Test 1: Staff creates purchase ==========
    payload = {
        "invoice_number": invoice_num,
        "supplier": supplier.id,
        "items": [{
            "product": product.id,
            "quantity": 10,
            "unit_price": "8.00",
            "expiry_date": "2028-12-31",
        }],
        "discount": "5.00",
        "purchase_date": "2026-09-22",
    }

    resp = client.post("/api/purchases/", data=payload,
                       content_type="application/json", HTTP_HOST=HOST)
    check("Staff can create purchase (201)", resp.status_code == 201,
          f"got {resp.status_code}, body={resp.content[:200]}")

    purchase_id = None
    if resp.status_code == 201:
        data = resp.json()
        purchase_id = data.get("id")

        # ========== Test 2: Total calculated correctly ==========
        total = Decimal(str(data.get("total_amount", "0")))
        check("Total amount = 80.00 (10 × 8.00)",
              total == Decimal("80.00"),
              f"got {total}")

        # ========== Test 3: Payable after discount ==========
        payable = Decimal(str(data.get("payable_amount", "0")))
        check("Payable = 75.00 (80.00 - 5.00 discount)",
              payable == Decimal("75.00"),
              f"got {payable}")

        # ========== Test 4: Invoice number stored ==========
        check("Invoice number returned",
              data.get("invoice_number") == invoice_num,
              f"got {data.get('invoice_number')}")

        # ========== Test 5: Stock increased by 10 ==========
        product.refresh_from_db()
        check("Stock increased by 10",
              product.stock_quantity == before_stock + 10,
              f"before={before_stock}, after={product.stock_quantity}")

    # ========== Test 6: Zero quantity rejected ==========
    invalid_payload = {
        "invoice_number": f"PUR-QA-INV-{uuid.uuid4().hex[:6].upper()}",
        "supplier": supplier.id,
        "items": [{
            "product": product.id,
            "quantity": 0,
            "unit_price": "8.00",
        }],
        "discount": "0.00",
        "purchase_date": "2026-09-22",
    }
    resp = client.post("/api/purchases/", data=invalid_payload,
                       content_type="application/json", HTTP_HOST=HOST)
    check("Zero quantity rejected (400)", resp.status_code == 400,
          f"got {resp.status_code}")

    # ========== Test 7: Customer blocked ==========
    if customer:
        client.force_login(customer)
        resp = client.post("/api/purchases/", data=payload,
                           content_type="application/json", HTTP_HOST=HOST)
        check("Customer cannot create purchase (403)",
              resp.status_code in (401, 403),
              f"got {resp.status_code}")

    # ========== Cleanup ==========
    # Delete purchase first (cascade deletes items), then product, then supplier
    if purchase_id:
        Purchase.objects.filter(id=purchase_id).delete()
    Purchase.objects.filter(invoice_number__startswith="PUR-QA-").delete()
    product.delete()
    supplier.delete()
    print("\nCleanup complete.")

    print()
    print(f"Results: {len(PASS)} passed, {len(FAIL)} failed")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())