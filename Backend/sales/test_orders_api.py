"""
Sales orders API test.
Run from the Backend folder:
    python sales/test_orders_api.py
"""
import os
import sys
import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.test import Client
from django.contrib.auth import get_user_model
from sales.models import Sale

User = get_user_model()
HOST = "localhost"


def main():
    client = Client(SERVER_NAME=HOST)

    user = User.objects.filter(is_staff=True).first()
    if not user:
        print("FAIL: No staff user found")
        return 1

    client.force_login(user)
    print(f"Logged in as: {user.username}\n")

    # Hit the sales list endpoint
    resp = client.get("/api/sales/", HTTP_HOST=HOST)
    print(f"HTTP status: {resp.status_code}")

    passed = True

    if resp.status_code != 200:
        print(f"FAIL: Sales list did not return 200 (got {resp.status_code})")
        passed = False
    else:
        try:
            data = resp.json()
            # Support both paginated and list response
            if isinstance(data, dict) and "results" in data:
                items = data["results"]
            elif isinstance(data, list):
                items = data
            else:
                items = []
                print("FAIL: Sales response is not a list or paginated dict")
                passed = False

            if passed:
                db_count = Sale.objects.count()
                print(f"API sales count: {len(items)}")
                print(f"DB sales count: {db_count}")

                if len(items) != db_count:
                    print(f"WARN: API count ({len(items)}) differs from DB count ({db_count})")

                if items:
                    sale = items[0]
                    required = [
                        "id",
                        "invoice_number",
                        "total_amount",
                        "discount",
                        "payable_amount",
                    ]
                    for field in required:
                        if field not in sale:
                            print(f"FAIL: Missing field '{field}' in sale response")
                            passed = False

                    if passed:
                        print(f"Sample sale: invoice={sale.get('invoice_number')}, "
                              f"total={sale.get('total_amount')}")
                else:
                    print("INFO: No sales in database to validate fields against")
        except Exception as e:
            print(f"FAIL: Could not parse response JSON: {e}")
            passed = False

    if passed:
        print("\nPASS: Sales orders API validated")
        return 0
    else:
        print("\nFAIL: Sales orders API test failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())