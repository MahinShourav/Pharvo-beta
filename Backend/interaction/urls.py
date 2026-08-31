from django.urls import path

from .views import CheckInteractionsView

urlpatterns = [
    path("check/", CheckInteractionsView.as_view(), name="interaction-check"),
]