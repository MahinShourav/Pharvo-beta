from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase

from purchases.models import Purchase
from tests.helpers import auth_client, make_product, make_staff, make_supplier

UserModel = get_user_model()


def _purchase_payload(supplier_id, product_id, quantity, unit_price, invoice,
                      discount="0.00"):
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
        "discount": discount,
        "purchase_date": date.today().isoformat(),
    }


class PurchaseTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = make_staff("pur_staff")
        cls.supplier = make_supplier("PurchaseSource")
        cls.product = make_product(barcode="BC-PUR", stock_quantity=50)

    def test_create_purchase_totals_and_stock(self):
        response = auth_client(self.staff).post(
            "/api/purchases/",
            _purchase_payload(self.supplier.id, self.product.id, 5, "10.00", "PUR-1", "5.00"),
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(float(response.data["total_amount"]), 50.0)
        self.assertEqual(float(response.data["payable_amount"]), 45.0)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 55)

    def test_non_pharmacy_cannot_create(self):
        customer_user = UserModel.objects.create_user(
            username="pur_customer_user",
            password="testpass123",
            role=UserModel.Role.CUSTOMER,
            is_staff=False,
        )
        response = auth_client(customer_user).post(
            "/api/purchases/",
            _purchase_payload(self.supplier.id, self.product.id, 1, "10.00", "PUR-DENY"),
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_pharmacist_can_create_purchase_and_stock_increases(self):
        pharmacist = UserModel.objects.create_user(
            username="pur_pharmacist",
            password="testpass123",
            role=UserModel.Role.PHARMACIST,
            is_staff=False,
        )
        client = auth_client(pharmacist)
        response = client.post(
            "/api/purchases/",
            _purchase_payload(self.supplier.id, self.product.id, 5, "10.00", "PUR-PH1"),
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["user_username"], "pur_pharmacist")
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 55)

    def test_pharmacist_can_read_purchases(self):
        pharmacist = UserModel.objects.create_user(
            username="pur_pharmacist_read",
            password="testpass123",
            role=UserModel.Role.PHARMACIST,
            is_staff=False,
        )
        response = auth_client(pharmacist).get("/api/purchases/")
        self.assertEqual(response.status_code, 200)

    def test_customer_role_cannot_create_purchase(self):
        customer = UserModel.objects.create_user(
            username="pur_customer",
            password="testpass123",
            role=UserModel.Role.CUSTOMER,
            is_staff=False,
        )
        response = auth_client(customer).post(
            "/api/purchases/",
            _purchase_payload(self.supplier.id, self.product.id, 1, "10.00", "PUR-CUS"),
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_update_purchase_restores_and_adds(self):
        client = auth_client(self.staff)
        response = client.post(
            "/api/purchases/",
            _purchase_payload(self.supplier.id, self.product.id, 5, "10.00", "PUR-2"),
            format="json",
        )
        purchase_id = response.data["id"]
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 55)
        client.patch(
            f"/api/purchases/{purchase_id}/",
            {
                "items": [
                    {
                        "product": self.product.id,
                        "quantity": 7,
                        "unit_price": "10.00",
                    }
                ]
            },
            format="json",
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 57)

    def test_delete_purchase_removes_stock(self):
        client = auth_client(self.staff)
        response = client.post(
            "/api/purchases/",
            _purchase_payload(self.supplier.id, self.product.id, 10, "10.00", "PUR-3"),
            format="json",
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 60)
        self.assertEqual(
            client.delete(f"/api/purchases/{response.data['id']}/").status_code, 204
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock_quantity, 50)

    def test_validation(self):
        client = auth_client(self.staff)
        empty = {
            "invoice_number": "PUR-EMPTY",
            "items": [],
            "purchase_date": date.today().isoformat(),
        }
        self.assertEqual(
            client.post("/api/purchases/", empty, format="json").status_code, 400
        )
        discount_over = _purchase_payload(
            self.supplier.id, self.product.id, 2, "10.00", "PUR-DISC", "500.00"
        )
        self.assertEqual(
            client.post(
                "/api/purchases/", discount_over, format="json"
            ).status_code,
            400,
        )
        bad_quantity = _purchase_payload(self.supplier.id, self.product.id, 0, "10.00", "PUR-QTY")
        self.assertEqual(
            client.post(
                "/api/purchases/", bad_quantity, format="json"
            ).status_code,
            400,
        )

    def test_purchase_filters(self):
        other = make_supplier("OtherSource")
        Purchase.objects.create(
            invoice_number="PUR-F1",
            supplier=self.supplier,
            user=self.staff,
            total_amount=10,
            payable_amount=10,
            purchase_date=date.today(),
        )
        Purchase.objects.create(
            invoice_number="PUR-F2",
            supplier=other,
            user=self.staff,
            total_amount=10,
            payable_amount=10,
            purchase_date=date.today(),
        )
        data = auth_client(self.staff).get(
            f"/api/purchases/?supplier={self.supplier.id}"
        ).data
        self.assertEqual([p["invoice_number"] for p in data], ["PUR-F1"])