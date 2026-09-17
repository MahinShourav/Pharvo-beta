from datetime import date, timedelta
from threading import Thread

from django.test import TestCase, TransactionTestCase
from rest_framework.test import APIClient

from inventory.models import DrugInteraction
from sales.models import Sale, SalePayment
from tests.helpers import (
    auth_client,
    make_customer,
    make_product,
    make_staff,
)


def _checkout_payload(product_id, quantity, payments, **kwargs):
    payload = {
        "items": [{"product": product_id, "quantity": quantity}],
        "payments": payments,
    }
    payload.update(kwargs)
    return payload


class PosCheckoutTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = make_staff("pos_staff")
        cls.customer = make_customer(name="POS Customer", phone="555-4000")

    def test_checkout_happy_path(self):
        product = make_product(barcode="BC-POS1", stock_quantity=10, unit_price=100)
        client = auth_client(self.staff)
        response = client.post(
            "/api/pos/checkout/",
            _checkout_payload(
                product.id, 2, [{"method": "cash", "amount": "200.00"}],
                customer=self.customer.id,
            ),
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(float(response.data["payable_amount"]), 200.0)
        self.assertEqual(response.data["customer_name"], "POS Customer")
        self.assertEqual(SalePayment.objects.filter(sale=response.data["id"]).count(), 1)
        product.refresh_from_db()
        self.assertEqual(product.stock_quantity, 8)

    def test_split_payment(self):
        product = make_product(barcode="BC-POS2", stock_quantity=5, unit_price=100)
        response = auth_client(self.staff).post(
            "/api/pos/checkout/",
            _checkout_payload(
                product.id,
                2,
                [
                    {"method": "cash", "amount": "120.00"},
                    {"method": "card", "amount": "80.00"},
                ],
            ),
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["payment_method"], "cash")
        payments = list(
            SalePayment.objects.filter(sale=response.data["id"])
            .values_list("method", "amount")
        )
        self.assertEqual(len(payments), 2)

    def test_payment_mismatch_rejected(self):
        product = make_product(barcode="BC-POS3", stock_quantity=5, unit_price=100)
        response = auth_client(self.staff).post(
            "/api/pos/checkout/",
            _checkout_payload(
                product.id, 2, [{"method": "cash", "amount": "150.00"}]
            ),
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Sale.objects.count(), 0)
        product.refresh_from_db()
        self.assertEqual(product.stock_quantity, 5)

    def test_sensitive_medicine_requires_approval(self):
        product = make_product(
            barcode="BC-POS4", stock_quantity=5, unit_price=100, is_sensitive=True
        )
        client = auth_client(self.staff)
        pending = client.post(
            "/api/pos/checkout/",
            _checkout_payload(
                product.id, 1, [{"method": "cash", "amount": "100.00"}]
            ),
            format="json",
        )
        self.assertEqual(pending.status_code, 200)
        self.assertTrue(pending.data["requires_approval"])
        self.assertEqual(Sale.objects.count(), 0)
        approved = client.post(
            "/api/pos/checkout/",
            _checkout_payload(
                product.id,
                1,
                [{"method": "cash", "amount": "100.00"}],
                approve_sensitive=True,
            ),
            format="json",
        )
        self.assertEqual(approved.status_code, 201)
        product.refresh_from_db()
        self.assertEqual(product.stock_quantity, 4)

    def test_expired_medicine_blocked(self):
        product = make_product(
            barcode="BC-POS5",
            stock_quantity=5,
            unit_price=100,
            expiry_date=date.today() - timedelta(days=3),
        )
        response = auth_client(self.staff).post(
            "/api/pos/checkout/",
            _checkout_payload(
                product.id, 1, [{"method": "cash", "amount": "100.00"}]
            ),
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Sale.objects.count(), 0)
        product.refresh_from_db()
        self.assertEqual(product.stock_quantity, 5)

    def test_insufficient_stock_rollback(self):
        product = make_product(barcode="BC-POS6", stock_quantity=1, unit_price=100)
        response = auth_client(self.staff).post(
            "/api/pos/checkout/",
            _checkout_payload(
                product.id, 5, [{"method": "cash", "amount": "500.00"}]
            ),
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Sale.objects.count(), 0)
        product.refresh_from_db()
        self.assertEqual(product.stock_quantity, 1)

    def test_customer_role_denied(self):
        from django.contrib.auth import get_user_model

        UserModel = get_user_model()
        clerk = UserModel.objects.create_user(
            username="pos_customer_user",
            password="testpass123",
            role=UserModel.Role.CUSTOMER,
        )
        product = make_product(barcode="BC-POS7", stock_quantity=5, unit_price=100)
        response = auth_client(clerk).post(
            "/api/pos/checkout/",
            _checkout_payload(
                product.id, 1, [{"method": "cash", "amount": "100.00"}]
            ),
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_pharmacist_role_can_checkout(self):
        from django.contrib.auth import get_user_model

        UserModel = get_user_model()
        pharmacist = UserModel.objects.create_user(
            username="pos_pharmacist",
            password="testpass123",
            role=UserModel.Role.PHARMACIST,
            is_staff=False,
        )
        product = make_product(barcode="BC-POS8", stock_quantity=5, unit_price=100)
        response = auth_client(pharmacist).post(
            "/api/pos/checkout/",
            _checkout_payload(
                product.id, 2, [{"method": "cash", "amount": "200.00"}]
            ),
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        product.refresh_from_db()
        self.assertEqual(product.stock_quantity, 3)

    def test_pharmacist_role_sensitive_approval_flow(self):
        from django.contrib.auth import get_user_model

        UserModel = get_user_model()
        pharmacist = UserModel.objects.create_user(
            username="pos_pharm_sens",
            password="testpass123",
            role=UserModel.Role.PHARMACIST,
            is_staff=False,
        )
        product = make_product(
            barcode="BC-POS9", stock_quantity=5, unit_price=100, is_sensitive=True
        )
        client = auth_client(pharmacist)
        pending = client.post(
            "/api/pos/checkout/",
            _checkout_payload(
                product.id, 1, [{"method": "cash", "amount": "100.00"}]
            ),
            format="json",
        )
        self.assertEqual(pending.status_code, 200)
        self.assertTrue(pending.data["requires_approval"])
        approved = client.post(
            "/api/pos/checkout/",
            _checkout_payload(
                product.id,
                1,
                [{"method": "cash", "amount": "100.00"}],
                approve_sensitive=True,
            ),
            format="json",
        )
        self.assertEqual(approved.status_code, 201)
        product.refresh_from_db()
        self.assertEqual(product.stock_quantity, 4)


class PosInteractionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = make_staff("pos_ix_staff")
        cls.warfarin = make_product(
            name="Warfarin 5mg", barcode="BC-IXWAR", stock_quantity=20, unit_price=50
        )
        cls.aspirin = make_product(
            name="Aspirin 75mg", barcode="BC-IXASP", stock_quantity=20, unit_price=10
        )
        cls.napa = make_product(
            name="Napa 500mg", barcode="BC-IXNAP", stock_quantity=20, unit_price=20
        )
        DrugInteraction.objects.get_or_create(
            drug_a="Warfarin", drug_b="Aspirin",
            defaults={"interaction_level": "high_risk"},
        )

    def test_interaction_requires_approval_before_sale(self):
        client = auth_client(self.staff)
        payload = {
            "items": [
                {"product": self.warfarin.id, "quantity": 1},
                {"product": self.aspirin.id, "quantity": 1},
            ],
            "payments": [{"method": "cash", "amount": "60.00"}],
        }
        pending = client.post("/api/pos/checkout/", payload, format="json")
        self.assertEqual(pending.status_code, 200)
        self.assertTrue(pending.data["requires_interaction_approval"])
        self.assertEqual(pending.data["interactions"][0]["level"], "high_risk")
        self.assertEqual(Sale.objects.count(), 0)
        self.warfarin.refresh_from_db()
        self.aspirin.refresh_from_db()
        self.assertEqual(self.warfarin.stock_quantity, 20)
        self.assertEqual(self.aspirin.stock_quantity, 20)

    def test_interaction_approval_completes_sale(self):
        client = auth_client(self.staff)
        payload = {
            "items": [
                {"product": self.warfarin.id, "quantity": 1},
                {"product": self.aspirin.id, "quantity": 1},
            ],
            "payments": [{"method": "cash", "amount": "60.00"}],
            "approve_interactions": True,
        }
        response = client.post("/api/pos/checkout/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(float(response.data["payable_amount"]), 60.0)
        self.warfarin.refresh_from_db()
        self.aspirin.refresh_from_db()
        self.assertEqual(self.warfarin.stock_quantity, 19)
        self.assertEqual(self.aspirin.stock_quantity, 19)

    def test_normal_medicines_checkout_without_warning(self):
        client = auth_client(self.staff)
        payload = {
            "items": [
                {"product": self.warfarin.id, "quantity": 1},
                {"product": self.napa.id, "quantity": 1},
            ],
            "payments": [{"method": "cash", "amount": "70.00"}],
        }
        response = client.post("/api/pos/checkout/", payload, format="json")
        self.assertEqual(response.status_code, 201)


class ConcurrentCheckoutTest(TransactionTestCase):
    def test_concurrent_checkout_never_oversells(self):
        user = make_staff("conc_staff")
        product = make_product(barcode="BC-CONC", stock_quantity=1, unit_price=100)
        results = []

        def checkout():
            from django.db import connections

            try:
                client = APIClient()
                client.force_authenticate(user)
                response = client.post(
                    "/api/pos/checkout/",
                    _checkout_payload(
                        product.id, 1, [{"method": "cash", "amount": "100.00"}]
                    ),
                    format="json",
                )
                results.append(response.status_code)
            finally:
                connections.close_all()

        threads = [Thread(target=checkout) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=60)
        self.assertEqual(sorted(results), [201, 400])
        product.refresh_from_db()
        self.assertEqual(product.stock_quantity, 0)