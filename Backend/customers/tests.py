from datetime import date, timedelta

from django.test import TestCase
from rest_framework.test import APIClient

from tests.helpers import auth_client, make_customer, make_staff, make_user

from customers.models import Customer


class CustomerTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = make_staff("cust_staff")
        cls.clerk = make_user("cust_clerk")

    def test_crud_and_membership(self):
        client = auth_client(self.staff)
        response = client.post(
            "/api/customers/",
            {
                "name": "Alice",
                "phone": "555-1000",
                "email": "alice@example.com",
                "address": "1st Avenue",
                "membership_tier": "gold",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["is_member"])
        self.assertEqual(response.data["membership_tier"], "gold")
        default_response = client.post(
            "/api/customers/",
            {
                "name": "Bob",
                "phone": "555-2000",
                "email": "bob@example.com",
                "address": "2nd Avenue",
            },
            format="json",
        )
        self.assertFalse(default_response.data["is_member"])

    def test_validation(self):
        client = auth_client(self.staff)
        payloads = (
            {"name": "  ", "phone": "555-1", "email": "a@b.c", "address": "x"},
            {"name": "x", "phone": "  ", "email": "a@b.c", "address": "x"},
            {"name": "x", "phone": "555-1", "email": "  ", "address": "x"},
            {"name": "x", "phone": "555-1", "email": "a@b.c", "address": " "},
            {
                "name": "x",
                "phone": "555-1",
                "email": "a@b.c",
                "address": "x",
                "loyalty_points": -1,
            },
            {
                "name": "x",
                "phone": "555-1",
                "email": "a@b.c",
                "address": "x",
                "date_of_birth": (date.today() + timedelta(days=1)).isoformat(),
            },
        )
        for payload in payloads:
            self.assertEqual(
                client.post("/api/customers/", payload, format="json").status_code,
                400,
                msg=payload,
            )

    def test_permissions_and_search(self):
        from django.contrib.auth import get_user_model

        UserModel = get_user_model()
        customer_role_user = UserModel.objects.create_user(
            username="cust_portal_user",
            password="testpass123",
            role=UserModel.Role.CUSTOMER,
        )
        self.assertEqual(
            auth_client(customer_role_user)
            .post(
                "/api/customers/",
                {
                    "name": "x",
                    "phone": "555-3",
                    "email": "a@b.c",
                    "address": "x",
                },
                format="json",
            ).status_code,
            403,
        )
        self.assertEqual(APIClient().get("/api/customers/").status_code, 401)
        make_customer(name="Alice Search", phone="555-5000")
        data = auth_client(self.staff).get("/api/customers/?search=alice").data
        self.assertEqual(data[0]["name"], "Alice Search")

    def test_pharmacist_can_keep_customer_contacts_up_to_date(self):
        from django.contrib.auth import get_user_model

        UserModel = get_user_model()
        pharmacist = UserModel.objects.create_user(
            username="cust_pharmacist",
            password="testpass123",
            role=UserModel.Role.PHARMACIST,
            is_staff=False,
        )
        client = auth_client(pharmacist)
        created = client.post(
            "/api/customers/",
            {
                "name": "Dalia",
                "phone": "555-9000",
                "email": "dalia@example.com",
                "address": "4th Avenue",
                "notes": "Allergic to penicillin",
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertFalse(created.data["is_member"])
        self.assertEqual(created.data["notes"], "Allergic to penicillin")

        updated = client.put(
            f"/api/customers/{created.data['id']}/",
            {
                "name": "Dalia Updated",
                "phone": "555-9001",
                "email": created.data["email"],
                "address": "5th Avenue",
                "date_of_birth": created.data.get("date_of_birth"),
                "membership_tier": created.data["membership_tier"],
                "notes": "Allergic to penicillin and amoxicillin",
            },
            format="json",
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data["name"], "Dalia Updated")
        self.assertEqual(updated.data["phone"], "555-9001")
        self.assertEqual(updated.data["notes"], "Allergic to penicillin and amoxicillin")

    def test_pharmacist_cannot_assign_or_change_membership_tier(self):
        from django.contrib.auth import get_user_model

        UserModel = get_user_model()
        pharmacist = UserModel.objects.create_user(
            username="cust_pharm_tier",
            password="testpass123",
            role=UserModel.Role.PHARMACIST,
            is_staff=False,
        )
        client = auth_client(pharmacist)
        response = client.post(
            "/api/customers/",
            {
                "name": "Emon",
                "phone": "555-9100",
                "email": "emon@example.com",
                "address": "1st Avenue",
                "membership_tier": "gold",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("membership_tier", response.data)

        bronze = make_customer(name="Bronze Customer", phone="555-9200", membership_tier="bronze")
        unchanged = client.put(
            f"/api/customers/{bronze.id}/",
            {
                "name": "Bronze Customer",
                "phone": "555-9200",
                "email": bronze.email,
                "address": bronze.address,
                "membership_tier": "bronze",
                "notes": "Prefers morning calls",
            },
            format="json",
        )
        self.assertEqual(unchanged.status_code, 200)
        self.assertEqual(unchanged.data["membership_tier"], "bronze")

        changed = client.put(
            f"/api/customers/{bronze.id}/",
            {
                "name": "Bronze Customer",
                "phone": "555-9200",
                "email": bronze.email,
                "address": bronze.address,
                "membership_tier": "silver",
                "notes": "Prefers morning calls",
            },
            format="json",
        )
        self.assertEqual(changed.status_code, 400)
        self.assertIn("membership_tier", changed.data)

    def test_pharmacist_cannot_delete_customers(self):
        from django.contrib.auth import get_user_model

        UserModel = get_user_model()
        pharmacist = UserModel.objects.create_user(
            username="cust_pharm_del",
            password="testpass123",
            role=UserModel.Role.PHARMACIST,
            is_staff=False,
        )
        target = make_customer(name="Keep Me", phone="555-9300")
        response = auth_client(pharmacist).delete(f"/api/customers/{target.id}/")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Customer.objects.filter(pk=target.id).count(), 1)

    def test_admin_can_assign_tier_and_delete(self):
        target = make_customer(name="Admin Managed", phone="555-9400")
        response = auth_client(self.staff).delete(f"/api/customers/{target.id}/")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(Customer.objects.filter(pk=target.id).count(), 0)