"""
Cross-module integration flow test.
Purchase -> Inventory -> POS Sale -> Inventory -> Dashboard -> Reports.

Run from the Backend folder:
    python config/test_integration_flow.py
"""
import os
import sys
import uuid
from decimal import Decimal

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.db import transaction
from rest_framework.test import APIClient

from accounts.models import User
from customers.models import Customer
from inventory.models import Product, Supplier


print("=" * 72)
print("PHARVO INTEGRATION FLOW TEST")
print("=" * 72)

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


staff = (
    User.objects.filter(role__in=["admin", "pharmacist", "staff"], is_active=True).first()
    or User.objects.filter(is_staff=True).first()
)

if not staff:
    print("ERROR: No staff account found.")
    sys.exit(1)

client = APIClient(SERVER_NAME="localhost")
client.force_authenticate(user=staff)


try:
    with transaction.atomic():
        token = uuid.uuid4().hex[:8]

        # --------- SETUP ---------
        supplier = Supplier.objects.create(
            name=f"QA Integration Supplier {token}",
            company="QA Co",
            contact_person="QA",
            phone="01700000000",
            email=f"integration-{token}@qa.local",
            address="QA Test",
            is_active=True,
        )

        product = Product.objects.create(
            name=f"QA Integration Medicine {token}",
            brand="QA Pharma",
            barcode=f"QA-INT-{token}",
            unit_price=Decimal("10.00"),
            cost_price=Decimal("6.00"),
            stock_quantity=20,
            reorder_level=5,
            expiry_date="2028-12-31",
            is_active=True,
            description="Integration test medicine",
            is_sensitive=False,
            box_price=Decimal("100.00"),
            strip_price=Decimal("50.00"),
            pcs_per_box=10,
            pcs_per_strip=5,
            strips_per_box=2,
        )

        customer = Customer.objects.create(
            name=f"QA Integration Customer {token}",
            phone=f"019{token[:8]}",
            email=f"customer-{token}@qa.local",
            address="QA Address",
            loyalty_points=0,
            membership_tier="bronze",
            notes="Integration test",
        )

        # --------- BASELINE VALUES ---------
        dash_before = client.get("/api/dashboard/").data
        sales_before = client.get("/api/reports/sales/").data
        purch_before = client.get("/api/reports/purchases/").data

        # --------- PURCHASE ---------
        purchase_resp = client.post(
            "/api/purchases/",
            {
                "invoice_number": f"PUR-INT-{token}",
                "supplier": supplier.id,
                "items": [{
                    "product": product.id,
                    "quantity": 10,
                    "unit_price": "6.00",
                }],
                "discount": "0.00",
                "purchase_date": "2026-09-22",
            },
            format="json",
        )
        check("Purchase created (201)", purchase_resp.status_code == 201,
              f"status={purchase_resp.status_code}, body={purchase_resp.content[:200]}")

        product.refresh_from_db()
        check("Purchase increased inventory to 30",
              product.stock_quantity == 30,
              f"stock={product.stock_quantity}")

        # --------- POS SALE ---------
        sale_resp = client.post(
            "/api/pos/checkout/",
            {
                "customer": customer.id,
                "items": [{
                    "product": product.id,
                    "quantity": 2,
                    "unit": "pc",
                    "unit_price": "10.00",
                }],
                "discount": "0.00",
                "payments": [{"method": "cash", "amount": "20.00"}],
            },
            format="json",
        )
        check("POS sale created (201)", sale_resp.status_code == 201,
              f"status={sale_resp.status_code}, body={sale_resp.content[:200]}")

        product.refresh_from_db()
        check("Sale reduced inventory to 28",
              product.stock_quantity == 28,
              f"stock={product.stock_quantity}")

        # --------- DASHBOARD ---------
        dash_after = client.get("/api/dashboard/").data

        check("Dashboard total_sales incremented",
              dash_after["total_sales"] == dash_before["total_sales"] + 1,
              f"before={dash_before['total_sales']} after={dash_after['total_sales']}")

        expected_revenue = Decimal(str(dash_before["total_revenue"])) + Decimal("20.00")
        check("Dashboard total_revenue increased by 20",
              Decimal(str(dash_after["total_revenue"])) == expected_revenue,
              f"expected={expected_revenue} actual={dash_after['total_revenue']}")

        # --------- SALES REPORT ---------
        sales_after = client.get("/api/reports/sales/").data

        check("Sales report total_sales incremented",
              sales_after["total_sales"] == sales_before["total_sales"] + 1,
              f"before={sales_before['total_sales']} after={sales_after['total_sales']}")

        expected_sales_rev = Decimal(str(sales_before["total_revenue"])) + Decimal("20.00")
        check("Sales report total_revenue increased by 20",
              Decimal(str(sales_after["total_revenue"])) == expected_sales_rev,
              f"expected={expected_sales_rev} actual={sales_after['total_revenue']}")

        # --------- PURCHASE REPORT ---------
        purch_after = client.get("/api/reports/purchases/").data

        check("Purchase report total_purchases incremented",
              purch_after["total_purchases"] == purch_before["total_purchases"] + 1,
              f"before={purch_before['total_purchases']} after={purch_after['total_purchases']}")

        expected_purch_payable = (
            Decimal(str(purch_before["total_payable_amount"])) + Decimal("60.00")
        )
        check("Purchase report total_payable_amount increased by 60",
              Decimal(str(purch_after["total_payable_amount"])) == expected_purch_payable,
              f"expected={expected_purch_payable} actual={purch_after['total_payable_amount']}")

        # --------- CUSTOMER API ---------
        customers_resp = client.get("/api/customers/").data
        cust_items = (
            customers_resp["results"]
            if isinstance(customers_resp, dict) and "results" in customers_resp
            else customers_resp
        )
        customer_ids = [item["id"] for item in cust_items]

        check("Customer visible via CRM/customers API",
              customer.id in customer_ids,
              f"customer_id={customer.id}")

        # Roll back everything
        transaction.set_rollback(True)

except Exception as exc:
    print(f"\nERROR: {exc}")
    import traceback
    traceback.print_exc()
    sys.exit(1)


print("")
print("=" * 72)
print(f"RESULT: {passed} passed, {failed} failed")
print("=" * 72)

sys.exit(1 if failed else 0)