from datetime import date, timedelta

from django.test import TestCase

from inventory.models import Supplier
from purchases.models import Purchase
from sales.models import Sale, SaleItem
from tests.helpers import (
    auth_client,
    make_customer,
    make_product,
    make_staff,
    make_supplier,
)


class DashboardTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = make_staff("dash_staff")
        today = date.today()
        make_product(barcode="D-LOW", stock_quantity=5, reorder_level=10)
        make_product(
            barcode="D-OUT", stock_quantity=0, reorder_level=2
        )
        make_product(
            barcode="D-EXP",
            stock_quantity=100,
            reorder_level=2,
            expiry_date=today - timedelta(days=5),
        )
        make_product(
            barcode="D-NEAR",
            stock_quantity=100,
            reorder_level=2,
            expiry_date=today + timedelta(days=10),
        )
        make_product(
            barcode="D-OK",
            stock_quantity=100,
            reorder_level=2,
            expiry_date=today + timedelta(days=90),
        )
        cls.customer = make_customer(name="Dash Customer", phone="555-8000")
        cls.supplier = make_supplier("Dash Source")
        cls.product_a = make_product(barcode="D-TOPA", stock_quantity=50)
        cls.product_b = make_product(barcode="D-TOPB", stock_quantity=50)
        cls.sale1 = Sale.objects.create(
            invoice_number="DASH-1",
            customer=cls.customer,
            user=cls.staff,
            total_amount=300,
            discount=200,
            payable_amount=100,
            sale_date=today,
        )
        SaleItem.objects.create(
            sale=cls.sale1,
            product=cls.product_a,
            quantity=3,
            unit_price=100,
            subtotal=300,
        )
        cls.sale2 = Sale.objects.create(
            invoice_number="DASH-2",
            customer=cls.customer,
            user=cls.staff,
            total_amount=50,
            discount=0,
            payable_amount=50,
            sale_date=today,
        )
        SaleItem.objects.create(
            sale=cls.sale2,
            product=cls.product_b,
            quantity=1,
            unit_price=50,
            subtotal=50,
        )
        Purchase.objects.create(
            invoice_number="DASH-P1",
            supplier=cls.supplier,
            user=cls.staff,
            total_amount=200,
            discount=0,
            payable_amount=200,
            purchase_date=today,
        )

    def test_dashboard_totals(self):
        data = auth_client(self.staff).get("/api/dashboard/").data
        self.assertEqual(data["total_products"], 7)
        self.assertEqual(data["active_products"], 7)
        self.assertEqual(data["total_customers"], 1)
        # Demo suppliers from the seed migration also live in the test DB,
        # so assert against the real table count instead of a fixed number.
        self.assertEqual(data["total_suppliers"], Supplier.objects.count())
        self.assertGreaterEqual(data["total_suppliers"], 1)
        self.assertEqual(data["total_sales"], 2)
        self.assertEqual(float(data["total_revenue"]), 150.0)
        self.assertEqual(data["total_purchases"], 1)
        self.assertEqual(float(data["total_purchase_amount"]), 200.0)
        self.assertEqual(data["low_stock_count"], 2)
        self.assertEqual(data["expired_count"], 1)
        self.assertEqual(data["near_expiry_count"], 1)
        self.assertEqual(data["sales_summary"]["sales_count"], 2)
        self.assertEqual(float(data["sales_summary"]["revenue"]), 150.0)

    def test_recent_sales_and_top_products(self):
        data = auth_client(self.staff).get("/api/dashboard/").data
        self.assertEqual(len(data["recent_sales"]), 2)
        self.assertEqual(data["recent_sales"][0]["invoice_number"], "DASH-2")
        top = data["top_selling_products"][0]
        self.assertEqual(top["product_name"], self.product_a.name)
        self.assertEqual(top["total_quantity"], 3)