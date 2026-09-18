"""Focused receiving tests: stock update, partial receipt, duplicate guard.

These tests exercise the existing receiving operation
(`POST /api/purchases/` -> atomic `add_purchase_stock`) that the Admin
"Receive Goods" workflow calls once per receiving event with only the
quantities actually received. No schema changes are involved.
"""

from datetime import date

from django.test import TestCase

from purchases.models import Purchase
from tests.helpers import auth_client, make_product, make_staff


def _receipt(supplier_id, product_id, quantity, unit_price, invoice):
    return {
        "invoice_number": invoice,
        "supplier": supplier_id,
        "items": [
            {
                "product": product_id,
                "quantity": quantity,
                "unit_price": unit_price,
            }
        ],
        "discount": "0.00",
        "purchase_date": date.today().isoformat(),
    }


class ReceiveOrderTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = make_staff("recv_staff")
        from tests.helpers import make_supplier

        cls.supplier = make_supplier("ReceiveSource")
        cls.product = make_product(barcode="BC-RECV", stock_quantity=50)

    def test_stock_increases_only_by_received_quantity(self):
        """Receiving 3 of 10 ordered adds 3, not 10."""
        response = auth_client(self.staff).post(
            "/api/purchases/",
            _receipt(self.supplier.id, self.product.id, 3, "10.00", "RCV-PART-1"),
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 53)

    def test_partial_receipts_sum_correctly(self):
        """Two partial receipts (4 + 6) add up to the ordered 10."""
        client = auth_client(self.staff)
        for invoice, qty in (("RCV-SUM-1", 4), ("RCV-SUM-2", 6)):
            response = client.post(
                "/api/purchases/",
                _receipt(self.supplier.id, self.product.id, qty, "10.00", invoice),
                format="json",
            )
            self.assertEqual(response.status_code, 201)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 60)
        # Each receipt is recorded as its own purchase (receipt history).
        self.assertEqual(
            Purchase.objects.filter(
                invoice_number__in=["RCV-SUM-1", "RCV-SUM-2"]
            ).count(),
            2,
        )

    def test_duplicate_invoice_does_not_double_add_stock(self):
        """Re-posting the same receipt invoice cannot add stock twice."""
        client = auth_client(self.staff)
        payload = _receipt(
            self.supplier.id, self.product.id, 5, "10.00", "RCV-DUP-1"
        )
        first = client.post("/api/purchases/", payload, format="json")
        self.assertEqual(first.status_code, 201)
        second = client.post("/api/purchases/", payload, format="json")
        self.assertGreaterEqual(second.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 55)
        self.assertEqual(
            Purchase.objects.filter(invoice_number="RCV-DUP-1").count(), 1
        )

    def test_invalid_quantities_rejected_without_stock_change(self):
        client = auth_client(self.staff)
        for invoice, qty in (("RCV-BAD-0", 0), ("RCV-BAD-NEG", -3)):
            response = client.post(
                "/api/purchases/",
                _receipt(self.supplier.id, self.product.id, qty, "10.00", invoice),
                format="json",
            )
            self.assertEqual(response.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 50)

    def test_receiving_requires_pharmacy_staff(self):
        """Customers cannot record receipts (backend-authorized operation)."""
        from django.contrib.auth import get_user_model

        customer = get_user_model().objects.create_user(
            username="recv_customer",
            password="testpass123",
            role=get_user_model().Role.CUSTOMER,
            is_staff=False,
        )
        response = auth_client(customer).post(
            "/api/purchases/",
            _receipt(self.supplier.id, self.product.id, 5, "10.00", "RCV-DENIED"),
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 50)
