from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from inventory.models import SupplierRestock
from inventory.services import check_and_update_restock, deduct_sale_stock
from purchases.models import Purchase, PurchaseItem
from sales.models import Sale, SaleItem
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

    def test_supplier_profile(self):
        client = auth_client(self.staff)
        profile = client.get(
            f"/api/inventory/suppliers/{self.supplier.id}/profile/"
        ).data
        self.assertEqual(profile["name"], "Alpha Pharma")
        self.assertEqual(profile["product_count"], 1)
        self.assertEqual(len(profile["products"]), 1)
        self.assertEqual(profile["products"][0]["barcode"], "BC-SUP")
        self.assertEqual(profile["restock_count"], 0)

    def test_supplier_restock_list(self):
        client = auth_client(self.staff)
        restock_list = client.get(
            f"/api/inventory/suppliers/{self.supplier.id}/restock-list/"
        ).data
        self.assertEqual(len(restock_list), 0)

    def test_supplier_restock_list_with_entries(self):
        SupplierRestock.objects.create(
            supplier=self.supplier,
            product=self.product,
            current_stock=2,
            stock_unit="strip",
            threshold=10,
            suggested_quantity=18,
        )
        client = auth_client(self.staff)
        restock_list = client.get(
            f"/api/inventory/suppliers/{self.supplier.id}/restock-list/"
        ).data
        self.assertEqual(len(restock_list), 1)
        self.assertEqual(restock_list[0]["product_name"], self.product.name)
        self.assertEqual(restock_list[0]["status"], "pending")

    def test_supplier_restock_list_filter_by_status(self):
        SupplierRestock.objects.create(
            supplier=self.supplier,
            product=self.product,
            current_stock=2,
            stock_unit="strip",
            threshold=10,
            suggested_quantity=18,
            status=SupplierRestock.Status.ORDERED,
        )
        client = auth_client(self.staff)
        pending = client.get(
            f"/api/inventory/suppliers/{self.supplier.id}/restock-list/?status=pending"
        ).data
        self.assertEqual(len(pending), 0)
        ordered = client.get(
            f"/api/inventory/suppliers/{self.supplier.id}/restock-list/?status=ordered"
        ).data
        self.assertEqual(len(ordered), 1)


