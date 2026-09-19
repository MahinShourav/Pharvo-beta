from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    BloodPressureRecordListCreateView,
    BloodPressureRecordUpdateDeleteView,
    CustomerViewSet,
    DiabetesRecordListCreateView,
    DiabetesRecordUpdateDeleteView,
    MyCustomerPurchasesView,
    MyCustomerRemindersView,
    MyCustomerSummaryView,
    MyCustomerView,
    StaffCustomerLinkSearchView,
    StaffCustomerLinkView,
)

router = SimpleRouter()
router.register("", CustomerViewSet, basename="customer")

# Declared before the router URLs so "me/", "link-search/" and "link/"
# are not captured as a customer lookup key.
urlpatterns = [
    path("me/", MyCustomerView.as_view(), name="my-customer"),
    path("me/summary/", MyCustomerSummaryView.as_view(), name="my-customer-summary"),
    path("me/purchases/", MyCustomerPurchasesView.as_view(), name="my-customer-purchases"),
    path("me/reminders/", MyCustomerRemindersView.as_view(), name="my-customer-reminders"),
    path("link-search/", StaffCustomerLinkSearchView.as_view(), name="staff-customer-link-search"),
    path("link/", StaffCustomerLinkView.as_view(), name="staff-customer-link"),
    # Diabetes record endpoints
    path("me/diabetes-records/", DiabetesRecordListCreateView.as_view(), name="diabetes-record-list-create"),
    path("me/diabetes-records/<int:record_id>/", DiabetesRecordUpdateDeleteView.as_view(), name="diabetes-record-update-delete"),
    # Blood pressure record endpoints
    path("me/blood-pressure-records/", BloodPressureRecordListCreateView.as_view(), name="blood-pressure-record-list-create"),
    path("me/blood-pressure-records/<int:record_id>/", BloodPressureRecordUpdateDeleteView.as_view(), name="blood-pressure-record-update-delete"),
] + router.urls