from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import CustomerViewSet, MyCustomerView

router = SimpleRouter()
router.register("", CustomerViewSet, basename="customer")

# Declared before the router URLs so "me/" is not captured as a lookup key.
urlpatterns = [
    path("me/", MyCustomerView.as_view(), name="my-customer"),
] + router.urls
