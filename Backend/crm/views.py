from decimal import Decimal

from django.db.models import F, Sum
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import IsPharmacyStaff, IsStaffOrReadOnly
from customers.models import Customer
from customers.serializers import CustomerSerializer
from sales.models import SaleItem

from .models import Reminder
from .serializers import (
    CustomerProfileSerializer,
    CustomerSummarySerializer,
    PurchaseHistorySerializer,
    ReminderSerializer,
)


class CrmCustomerViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Customer.objects.all()
    permission_classes = [IsStaffOrReadOnly]

    def get_serializer_class(self):
        if self.action == "list":
            return CustomerSerializer
        return CustomerProfileSerializer

    @action(detail=True, methods=["get"])
    def purchases(self, request, pk=None):
        customer = self.get_object()
        sales = customer.sales.select_related("user").prefetch_related(
            "items__product", "payments"
        )
        serializer = PurchaseHistorySerializer(sales, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def summary(self, request, pk=None):
        customer = self.get_object()
        sales = customer.sales.all()
        total_purchases = sales.count()
        total_spending = (
            sales.aggregate(total=Sum("payable_amount"))["total"] or Decimal("0")
        )
        recent_sales = customer.sales.select_related("user").prefetch_related(
            "items__product", "payments"
        )[:5]
        frequent_products = (
            SaleItem.objects.filter(sale__customer=customer)
            .values("product", "product__name")
            .annotate(
                total_quantity=Sum("quantity"),
                total_spent=Sum(F("quantity") * F("unit_price")),
            )
            .order_by("-total_quantity")[:5]
        )
        data = CustomerSummarySerializer(
            {
                "customer": customer,
                "total_purchases": total_purchases,
                "total_spending": f"{total_spending:.2f}",
                "recent_purchases": recent_sales,
                "frequently_purchased_products": [
                    {
                        "product": row["product"],
                        "product_name": row["product__name"],
                        "total_quantity": row["total_quantity"],
                        "total_spent": f"{row['total_spent']:.2f}",
                    }
                    for row in frequent_products
                ],
            }
        ).data
        return Response(data)


class ReminderViewSet(viewsets.ModelViewSet):
    serializer_class = ReminderSerializer
    permission_classes = [IsPharmacyStaff]

    def get_queryset(self):
        queryset = Reminder.objects.select_related("customer", "product")
        customer = self.request.query_params.get("customer")
        active = self.request.query_params.get("active")
        if customer:
            queryset = queryset.filter(customer_id=customer)
        if active is not None:
            queryset = queryset.filter(is_active=active.lower() in ("1", "true", "yes"))
        return queryset