from django.test import TestCase

from inventory.models import DrugInteraction
from tests.helpers import auth_client, make_product, make_staff, make_user

from .services import detect_cart_interactions


class DetectCartInteractionsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.warfarin_aspirin, _ = DrugInteraction.objects.get_or_create(
            drug_a="Warfarin",
            drug_b="Aspirin",
            defaults={"interaction_level": "high_risk"},
        )
        cls.beneficial, _ = DrugInteraction.objects.get_or_create(
            drug_a="Amoxicillin",
            drug_b="Clavulanic acid",
            defaults={"interaction_level": "beneficial"},
        )
        cls.warfarin = make_product(
            name="Warfarin 5mg Tablet", barcode="DI-WAR", stock_quantity=20
        )
        cls.aspirin = make_product(
            name="Aspirin 75mg Tablet", barcode="DI-ASP", stock_quantity=20
        )
        cls.amox = make_product(
            name="Amoxicillin 500mg", barcode="DI-AMX", stock_quantity=20
        )
        cls.clav = make_product(
            name="Clavulanic acid 125mg", barcode="DI-CLV", stock_quantity=20
        )

    def test_detects_high_risk_pair(self):
        found = detect_cart_interactions([self.warfarin, self.aspirin])
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["interaction_id"], self.warfarin_aspirin.id)
        self.assertEqual(found[0]["level"], "high_risk")
        self.assertEqual(found[0]["level_display"], "High Risk")
        self.assertIn("high-risk", found[0]["recommendation"].lower())
        names = {p["name"] for p in found[0]["products"]}
        self.assertEqual(names, {"Warfarin 5mg Tablet", "Aspirin 75mg Tablet"})

    def test_beneficial_is_not_a_warning(self):
        found = detect_cart_interactions([self.amox, self.clav])
        self.assertEqual(found, [])

    def test_beneficial_visible_when_requested(self):
        found = detect_cart_interactions([self.amox, self.clav], include_beneficial=True)
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["level"], "beneficial")

    def test_single_product_has_no_interactions(self):
        self.assertEqual(detect_cart_interactions([self.warfarin]), [])

    def test_unrelated_products_have_no_warnings(self):
        found = detect_cart_interactions([self.warfarin, self.amox])
        self.assertEqual(found, [])

    def test_class_slash_alternatives_match(self):
        ssri = make_product(name="Sertraline 50mg", barcode="DI-SER")
        tramadol = make_product(name="Tramadol 50mg", barcode="DI-TRA")
        DrugInteraction.objects.get_or_create(
            drug_a="SSRI/Sertraline",
            drug_b="Tramadol",
            defaults={"interaction_level": "high_risk"},
        )
        found = detect_cart_interactions([ssri, tramadol])
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["level"], "high_risk")


class CheckInteractionsApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = make_staff("ix_staff")
        cls.clerk = make_user("ix_clerk")
        cls.warfarin = make_product(
            name="Warfarin 5mg", barcode="IX-WAR", stock_quantity=20
        )
        cls.aspirin = make_product(
            name="Aspirin 75mg", barcode="IX-ASP", stock_quantity=20
        )
        cls.napa = make_product(
            name="Napa 500mg", barcode="IX-NAP", stock_quantity=20
        )
        DrugInteraction.objects.get_or_create(
            drug_a="Warfarin", drug_b="Aspirin",
            defaults={"interaction_level": "high_risk"},
        )

    def test_check_endpoint_returns_interactions(self):
        response = auth_client(self.staff).post(
            "/api/interactions/check/",
            {"items": [{"product": self.warfarin.id}, {"product": self.aspirin.id}]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["interactions"][0]["level"], "high_risk")

    def test_check_endpoint_normal_medicines_no_warnings(self):
        response = auth_client(self.staff).post(
            "/api/interactions/check/",
            {"items": [{"product": self.warfarin.id}, {"product": self.napa.id}]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)

    def test_check_endpoint_requires_staff(self):
        from accounts.models import User

        customer = make_user("ix_customer")
        customer.role = User.Role.CUSTOMER
        customer.save(update_fields=["role"])
        response = auth_client(customer).post(
            "/api/interactions/check/",
            {"items": [{"product": self.warfarin.id}]},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_check_endpoint_requires_items(self):
        response = auth_client(self.staff).post(
            "/api/interactions/check/", {}, format="json"
        )
        self.assertEqual(response.status_code, 400)