"""
Reports API test — compares API responses to database.
Run from the Backend folder:
    python reports/test_reports.py
"""
import os
import sys
import django
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.test import Client
from django.contrib.auth import get_user_model
from sales.models import Sale
from purchases.models import Purchase
from inventory.models import Product

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

    # ========== Sales report ==========
    resp = client.get("/api/reports/sales/", HTTP_HOST=HOST)
    check("Sales report returns 200", resp.status_code == 200,
          f"got {resp.status_code}")

    if resp.status_code == 200:
        data = resp.json()
        db_sales = Sale.objects.count()
        db_revenue = sum(
            (s.payable_amount for s in Sale.objects.all()),
            Decimal("0")
        )
        api_sales = data.get("sales_count", data.get("total_sales", None))
        api_revenue = data.get("revenue", data.get("total_revenue", None))

        check("Sales report returns count field",
              api_sales is not None,
              f"keys={list(data.keys())}")
        check("Sales report returns revenue field",
              api_revenue is not None,
              f"keys={list(data.keys())}")

        if api_sales is not None:
            check(f"Sales count matches DB ({db_sales})",
                  int(api_sales) == db_sales,
                  f"api={api_sales}, db={db_sales}")

    # ========== Purchases report ==========
    resp = client.get("/api/reports/purchases/", HTTP_HOST=HOST)
    check("Purchases report returns 200", resp.status_code == 200,
          f"got {resp.status_code}")

    if resp.status_code == 200:
        data = resp.json()
        db_purchases = Purchase.objects.count()
        api_purchases = data.get("purchase_count", data.get("total_purchases", None))
        if api_purchases is not None:
            check(f"Purchase count matches DB ({db_purchases})",
                  int(api_purchases) == db_purchases,
                  f"api={api_purchases}, db={db_purchases}")

    # ========== Profit report ==========
    resp = client.get("/api/reports/profit/", HTTP_HOST=HOST)
    check("Profit report returns 200", resp.status_code == 200,
          f"got {resp.status_code}")

    # ========== Stock report ==========
    resp = client.get("/api/reports/stock/", HTTP_HOST=HOST)
    check("Stock report returns 200", resp.status_code == 200,
          f"got {resp.status_code}")

    if resp.status_code == 200:
        data = resp.json()
        db_products = Product.objects.filter(is_active=True).count()
        api_products = data.get("total_products", data.get("product_count", None))
        if api_products is not None:
            check(f"Stock product count matches DB ({db_products})",
                  int(api_products) == db_products,
                  f"api={api_products}, db={db_products}")

        # Verify low_stock / expired / near_expiry keys exist
        for key in ["low_stock", "expired", "near_expiry"]:
            if key in data:
                print(f"OK   - Stock report includes '{key}' key")

    # ========== Customers report ==========
    resp = client.get("/api/reports/customers/", HTTP_HOST=HOST)
    check("Customers report returns 200", resp.status_code == 200,
          f"got {resp.status_code}")

    # ========== Permissions ==========
    client.logout()
    resp = client.get("/api/reports/sales/", HTTP_HOST=HOST)
    check("Unauthenticated request blocked (401/403)",
          resp.status_code in (401, 403),
          f"got {resp.status_code}")

    print()
    print(f"Results: {len(PASS)} passed, {len(FAIL)} failed")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    sys.exit(main())