"""
End-to-end pharmacy flow test.
Customer -> Medicine -> Low Stock -> Purchase -> Sale -> History -> Reports.
Run from the Backend folder:
    python config/test_e2e_flow.py
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
from inventory.models import Supplier
from notifications.models import Notification


print("=" * 72)
print("PHARVO END-TO-END PHARMACY TEST")
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
    print("ERROR: Staff account not found.")
    sys.exit(1)

client = APIClient(SERVER_NAME="localhost")
client.force_authenticate(user=staff)

try:
    with transaction.atomic():
        token = uuid.uuid4().hex[:8]

        # ---------------- CUSTOMER ----------------
        cust_resp = client.post(
            "/api/customers/",
            {
                "name": f"QA E2E Customer {token}",
                "phone": f"018{token[:8]}",
                "email": f"e2e-{token}@qa.local",
                "address": "QA Test Address",
                "membership_tier": "bronze",
                "loyalty_points": 0,
                "notes": "Full E2E test",
            },
            format="json",
        )
        check("Customer created (201)", cust_resp.status_code == 201,
              f"status={cust_resp.status_code} body={cust_resp.content[:150]}")
        customer_id = cust_resp.data["id"] if cust_resp.status_code == 201 else None

        # ---------------- MEDICINE ----------------
        prod_resp = client.post(
            "/api/inventory/products/",
            {
                "name": f"QA E2E Medicine {token}",
                "brand": "QA Pharma",
                "barcode": f"QA-E2E-{token}",
                "unit_price": "12.00",
                "cost_price": "7.00",
                "stock_quantity": 2,
                "reorder_level": 5,
                "expiry_date": "2028-12-31",
                "is_active": True,
                "description": "E2E medicine",
                "is_sensitive": False,
                "box_price": "120.00",
                "strip_price": "60.00",
                "pcs_per_box": 10,
                "pcs_per_strip": 5,
                "strips_per_box": 2,
            },
            format="json",
        )
        check("Medicine created (201)", prod_resp.status_code == 201,
              f"status={prod_resp.status_code} body={prod_resp.content[:150]}")
        product_id = prod_resp.data["id"] if prod_resp.status_code == 201 else None

        # ---------------- LOW STOCK NOTIFICATION ----------------
        try:
            from notifications.services import refresh_alerts
            refresh_alerts()
        except ImportError:
            print("WARN - refresh_alerts not found")

        if product_id:
            notif_exists = Notification.objects.filter(
                product_id=product_id, type="low_stock"
            ).exists()
            check("Low stock notification generated for new product", notif_exists)

        # ---------------- SUPPLIER ----------------
        supplier = Supplier.objects.create(
            name=f"QA E2E Supplier {token}",
            company="QA Co",
            contact_person="QA",
            phone="01711111111",
            email=f"supplier-{token}@qa.local",
            address="QA Supplier Address",
            is_active=True,
        )

        # ---------------- PURCHASE ----------------
        purchase_resp = client.post(
            "/api/purchases/",
            {
                "invoice_number": f"PUR-E2E-{token}",
                "supplier": supplier.id,
                "items": [{
                    "product": product_id,
                    "quantity": 10,
                    "unit_price": "7.00",
                }],
                "discount": "0.00",
                "purchase_date": "2026-09-22",
            },
            format="json",
        )
        check("Supplier purchase completed (201)",
              purchase_resp.status_code == 201,
              f"status={purchase_resp.status_code} body={purchase_resp.content[:150]}")

        # ---------------- STOCK AFTER PURCHASE ----------------
        if product_id:
            after_p = client.get(f"/api/inventory/products/{product_id}/").data
            check("Stock became 12 after purchase",
                  after_p.get("stock_quantity") == 12,
                  f"stock={after_p.get('stock_quantity')}")

        # ---------------- POS SALE ----------------
        sale_resp = client.post(
            "/api/pos/checkout/",
            {
                "customer": customer_id,
                "items": [{
                    "product": product_id,
                    "quantity": 2,
                    "unit": "pc",
                    "unit_price": "12.00",
                }],
                "discount": "0.00",
                "payments": [{"method": "cash", "amount": "24.00"}],
            },
            format="json",
        )
        check("POS checkout completed (201)",
              sale_resp.status_code == 201,
              f"status={sale_resp.status_code} body={sale_resp.content[:150]}")

        invoice = sale_resp.data.get("invoice_number") if sale_resp.status_code == 201 else None

        # ---------------- STOCK AFTER SALE ----------------
        if product_id:
            after_s = client.get(f"/api/inventory/products/{product_id}/").data
            check("Stock became 10 after sale",
                  after_s.get("stock_quantity") == 10,
                  f"stock={after_s.get('stock_quantity')}")

        # ---------------- ORDER HISTORY ----------------
        sales_resp = client.get("/api/sales/").data
        sales_items = (
            sales_resp["results"] if isinstance(sales_resp, dict) and "results" in sales_resp
            else sales_resp
        )
        invoice_numbers = [row["invoice_number"] for row in sales_items]
        check("Sale appears in order history",
              invoice is not None and invoice in invoice_numbers,
              f"invoice={invoice}")

        # ---------------- DASHBOARD ----------------
        dash = client.get("/api/dashboard/").data
        recent_invoices = [row["invoice_number"] for row in dash.get("recent_sales", [])]
        check("Sale appears in dashboard recent sales",
              invoice is not None and invoice in recent_invoices,
              f"invoice={invoice}")

        # ---------------- SALES REPORT ----------------
        sales_report = client.get("/api/reports/sales/").data
        check("Sales report available",
              "total_sales" in sales_report)
        check("Sales report shows sales > 0",
              sales_report.get("total_sales", 0) > 0,
              f"total_sales={sales_report.get('total_sales')}")

        # ---------------- PURCHASES REPORT ----------------
        purch_report = client.get("/api/reports/purchases/").data
        check("Purchase report available",
              "total_purchases" in purch_report)
        check("Purchase report shows purchases > 0",
              purch_report.get("total_purchases", 0) > 0,
              f"total_purchases={purch_report.get('total_purchases')}")

        # ---------------- CUSTOMER FILTERED SALES ----------------
        if customer_id:
            filtered = client.get(f"/api/sales/?customer={customer_id}").data
            filtered_items = (
                filtered["results"] if isinstance(filtered, dict) and "results" in filtered
                else filtered
            )
            filtered_invoices = [r["invoice_number"] for r in filtered_items]
            check("Customer-filtered sales history contains sale",
                  invoice in filtered_invoices,
                  f"found={filtered_invoices}")

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