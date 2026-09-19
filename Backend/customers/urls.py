from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    CustomerViewSet,
    MyCustomerView,
    DiabetesRecordListCreateView,
    DiabetesRecordUpdateDeleteView,
    BloodPressureRecordListCreateView,
    BloodPressureRecordUpdateDeleteView,
)

router = SimpleRouter()
router.register("", CustomerViewSet, basename="customer")

# Declared before the router URLs so "me/" is not captured as a lookup key.
urlpatterns = [
    path("me/", MyCustomerView.as_view(), name="my-customer"),
    # Diabetes record endpoints
    path("me/diabetes-records/", DiabetesRecordListCreateView.as_view(), name="diabetes-record-list-create"),
    path("me/diabetes-records/<int:record_id>/", DiabetesRecordUpdateDeleteView.as_view(), name="diabetes-record-update-delete"),
    # Blood pressure record endpoints
    path("me/blood-pressure-records/", BloodPressureRecordListCreateView.as_view(), name="blood-pressure-record-list-create"),
    path("me/blood-pressure-records/<int:record_id>/", BloodPressureRecordUpdateDeleteView.as_view(), name="blood-pressure-record-update-delete"),
] + router.urls