class SupplierRestockServiceTests(TestCase):
    """Tests for the restock auto-trigger service logic."""

    @classmethod
    def setUpTestData(cls):
        cls.supplier = make_supplier("RestockSupplier")

    def test_tablet_triggers_at_strip_threshold(self):
        product = make_product(
            barcode="BC-TAB",
            supplier=self.supplier,
            stock_quantity=50,
            reorder_level=10,
            pcs_per_strip=10,
            strips_per_box=10,
        )
        self.assertEqual(product.detect_form_type(), "tablet")
        self.assertEqual(product.restock_unit(), "strip")
        self.assertEqual(product.restock_threshold(), 10)  # 1 strip = 10 pcs

    def test_syrup_triggers_at_one_bottle(self):
        group = make_group("SyrupForm")
        product = make_product(
            barcode="BC-SYR",
            supplier=self.supplier,
            stock_quantity=3,
            reorder_level=5,
            group=group,
        )
        self.assertEqual(product.detect_form_type(), "syrup")
        self.assertEqual(product.restock_unit(), "pc")
        self.assertEqual(product.restock_threshold(), 1)  # 1 bottle = 1 pc

    def test_cream_triggers_at_one_pot(self):
        category = make_category("Topical")
        product = make_product(
            barcode="BC-CRM",
            supplier=self.supplier,
            stock_quantity=2,
            reorder_level=5,
            category=category,
            name="Hydrocortisone Cream 1%",
        )
        self.assertEqual(product.detect_form_type(), "cream")
        self.assertEqual(product.restock_unit(), "pc")
        self.assertEqual(product.restock_threshold(), 1)  # 1 pot = 1 pc

    def test_check_and_update_creates_entry_when_below_threshold(self):
        product = make_product(
            barcode="BC-LOW",
            supplier=self.supplier,
            stock_quantity=3,
            reorder_level=10,
            pcs_per_strip=10,
        )
        check_and_update_restock(product)
        entry = SupplierRestock.objects.get(
            supplier=self.supplier, product=product
        )
        self.assertEqual(entry.status, SupplierRestock.Status.PENDING)
        self.assertEqual(entry.current_stock, 3)
        self.assertEqual(entry.threshold, 10)  # 1 strip

    def test_check_and_update_does_not_create_when_above_threshold(self):
        product = make_product(
            barcode="BC-HIGH",
            supplier=self.supplier,
            stock_quantity=50,
            reorder_level=10,
            pcs_per_strip=10,
        )
        check_and_update_restock(product)
        self.assertFalse(
            SupplierRestock.objects.filter(
                supplier=self.supplier, product=product
            ).exists()
        )

    def test_check_and_update_no_duplicate_entries(self):
        product = make_product(
            barcode="BC-DUP",
            supplier=self.supplier,
            stock_quantity=3,
            reorder_level=10,
            pcs_per_strip=10,
        )
        check_and_update_restock(product)
        check_and_update_restock(product)
        self.assertEqual(
            SupplierRestock.objects.filter(
                supplier=self.supplier, product=product
            ).count(),
            1,
        )

    def test_check_and_update_updates_existing_entry(self):
        product = make_product(
            barcode="BC-UPD-R",
            supplier=self.supplier,
            stock_quantity=3,
            reorder_level=10,
            pcs_per_strip=10,
        )
        check_and_update_restock(product)
        entry = SupplierRestock.objects.get(
            supplier=self.supplier, product=product
        )
        old_updated = entry.updated_at
        product.stock_quantity = 1
        product.save(update_fields=["stock_quantity"])
        check_and_update_restock(product)
        entry.refresh_from_db()
        self.assertEqual(entry.current_stock, 1)
        self.assertGreater(entry.updated_at, old_updated)

    def test_stock_recovery_updates_snapshot_but_keeps_entry(self):
        product = make_product(
            barcode="BC-REC",
            supplier=self.supplier,
            stock_quantity=3,
            reorder_level=10,
            pcs_per_strip=10,
        )
        check_and_update_restock(product)
        product.stock_quantity = 50
        product.save(update_fields=["stock_quantity"])
        check_and_update_restock(product)
        entry = SupplierRestock.objects.get(
            supplier=self.supplier, product=product
        )
        self.assertEqual(entry.current_stock, 50)
        self.assertEqual(entry.status, SupplierRestock.Status.PENDING)

    def test_product_without_supplier_skipped(self):
        product = make_product(barcode="BC-NOSUP", stock_quantity=0, reorder_level=10)
        check_and_update_restock(product)
        self.assertFalse(SupplierRestock.objects.filter(product=product).exists())

    def test_suggested_qty_formula(self):
        product = make_product(
            barcode="BC-SUG",
            supplier=self.supplier,
            stock_quantity=3,
            reorder_level=10,
        )
        suggested = product.restock_suggested_qty()
        self.assertEqual(suggested, 17)  # 10 * 2 - 3 = 17

    def test_suggested_qty_minimum_one(self):
        product = make_product(
            barcode="BC-SUG-MIN",
            supplier=self.supplier,
            stock_quantity=50,
            reorder_level=10,
        )
        suggested = product.restock_suggested_qty()
        self.assertEqual(suggested, 1)  # max(10*2 - 50, 1) = 1


