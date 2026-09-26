"""
Database integrity test.
Run from the Backend folder:
    python config/test_database_integrity.py
"""
import os
import sys
from decimal import Decimal

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE_DIR)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.db.models import Count

from inventory.models import Product
from customers.models import Customer
from sales.models import Sale, SalePayment
from purchases.models import Purchase


print("=" * 70)
print("PHARVO DATABASE INTEGRITY TEST")
print("=" * 70)

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


# -------------------------------------------------
# INVENTORY
# -------------------------------------------------
negative_stock = Product.objects.filter(stock_quantity__lt=0).count()
check("No product has negative stock", negative_stock == 0,
      f"negative_stock={negative_stock}")

negative_unit_price = Product.objects.filter(unit_price__lt=0).count()
check("No product has negative unit price", negative_unit_price == 0,
      f"negative_unit_price={negative_unit_price}")

negative_cost_price = Product.objects.filter(cost_price__lt=0).count()
check("No product has negative cost price", negative_cost_price == 0,
      f"negative_cost_price={negative_cost_price}")

negative_reorder = Product.objects.filter(reorder_level__lt=0).count()
check("No product has negative reorder level", negative_reorder == 0,
      f"negative_reorder={negative_reorder}")


# -------------------------------------------------
# CUSTOMERS
# -------------------------------------------------
duplicate_phones = (
    Customer.objects
    .values("phone")
    .annotate(total=Count("id"))
    .filter(total__gt=1)
    .count()
)
check("Customer phone numbers are unique", duplicate_phones == 0,
      f"duplicate_phone_groups={duplicate_phones}")


# -------------------------------------------------
# SALES
# -------------------------------------------------
duplicate_sale_invoice = (
    Sale.objects
    .values("invoice_number")
    .annotate(total=Count("id"))
    .filter(total__gt=1)
    .count()
)
check("Sale invoice numbers are unique", duplicate_sale_invoice == 0,
      f"duplicate_invoice_groups={duplicate_sale_invoice}")

bad_sales = 0
bad_payments = 0

sales = Sale.objects.prefetch_related("items", "payments").all()

for sale in sales:
    item_total = sum(
        (item.subtotal for item in sale.items.all()),
        Decimal("0.00"),
    )
    payment_total = sum(
        (payment.amount for payment in sale.payments.all()),
        Decimal("0.00"),
    )
    expected_payable = sale.total_amount - sale.discount

    if item_total != sale.total_amount:
        bad_sales += 1
        print(f"SALE MISMATCH: {sale.invoice_number} "
              f"items={item_total} total={sale.total_amount}")

    if expected_payable != sale.payable_amount:
        bad_sales += 1
        print(f"SALE PAYABLE MISMATCH: {sale.invoice_number} "
              f"expected={expected_payable} stored={sale.payable_amount}")

    if payment_total != sale.payable_amount:
        bad_payments += 1
        print(f"PAYMENT MISMATCH: {sale.invoice_number} "
              f"payments={payment_total} payable={sale.payable_amount}")

check("Sale totals are internally consistent", bad_sales == 0,
      f"mismatches={bad_sales}")
check("Sale payment totals match payable amounts", bad_payments == 0,
      f"mismatches={bad_payments}")

negative_payments = SalePayment.objects.filter(amount__lt=0).count()
check("No negative sale payments", negative_payments == 0,
      f"negative_payments={negative_payments}")


# -------------------------------------------------
# PURCHASES
# -------------------------------------------------
duplicate_purchase_invoice = (
    Purchase.objects
    .values("invoice_number")
    .annotate(total=Count("id"))
    .filter(total__gt=1)
    .count()
)
check("Purchase invoice numbers are unique", duplicate_purchase_invoice == 0,
      f"duplicate_invoice_groups={duplicate_purchase_invoice}")

bad_purchases = 0
purchases = Purchase.objects.prefetch_related("items").all()

for purchase in purchases:
    item_total = sum(
        (item.subtotal for item in purchase.items.all()),
        Decimal("0.00"),
    )
    expected_payable = purchase.total_amount - purchase.discount

    if item_total != purchase.total_amount:
        bad_purchases += 1
        print(f"PURCHASE TOTAL MISMATCH: {purchase.invoice_number}")

    if expected_payable != purchase.payable_amount:
        bad_purchases += 1
        print(f"PURCHASE PAYABLE MISMATCH: {purchase.invoice_number}")

check("Purchase totals are internally consistent", bad_purchases == 0,
      f"mismatches={bad_purchases}")


print("")
print("=" * 70)
print(f"RESULT: {passed} passed, {failed} failed")
print("=" * 70)

sys.exit(1 if failed else 0)