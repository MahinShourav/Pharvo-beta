from django.db import transaction
from rest_framework import viewsets

from accounts.permissions import IsPharmacyStaff
from inventory.services import add_purchase_stock, remove_purchase_stock

from .models import Purchase
from .serializers import PurchaseSerializer


class PurchaseViewSet(viewsets.ModelViewSet):
    serializer_class = PurchaseSerializer
    permission_classes = [IsPharmacyStaff]

    def perform_create(self, serializer):
        with transaction.atomic():
            purchase = serializer.save()
            add_purchase_stock(purchase.items.all())

    def perform_update(self, serializer):
        with transaction.atomic():
            old_items = list(serializer.instance.items.all())
            purchase = serializer.save()
            remove_purchase_stock(old_items)
            add_purchase_stock(purchase.items.all())

    def perform_destroy(self, instance):
        with transaction.atomic():
            items = list(instance.items.all())
            remove_purchase_stock(items)
            instance.delete()

    def get_queryset(self):
        from django.db.models import Q

        queryset = Purchase.objects.select_related("supplier", "user").prefetch_related(
            "items__product"
        )
        search = self.request.query_params.get("search")
        supplier = self.request.query_params.get("supplier")
        user = self.request.query_params.get("user")
        if search:
            queryset = queryset.filter(
                Q(invoice_number__icontains=search)
                | Q(supplier__name__icontains=search)
            )
        if supplier:
            queryset = queryset.filter(supplier_id=supplier)
        if user:
            queryset = queryset.filter(user_id=user)
        return queryset
