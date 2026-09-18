"""Focused WhatsApp send-order tests: no false sends, staff-only, safe retry.

The provider HTTP layer is mocked — these tests never touch the network and
use only invented credentials, so no secret can leak.
"""

import io
import json
from unittest import mock
from urllib.error import HTTPError

from django.test import TestCase, override_settings

from notifications import whatsapp
from tests.helpers import auth_client, make_staff


def _order_payload(**overrides):
    payload = {
        "order_ref": "SO-0001",
        "supplier_name": "MediSource",
        "supplier_phone": "01711-234567",
        "items": [{"name": "Paracetamol", "quantity": 10}],
        "estimated_total": "300.00",
        "delivery_note": "Please deliver within 2 days.",
        "client_ref": "abc:1",
    }
    payload.update(overrides)
    return payload


def _ok_response(message_id="wamid.TEST123"):
    response = mock.MagicMock()
    response.status = 200
    response.read.return_value = json.dumps(
        {"messages": [{"id": message_id}]}
    ).encode("utf-8")
    response.__enter__.return_value = response
    return response


@override_settings(
    WHATSAPP_PHONE_NUMBER_ID="", WHATSAPP_ACCESS_TOKEN=""
)
class WhatsAppUnconfiguredTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = make_staff("wa_staff")

    def test_unconfigured_returns_503_and_sends_nothing(self):
        with mock.patch(
            "notifications.whatsapp.urlopen"
        ) as urlopen_mock:
            response = auth_client(self.staff).post(
                "/api/notifications/whatsapp/send-order/",
                _order_payload(),
                format="json",
            )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["code"], "whatsapp_not_configured")
        urlopen_mock.assert_not_called()


