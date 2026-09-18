from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import NotificationViewSet, WhatsAppOrderView

router = DefaultRouter()
router.register("", NotificationViewSet, basename="notification")

urlpatterns = [
    path(
        "whatsapp/send-order/",
        WhatsAppOrderView.as_view(),
        name="whatsapp-send-order",
    ),
] + router.urls