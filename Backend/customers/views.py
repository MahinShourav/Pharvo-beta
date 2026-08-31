from django.db.models import Count, OuterRef, Q, Subquery
from rest_framework import viewsets

from accounts.permissions import IsStaffOrReadOnly
from sales.models import Sale

from .models import Customer
from .serializers import CustomerSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    permission_classes = [IsStaffOrReadOnly]

    def get_queryset(self):
        last_purchase_date = (
            Sale.objects.filter(customer_id=OuterRef("pk"))
            .order_by("-sale_date", "-created_at")
            .values("sale_date")[:1]
        )
        queryset = Customer.objects.annotate(
            total_purchases=Count("sales"),
            last_purchase_date=Subquery(last_purchase_date),
        )
        search = self.request.query_params.get("search")
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(phone__icontains=search) | Q(email__icontains=search)
            )
        return queryset