@override_settings(
    WHATSAPP_PHONE_NUMBER_ID="123456",
    WHATSAPP_ACCESS_TOKEN="test-token",
    WHATSAPP_API_URL="https://graph.example.test/v21.0",
)
class WhatsAppSendTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = make_staff("wa_staff2")

    def test_customer_cannot_send(self):
        from django.contrib.auth import get_user_model

        customer = get_user_model().objects.create_user(
            username="wa_customer",
            password="testpass123",
            role=get_user_model().Role.CUSTOMER,
            is_staff=False,
        )
        with mock.patch(
            "notifications.whatsapp.urlopen"
        ) as urlopen_mock:
            response = auth_client(customer).post(
                "/api/notifications/whatsapp/send-order/",
                _order_payload(),
                format="json",
            )
        self.assertEqual(response.status_code, 403)
        urlopen_mock.assert_not_called()

    def test_invalid_recipient_is_400_without_send(self):
        with mock.patch(
            "notifications.whatsapp.urlopen"
        ) as urlopen_mock:
            response = auth_client(self.staff).post(
                "/api/notifications/whatsapp/send-order/",
                _order_payload(supplier_phone="no-number"),
                format="json",
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "invalid_recipient")
        urlopen_mock.assert_not_called()

    def test_empty_items_is_400_without_send(self):
        with mock.patch(
            "notifications.whatsapp.urlopen"
        ) as urlopen_mock:
            response = auth_client(self.staff).post(
                "/api/notifications/whatsapp/send-order/",
                _order_payload(items=[]),
                format="json",
            )
        self.assertEqual(response.status_code, 400)
        urlopen_mock.assert_not_called()

    def test_success_returns_message_id_and_uses_bearer_auth(self):
        with mock.patch(
            "notifications.whatsapp.urlopen", return_value=_ok_response()
        ) as urlopen_mock:
            response = auth_client(self.staff).post(
                "/api/notifications/whatsapp/send-order/",
                _order_payload(),
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "sent")
        self.assertEqual(response.data["message_id"], "wamid.TEST123")
        self.assertEqual(response.data["to"], "8801711234567")
        sent_request = urlopen_mock.call_args[0][0]
        self.assertEqual(
            sent_request.get_header("Authorization"), "Bearer test-token"
        )
        body = json.loads(sent_request.data.decode("utf-8"))
        self.assertEqual(body["to"], "8801711234567")
        self.assertIn("SO-0001", body["text"]["body"])
        self.assertIn("Paracetamol", body["text"]["body"])

    def test_provider_failure_is_502_and_token_never_leaks(self):
        error = HTTPError(
            "https://graph.example.test/",
            400,
            "Bad Request",
            {},
            io.BytesIO(b'{"error": {"message": "bad phone"}}'),
        )
        with mock.patch(
            "notifications.whatsapp.urlopen", side_effect=error
        ):
            response = auth_client(self.staff).post(
                "/api/notifications/whatsapp/send-order/",
                _order_payload(),
                format="json",
            )
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.data["code"], "whatsapp_provider_error")
        content = json.dumps(response.data)
        self.assertNotIn("test-token", content)
        # The real provider reason reaches the user (no false generic only).
        self.assertIn("bad phone", response.data["detail"])

    def test_recipient_normalizes_to_e164_digits_only(self):
        self.assertEqual(
            whatsapp.normalize_recipient("01601969980"), "8801601969980"
        )
        self.assertEqual(
            whatsapp.normalize_recipient("8801601969980"), "8801601969980"
        )
        self.assertEqual(
            whatsapp.normalize_recipient("+880 160-1969980"), "8801601969980"
        )
        self.assertIsNone(whatsapp.normalize_recipient("no-number"))
        self.assertIsNone(whatsapp.normalize_recipient("123"))
        for recipient in (
            whatsapp.normalize_recipient("01601969980"),
            whatsapp.normalize_recipient("8801601969980"),
        ):
            self.assertNotIn("+", recipient)

    def test_compose_uses_box_and_pc_units(self):
        text = whatsapp.compose_order_message(
            order_ref="SO-0043",
            pharmacy={"name": "PHARVO Pharmacy", "phone": "", "address": ""},
            supplier_name="MediSource",
            items=[
                {"name": "Napa 500mg", "quantity": 5, "unit": "box"},
                {"name": "Hydrocortisone Cream", "quantity": 3, "unit": "pc"},
                {"name": "Single Box Med", "quantity": 1, "unit": "box"},
                {"name": "Legacy Line", "quantity": 2},
            ],
            estimated_total="100.00",
            delivery_note="",
        )
        self.assertIn("Napa 500mg: 5 Boxes", text)
        self.assertIn("Hydrocortisone Cream: 3 PC", text)
        self.assertIn("Single Box Med: 1 Box", text)
        # Lines without a unit keep the legacy PC wording.
        self.assertIn("Legacy Line: 2 PC", text)

    def test_unit_passthrough_and_invalid_unit_fallback(self):
        from notifications.views import WhatsAppOrderView

        cleaned = WhatsAppOrderView._clean_items(
            [
                {"name": "Napa", "quantity": 5, "unit": "box"},
                {"name": "Cream", "quantity": 3, "unit": "PC"},
                {"name": "Weird", "quantity": 2, "unit": "carton"},
            ]
        )
        self.assertEqual(
            cleaned,
            [
                {"name": "Napa", "quantity": 5, "unit": "box"},
                {"name": "Cream", "quantity": 3, "unit": "pc"},
                {"name": "Weird", "quantity": 2, "unit": "pc"},
            ],
        )

    def test_compose_covers_order_pharmacy_medicines_delivery(self):
        text = whatsapp.compose_order_message(
            order_ref="SO-0042",
            pharmacy={"name": "PHARVO Pharmacy", "phone": "0100", "address": "Dhaka"},
            supplier_name="MediSource",
            items=[{"name": "Napa", "quantity": 20}],
            estimated_total="600.00",
            delivery_note="By Friday",
        )
        for expected in (
            "SO-0042",
            "PHARVO Pharmacy",
            "MediSource",
            "Napa",
            "20 PC",
            "600.00",
            "By Friday",
            "Dhaka",
        ):
            self.assertIn(expected, text)

    def test_compose_header_and_order_date(self):
        text = whatsapp.compose_order_message(
            order_ref="SO-0099",
            pharmacy={"name": "PHARVO Pharmacy", "phone": "", "address": ""},
            supplier_name="Rafi",
            items=[{"name": "Napa 500mg", "quantity": 5, "unit": "box"}],
            estimated_total="180.00",
            delivery_note="",
            order_date="2026-09-17",
        )
        self.assertIn("PHARVO Supplier Order", text)
        self.assertIn("Order ID: SO-0099", text)
        self.assertIn("Order date: 2026-09-17", text)
        self.assertIn("Napa 500mg: 5 Boxes", text)

    def test_view_passes_order_date_into_message(self):
        with mock.patch(
            "notifications.whatsapp.urlopen", return_value=_ok_response()
        ) as urlopen_mock:
            response = auth_client(self.staff).post(
                "/api/notifications/whatsapp/send-order/",
                _order_payload(order_date="2026-09-17"),
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        body = json.loads(urlopen_mock.call_args[0][0].data.decode("utf-8"))
        self.assertIn("Order date: 2026-09-17", body["text"]["body"])
