from django.contrib.auth import get_user_model
from django.db.models import Count, OuterRef, Q, Subquery
from rest_framework import status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from accounts.permissions import IsPharmacyStaff
from sales.models import Sale

from .models import Customer
from .serializers import CustomerSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    # Pharmacy staff (admin, pharmacist and legacy staff) may read and keep
    # customer information up to date. Delete and membership/tier changes
    # require administrator privileges (enforced below).
    permission_classes = [IsPharmacyStaff]

    @staticmethod
    def _is_membership_manager(user):
        return bool(
            user
            and (user.is_staff or getattr(user, "role", None) == get_user_model().Role.ADMIN)
        )

    def _assert_tier_allowed(self, serializer):
        data = getattr(serializer, "validated_data", serializer.initial_data)
        new_tier = (data.get("membership_tier") or "").strip()
        if not new_tier:
            # Not provided or explicitly a non-member: no tier assignment.
            return
        if CustomerViewSet._is_membership_manager(self.request.user):
            return
        instance = serializer.instance
        if instance and instance.membership_tier == new_tier:
            # Editing a customer while keeping their existing tier.
            return
        raise ValidationError(
            {
                "membership_tier": (
                    "Only administrators may change a customer's membership tier."
                )
            }
        )

    def perform_create(self, serializer):
        self._assert_tier_allowed(serializer)
        serializer.save()

    def perform_update(self, serializer):
        self._assert_tier_allowed(serializer)
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        if not CustomerViewSet._is_membership_manager(request.user):
            return Response(
                {
                    "detail": (
                        "Pharmacists cannot delete customers. Contact an "
                        "administrator."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

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