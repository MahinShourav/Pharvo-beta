"""Focused tests: Supplier.company create/edit round-trip via the API."""

from django.test import TestCase

from tests.helpers import auth_client, make_staff, make_supplier


class SupplierCompanyTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = make_staff("sup_company_staff")

    def test_create_supplier_with_company(self):
        response = auth_client(self.staff).post(
            "/api/inventory/suppliers/",
            {
                "name": "Test Supplier Co",
                "company": "Square Pharmaceuticals Ltd.",
                "contact_person": "Demo Person",
                "phone": "01800-009999",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["company"], "Square Pharmaceuticals Ltd.")
        self.assertEqual(response.data["contact_person"], "Demo Person")

    def test_edit_supplier_company_and_read_back(self):
        supplier = make_supplier("Company Edit Co")
        client = auth_client(self.staff)
        response = client.patch(
            f"/api/inventory/suppliers/{supplier.id}/",
            {"company": "Renata Pharmaceuticals Ltd."},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["company"], "Renata Pharmaceuticals Ltd.")
        detail = client.get(f"/api/inventory/suppliers/{supplier.id}/").data
        self.assertEqual(detail["company"], "Renata Pharmaceuticals Ltd.")

    def test_company_defaults_to_blank(self):
        supplier = make_supplier("No Company Co")
        data = auth_client(self.staff).get(
            f"/api/inventory/suppliers/{supplier.id}/"
        ).data
        self.assertEqual(data["company"], "")