class SupplierRestockAPITests(TestCase):
    """Tests for the SupplierRestock REST API endpoints."""

    @classmethod
    def setUpTestData(cls):
        cls.staff = make_staff("restock_staff")
        cls.clerk = make_user("restock_clerk")
        cls.supplier = make_supplier("APISupplier")
        cls.product = make_product(
            barcode="BC-API",
            supplier=cls.supplier,
            stock_quantity=3,
            reorder_level=10,
            pcs_per_strip=10,
        )

    def test_unauthenticated_returns_401(self):
        self.assertEqual(APIClient().get("/api/inventory/restock/").status_code, 401)

    def test_non_staff_cannot_access_restock(self):
        customer_user = UserModel.objects.create_user(
            username="restock_customer",
            password="testpass123",
            role=UserModel.Role.CUSTOMER,
            is_staff=False,
        )
        client = auth_client(customer_user)
        self.assertEqual(client.get("/api/inventory/restock/").status_code, 403)

    def test_staff_can_list_restock(self):
        SupplierRestock.objects.create(
            supplier=self.supplier,
            product=self.product,
            current_stock=3,
            stock_unit="strip",
            threshold=10,
            suggested_quantity=17,
        )
        client = auth_client(self.staff)
        data = client.get("/api/inventory/restock/").data
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["product_name"], self.product.name)

    def test_staff_can_filter_by_supplier(self):
        supplier2 = make_supplier("APISupplier2")
        product2 = make_product(
            barcode="BC-API2",
            supplier=supplier2,
            stock_quantity=1,
            reorder_level=5,
        )
        SupplierRestock.objects.create(
            supplier=self.supplier,
            product=self.product,
            current_stock=3,
            stock_unit="strip",
            threshold=10,
            suggested_quantity=17,
        )
        SupplierRestock.objects.create(
            supplier=supplier2,
            product=product2,
            current_stock=1,
            stock_unit="pc",
            threshold=1,
            suggested_quantity=9,
        )
        client = auth_client(self.staff)
        data = client.get(f"/api/inventory/restock/?supplier={self.supplier.id}").data
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["supplier_name"], "APISupplier")

    def test_staff_can_update_status(self):
        entry = SupplierRestock.objects.create(
            supplier=self.supplier,
            product=self.product,
            current_stock=3,
            stock_unit="strip",
            threshold=10,
            suggested_quantity=17,
        )
        client = auth_client(self.staff)
        response = client.post(
            f"/api/inventory/restock/{entry.id}/update-status/",
            {"status": "ordered", "notes": "Ordered from supplier"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "ordered")
        self.assertEqual(response.data["notes"], "Ordered from supplier")

    def test_staff_cannot_set_invalid_status(self):
        entry = SupplierRestock.objects.create(
            supplier=self.supplier,
            product=self.product,
            current_stock=3,
            stock_unit="strip",
            threshold=10,
            suggested_quantity=17,
        )
        client = auth_client(self.staff)
        response = client.post(
            f"/api/inventory/restock/{entry.id}/update-status/",
            {"status": "invalid_status"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_staff_can_delete_restock_entry(self):
        entry = SupplierRestock.objects.create(
            supplier=self.supplier,
            product=self.product,
            current_stock=3,
            stock_unit="strip",
            threshold=10,
            suggested_quantity=17,
        )
        client = auth_client(self.staff)
        response = client.delete(f"/api/inventory/restock/{entry.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(SupplierRestock.objects.filter(id=entry.id).exists())

    def test_check_all_action(self):
        client = auth_client(self.staff)
        response = client.post("/api/inventory/restock/check-all/", format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("created", response.data)
        self.assertIn("updated", response.data)

    def test_product_restock_check_action(self):
        client = auth_client(self.staff)
        response = client.post(
            f"/api/inventory/products/{self.product.id}/restock-check/",
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["product_name"], self.product.name)

    def test_product_restock_check_without_supplier(self):
        product_no_sup = make_product(barcode="BC-NORESTOCK")
        client = auth_client(self.staff)
        response = client.post(
            f"/api/inventory/products/{product_no_sup.id}/restock-check/",
            format="json",
        )
        self.assertEqual(response.status_code, 400)


class PurchaseStockIntegrationTests(TestCase):
    """Tests that purchase stock changes trigger restock checks."""

    @classmethod
    def setUpTestData(cls):
        cls.staff = make_staff("purch_int_staff")
        cls.supplier = make_supplier("PurchIntSupplier")

    def test_purchase_stock_add_triggers_restock_check(self):
        product = make_product(
            barcode="BC-PI1",
            supplier=self.supplier,
            stock_quantity=0,
            reorder_level=10,
            pcs_per_strip=10,
        )
        client = auth_client(self.staff)
        response = client.post(
            "/api/purchases/",
            {
                "invoice_number": "PI-NEW",
                "supplier": self.supplier.id,
                "purchase_date": date.today().isoformat(),
                "items": [
                    {
                        "product": product.id,
                        "quantity": 2,
                        "unit_price": "50.00",
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        product.refresh_from_db()
        # 2 PCs per_strip=10 so each quantity=1 PC, total 2 PCs
        self.assertEqual(product.stock_quantity, 2)

    def test_sale_stock_deduction_triggers_restock_check(self):
        product = make_product(
            barcode="BC-SI1",
            supplier=self.supplier,
            stock_quantity=12,
            reorder_level=10,
            pcs_per_strip=10,
        )
        sale = Sale.objects.create(
            invoice_number="SI-1",
            user=self.staff,
            total_amount=100,
            discount=0,
            payable_amount=100,
            payment_method="cash",
            sale_date=date.today(),
        )
        item = SaleItem.objects.create(
            sale=sale,
            product=product,
            unit="strip",
            quantity=1,
            quantity_pcs=10,
            unit_price=50,
            subtotal=50,
        )
        deduct_sale_stock([item])
        product.refresh_from_db()
        self.assertEqual(product.stock_quantity, 2)
        self.assertTrue(
            SupplierRestock.objects.filter(
                supplier=self.supplier, product=product
            ).exists()
        )
