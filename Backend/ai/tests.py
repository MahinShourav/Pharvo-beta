"""Tests for the AI decision-support endpoint (no DB writes by the app itself)."""

from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User

from .inventory_lookup import find_available_medicines
from .predictor import normalize_query, predict_health_problem


class PredictorUnitTests(TestCase):
    def test_empty_query_raises(self):
        with self.assertRaises(ValueError):
            predict_health_problem("   ")

    def test_gastric_normalization(self):
        out = normalize_query("gas er problem")
        self.assertIn("gastric acidity problem", out)

    def test_predict_returns_guardrails(self):
        result = predict_health_problem("amar jor hoyeche")
        self.assertEqual(result["problem_id"], "HP11")
        self.assertTrue(result["requires_pharmacist_review"])
        self.assertIsNone(result["confidence"])
        self.assertIn("Paracetamol", result["candidate_generics"])

    def test_inventory_lookup_empty_input(self):
        self.assertEqual(find_available_medicines([]), [])


class AiQueryApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="ai_tester", password="testpass123", role="admin"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_blank_text_returns_400(self):
        response = self.client.post(
            "/api/ai/query/", {"text": "   "}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_query_returns_classification_and_stock_shape(self):
        response = self.client.post(
            "/api/ai/query/", {"text": "amar jor hoyeche"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["problem_id"], "HP11")
        self.assertTrue(data["requires_pharmacist_review"])
        self.assertIn("inventory_matches", data)

    def test_unauthenticated_returns_401(self):
        anon = APIClient()
        response = anon.post(
            "/api/ai/query/", {"text": "fever"}, format="json"
        )
        self.assertEqual(response.status_code, 401)
