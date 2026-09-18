from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsPharmacyStaff

from . import whatsapp
from .models import Notification
from .serializers import NotificationSerializer
from .services import refresh_alerts


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsPharmacyStaff]

    def get_queryset(self):
        queryset = Notification.objects.select_related("product")
        is_read = self.request.query_params.get("is_read")
        severity = self.request.query_params.get("severity")
        notification_type = self.request.query_params.get("type")
        if is_read is not None:
            queryset = queryset.filter(
                is_read=is_read.lower() in ("1", "true", "yes")
            )
        if severity:
            queryset = queryset.filter(severity=severity)
        if notification_type:
            queryset = queryset.filter(type=notification_type)
        return queryset

    def list(self, request, *args, **kwargs):
        refresh_alerts()
        return super().list(request, *args, **kwargs)

    @action(detail=True, methods=["patch"], url_path="read")
    def read(self, request, pk=None):
        notification = self.get_object()
        if not notification.is_read:
            notification.is_read = True
            notification.save(update_fields=["is_read"])
        return Response(self.get_serializer(notification).data)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        marked = Notification.objects.filter(is_read=False).update(is_read=True)
        return Response({"marked_read": marked})

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        refresh_alerts()
        count = Notification.objects.filter(is_read=False).count()
        return Response({"unread_count": count})


class WhatsAppOrderView(APIView):
    """Approve-and-send a supplier order over WhatsApp (pharmacy staff only).

    The server composes the message from the validated payload and sends it
    through the configured provider. Nothing is marked sent on failure: a
    missing configuration yields 503 and a provider failure yields 502, both
    without recording any delivery.
    """

    permission_classes = [IsPharmacyStaff]

    def post(self, request):
        if not whatsapp.is_configured():
            return Response(
                {
                    "code": "whatsapp_not_configured",
                    "detail": (
                        "WhatsApp sending is not configured on the server. "
                        "Set WHATSAPP_PHONE_NUMBER_ID and "
                        "WHATSAPP_ACCESS_TOKEN. Nothing was sent."
                    ),
                },
                status=503,
            )

        data = request.data if isinstance(request.data, dict) else {}
        order_ref = str(data.get("order_ref") or "").strip()[:40]
        supplier_name = str(data.get("supplier_name") or "").strip()[:255]
        delivery_note = str(data.get("delivery_note") or "").strip()[:500]
        order_date = str(data.get("order_date") or "").strip()[:20]
        client_ref = str(data.get("client_ref") or "").strip()[:120]
        recipient = whatsapp.normalize_recipient(data.get("supplier_phone"))
        items = self._clean_items(data.get("items"))
        total = data.get("estimated_total")

        if not order_ref:
            return Response(
                {"code": "invalid_order", "detail": "order_ref is required."},
                status=400,
            )
        if not supplier_name:
            return Response(
                {
                    "code": "invalid_supplier",
                    "detail": "supplier_name is required.",
                },
                status=400,
            )
        if recipient is None:
            return Response(
                {
                    "code": "invalid_recipient",
                    "detail": (
                        "The supplier has no usable WhatsApp number "
                        "(phone with 7-15 digits required). Nothing was sent."
                    ),
                },
                status=400,
            )
        if not items:
            return Response(
                {
                    "code": "invalid_items",
                    "detail": "At least one medicine with quantity >= 1 is required.",
                },
                status=400,
            )
        try:
            total_value = max(float(total), 0)
        except (TypeError, ValueError):
            return Response(
                {
                    "code": "invalid_total",
                    "detail": "estimated_total must be a non-negative number.",
                },
                status=400,
            )

        text = whatsapp.compose_order_message(
            order_ref=order_ref,
            pharmacy=whatsapp.pharmacy_details(),
            supplier_name=supplier_name,
            items=items,
            estimated_total=f"{total_value:.2f}",
            delivery_note=delivery_note,
            order_date=order_date,
        )
        try:
            message_id = whatsapp.send_text_message(recipient, text)
        except whatsapp.WhatsAppError as exc:
            # Never mark anything sent: the caller keeps the draft. The real
            # provider reason is surfaced so staff can act on it.
            provider_bit = (
                f" Provider said: {exc.detail}" if getattr(exc, "detail", "") else ""
            )
            return Response(
                {
                    "code": "whatsapp_provider_error",
                    "detail": (
                        "The WhatsApp provider failed to deliver the message."
                        f"{provider_bit} Nothing was sent; safe to retry."
                    ),
                },
                status=502,
            )
        return Response(
            {
                "status": "sent",
                "message_id": message_id,
                "to": recipient,
                "client_ref": client_ref,
            }
        )

    @staticmethod
    def _clean_items(raw_items):
        cleaned = []
        if not isinstance(raw_items, list):
            return cleaned
        for entry in raw_items:
            if not isinstance(entry, dict):
                continue
            name = str(entry.get("name") or "").strip()[:255]
            try:
                quantity = int(entry.get("quantity"))
            except (TypeError, ValueError):
                continue
            unit = str(entry.get("unit") or "pc").lower()
            if unit not in ("box", "pc"):
                unit = "pc"
            if name and 1 <= quantity <= 1000000:
                cleaned.append({"name": name, "quantity": quantity, "unit": unit})
        return cleaned