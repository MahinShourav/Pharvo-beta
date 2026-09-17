from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase

from purchases.models import Purchase, PurchaseItem
from tests.helpers import (
    auth_client,
    make_category,
    make_group,
    make_product,
    make_staff,
    make_supplier,
    make_user,
)

UserModel = get_user_model()

PRODUCT_PAYLOAD = {
    "name": "Paracetamol",
    "barcode": "BC-PARA",
    "unit_price": "50.00",
    "cost_price": "30.00",
}


class ProductTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = make_staff("prod_staff")
        cls.clerk = make_user("prod_clerk")
        cls.category = make_category("Vitamins")
        cls.supplier = make_supplier("MediSource")
        cls.group = make_group("Antibiotics")

    def test_staff_can_create_product_with_relations_and_sensitive_flag(self):
        client = auth_client(self.staff)
        payload = {
            **PRODUCT_PAYLOAD,
            "category": self.category.id,
            "supplier": self.supplier.id,
            "group": self.group.id,
            "is_sensitive": True,
        }
        response = client.post("/api/inventory/products/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["stock_quantity"], 0)
        self.assertTrue(response.data["is_sensitive"])
        self.assertEqual(response.data["category_name"], "Vitamins")

    def test_non_staff_cannot_create_product(self):
        response = auth_client(self.clerk).post(
            "/api/inventory/products/", PRODUCT_PAYLOAD, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_unauthenticated_returns_401(self):
        from rest_framework.test import APIClient

        self.assertEqual(
            APIClient().get("/api/inventory/products/").status_code, 401
        )

    def test_staff_can_update_and_delete(self):
        product = make_product(barcode="BC-UPD")
        client = auth_client(self.staff)
        response = client.patch(
            f"/api/inventory/products/{product.id}/",
            {"name": "Renamed", "unit_price": "12.00"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["name"], "Renamed")
        response = client.delete(f"/api/inventory/products/{product.id}/")
        self.assertEqual(response.status_code, 204)

    def test_stock_validation(self):
        client = auth_client(self.staff)
        cases = [
            {**PRODUCT_PAYLOAD, "unit_price": "-5"},
            {**PRODUCT_PAYLOAD, "cost_price": "-5"},
            {**PRODUCT_PAYLOAD, "stock_quantity": "-1"},
            {**PRODUCT_PAYLOAD, "reorder_level": "-1"},
            {**PRODUCT_PAYLOAD, "barcode": "  "},
        ]
        for payload in cases:
            response = client.post(
                "/api/inventory/products/", payload, format="json"
            )
            self.assertEqual(response.status_code, 400, msg=payload)

    def test_category_supplier_filters(self):
        make_product(barcode="BC-F1", category=self.category, supplier=self.supplier)
        make_product(barcode="BC-F2")
        client = auth_client(self.staff)
        data = client.get(
            f"/api/inventory/products/?category={self.category.id}"
            f"&supplier={self.supplier.id}"
        ).data
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["barcode"], "BC-F1")

    def test_medicine_group_product_count(self):
        group = make_group("Analgesics")
        make_product(barcode="BC-G1", group=group)
        client = auth_client(self.staff)
        self.assertEqual(
            client.post(
                "/api/inventory/groups/", {"name": "NewGroup"}, format="json"
            ).status_code,
            201,
        )
        groups = client.get("/api/inventory/groups/").data
        row = next(g for g in groups if g["id"] == group.id)
        self.assertEqual(row["product_count"], 1)

    def test_drug_interaction_validation(self):
        client = auth_client(self.staff)
        response = client.post(
            "/api/inventory/interactions/",
            {
                "drug_a": "Aspirin",
                "drug_b": "Ibuprofen",
                "interaction_level": "caution",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        reversed_response = client.post(
            "/api/inventory/interactions/",
            {
                "drug_a": "ibuprofen",
                "drug_b": "aspirin",
                "interaction_level": "caution",
            },
            format="json",
        )
        self.assertEqual(reversed_response.status_code, 400)
        self_response = client.post(
            "/api/inventory/interactions/",
            {
                "drug_a": "Aspirin",
                "drug_b": "Aspirin",
                "interaction_level": "caution",
            },
            format="json",
        )
        self.assertEqual(self_response.status_code, 400)

    def test_expiry_detection(self):
        make_product(barcode="BC-EXP", expiry_date=date.today() - timedelta(days=3))
        make_product(barcode="BC-NEAR", expiry_date=date.today() + timedelta(days=10))
        make_product(barcode="BC-OK", expiry_date=date.today() + timedelta(days=90))
        client = auth_client(self.staff)
        expired = client.get(
            "/api/inventory/products/?expiry_status=expired"
        ).data
        near = client.get(
            "/api/inventory/products/?expiry_status=near_expiry"
        ).data
        self.assertEqual([p["barcode"] for p in expired], ["BC-EXP"])
        self.assertEqual([p["barcode"] for p in near], ["BC-NEAR"])
        summary = client.get(
            "/api/inventory/products/expiry-summary/"
        ).data
        self.assertEqual(summary["expired"], 1)
        self.assertEqual(summary["near_expiry"], 1)
        self.assertEqual(summary["total"], 3)


class SupplierTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = make_staff("sup_staff")
        cls.clerk = make_user("sup_clerk")
        cls.supplier = make_supplier("Alpha Pharma")
        cls.product = make_product(barcode="BC-SUP", supplier=cls.supplier)
        cls.purchase = Purchase.objects.create(
            invoice_number="SUP-1",
            supplier=cls.supplier,
            user=cls.staff,
            total_amount=50,
            discount=5,
            payable_amount=45,
            purchase_date=date.today(),
        )
        PurchaseItem.objects.create(
            purchase=cls.purchase,
            product=cls.product,
            quantity=5,
            unit_price=10,
            subtotal=50,
        )

    def test_supplier_crud_and_permissions(self):
        client = auth_client(self.staff)
        response = client.post(
            "/api/inventory/suppliers/", {"name": "New Supplier"}, format="json"
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            auth_client(self.clerk)
            .post(
                "/api/inventory/suppliers/", {"name": "Denied"}, format="json"
            )
            .status_code,
            403,
        )

    def test_pharmacist_supplier_master_is_read_only(self):
        pharmacist = UserModel.objects.create_user(
            username="sup_pharmacist",
            password="testpass123",
            role=UserModel.Role.PHARMACIST,
            is_staff=False,
        )
        client = auth_client(pharmacist)
        self.assertEqual(client.get("/api/inventory/suppliers/").status_code, 200)
        self.assertEqual(
            client.post(
                "/api/inventory/suppliers/", {"name": "Blocked"}, format="json"
            ).status_code,
            403,
        )
        self.assertEqual(
            client.patch(
                f"/api/inventory/suppliers/{self.supplier.id}/", {"name": "Hacked"}
            ).status_code,
            403,
        )
        self.assertEqual(
            client.delete(f"/api/inventory/suppliers/{self.supplier.id}/").status_code,
            403,
        )

    def test_supplier_products_and_purchases(self):
        client = auth_client(self.staff)
        products = client.get(
            f"/api/inventory/suppliers/{self.supplier.id}/products/"
        ).data
        self.assertEqual(products[0]["barcode"], "BC-SUP")
        purchases = client.get(
            f"/api/inventory/suppliers/{self.supplier.id}/purchases/"
        ).data
        self.assertEqual(purchases[0]["invoice_number"], "SUP-1")

    def test_supplier_summary(self):
        client = auth_client(self.staff)
        summary = client.get(
            f"/api/inventory/suppliers/{self.supplier.id}/summary/"
        ).data
        self.assertEqual(summary["product_count"], 1)
        self.assertEqual(summary["purchase_count"], 1)
        self.assertEqual(summary["total_quantity_purchased"], 5)
        self.assertEqual(float(summary["total_purchase_amount"]), 50.0)
        self.assertEqual(float(summary["total_payable_amount"]), 45.0)