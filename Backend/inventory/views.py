from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import IsStaffOrReadOnly
from interaction.services import (
    interaction_match_terms,
    product_interaction_identifiers,
)
from purchases.models import Purchase
from purchases.serializers import PurchaseSerializer

from .models import Category, DrugInteraction, MedicineGroup, Product, Supplier
from .serializers import (
    CategorySerializer,
    DrugInteractionSerializer,
    MedicineGroupSerializer,
    ProductSerializer,
    SupplierSerializer,
)

NEAR_EXPIRY_DAYS = 30


def _near_expiry_days(request):
    days = request.query_params.get("days")
    try:
        return max(int(days), 0)
    except (TypeError, ValueError):
        return NEAR_EXPIRY_DAYS


def _products_by_expiry_status(status, days):
    today = date.today()
    window_end = today + timedelta(days=days)
    queryset = Product.objects.select_related("category", "supplier", "group")
    if status == "expired":
        return queryset.filter(expiry_date__lt=today)
    if status == "near_expiry":
        return queryset.filter(expiry_date__gte=today, expiry_date__lte=window_end)
    return queryset.filter(
        Q(expiry_date__isnull=True) | Q(expiry_date__gt=window_end)
    )


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsStaffOrReadOnly]


class SupplierViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierSerializer
    permission_classes = [IsStaffOrReadOnly]

    def get_queryset(self):
        queryset = Supplier.objects.all()
        search = self.request.query_params.get("search")
        phone = self.request.query_params.get("phone")
        is_active = self.request.query_params.get("is_active")
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(phone__icontains=search)
            )
        if phone:
            queryset = queryset.filter(phone__icontains=phone)
        if is_active is not None:
            queryset = queryset.filter(
                is_active=is_active.lower() in ("1", "true", "yes")
            )
        return queryset

    @action(detail=True, methods=["get"])
    def products(self, request, pk=None):
        supplier = get_object_or_404(Supplier, pk=pk)
        queryset = (
            Product.objects.select_related("category", "supplier", "group")
            .filter(supplier=supplier)
        )
        return Response(ProductSerializer(queryset, many=True).data)

    @action(detail=True, methods=["get"])
    def purchases(self, request, pk=None):
        supplier = get_object_or_404(Supplier, pk=pk)
        queryset = (
            Purchase.objects.select_related("supplier", "user")
            .prefetch_related("items__product")
            .filter(supplier=supplier)
        )
        return Response(PurchaseSerializer(queryset, many=True).data)

    @action(detail=True, methods=["get"])
    def summary(self, request, pk=None):
        supplier = get_object_or_404(Supplier, pk=pk)
        purchase_stats = Purchase.objects.filter(supplier=supplier).aggregate(
            purchase_count=Count("id"),
            total_amount=Sum("total_amount"),
            payable_amount=Sum("payable_amount"),
        )
        quantity_stats = supplier.purchases.aggregate(
            total_quantity=Sum("items__quantity")
        )
        return Response(
            {
                "id": supplier.id,
                "name": supplier.name,
                "is_active": supplier.is_active,
                "product_count": supplier.products.count(),
                "purchase_count": purchase_stats["purchase_count"] or 0,
                "total_quantity_purchased": quantity_stats["total_quantity"] or 0,
                "total_purchase_amount": purchase_stats["total_amount"]
                or Decimal("0.00"),
                "total_payable_amount": purchase_stats["payable_amount"]
                or Decimal("0.00"),
            }
        )


class MedicineGroupViewSet(viewsets.ModelViewSet):
    queryset = MedicineGroup.objects.annotate(product_count=Count("products"))
    serializer_class = MedicineGroupSerializer
    permission_classes = [IsStaffOrReadOnly]


class DrugInteractionViewSet(viewsets.ModelViewSet):
    queryset = DrugInteraction.objects.all()
    serializer_class = DrugInteractionSerializer
    permission_classes = [IsStaffOrReadOnly]

    def get_queryset(self):
        queryset = DrugInteraction.objects.all()
        level = self.request.query_params.get("level")
        active = self.request.query_params.get("active")
        search = self.request.query_params.get("search")
        if level:
            queryset = queryset.filter(interaction_level=level)
        if active is not None:
            queryset = queryset.filter(is_active=active.lower() in ("1", "true", "yes"))
        if search:
            queryset = queryset.filter(
                Q(drug_a__icontains=search) | Q(drug_b__icontains=search)
            )
        return queryset


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [IsStaffOrReadOnly]

    def _apply_product_filters(self, queryset):
        category = self.request.query_params.get("category")
        supplier = self.request.query_params.get("supplier")
        is_active = self.request.query_params.get("is_active")
        search = self.request.query_params.get("search")
        if category:
            queryset = queryset.filter(category_id=category)
        if supplier:
            queryset = queryset.filter(supplier_id=supplier)
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ("1", "true", "yes"))
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(brand__icontains=search)
                | Q(barcode__icontains=search)
            )
        return queryset

    def get_queryset(self):
        queryset = Product.objects.select_related("category", "supplier", "group")
        group = self.request.query_params.get("group")
        if group:
            queryset = queryset.filter(group_id=group)
        expiry_status = self.request.query_params.get("expiry_status")
        if expiry_status:
            queryset = _products_by_expiry_status(
                expiry_status, _near_expiry_days(self.request)
            )
        return self._apply_product_filters(queryset)

    @action(detail=False, methods=["get"], url_path="expired")
    def expired(self, request):
        queryset = _products_by_expiry_status("expired", 0)
        queryset = self._apply_product_filters(queryset)
        return Response(ProductSerializer(queryset, many=True).data)

    @action(detail=False, methods=["get"], url_path="near-expiry")
    def near_expiry(self, request):
        queryset = _products_by_expiry_status(
            "near_expiry", _near_expiry_days(request)
        )
        queryset = self._apply_product_filters(queryset)
        return Response(ProductSerializer(queryset, many=True).data)

    @action(detail=False, methods=["get"], url_path="expiry-summary")
    def expiry_summary(self, request):
        days = _near_expiry_days(request)
        today = date.today()
        window_end = today + timedelta(days=days)
        expired = Product.objects.filter(expiry_date__lt=today).count()
        near_expiry = Product.objects.filter(
            expiry_date__gte=today, expiry_date__lte=window_end
        ).count()
        valid = Product.objects.filter(
            Q(expiry_date__isnull=True) | Q(expiry_date__gt=window_end)
        ).count()
        return Response(
            {
                "window_days": days,
                "total": Product.objects.count(),
                "expired": expired,
                "near_expiry": near_expiry,
                "valid": valid,
            }
        )

    @action(detail=True, methods=["get"])
    def related(self, request, pk=None):
        product = get_object_or_404(Product, pk=pk)
        if not product.group_id:
            return Response([])
        queryset = (
            Product.objects.select_related("category", "supplier", "group")
            .filter(group_id=product.group_id)
            .exclude(id=product.id)
        )
        if request.query_params.get("is_active") is None:
            queryset = queryset.filter(is_active=True)
        queryset = self._apply_product_filters(queryset)
        return Response(ProductSerializer(queryset, many=True).data)

    @action(detail=True, methods=["get"])
    def interactions(self, request, pk=None):
        product = get_object_or_404(
            Product.objects.select_related("group", "category"), pk=pk
        )
        identifiers = product_interaction_identifiers(product)
        if not identifiers:
            return Response([])
        matching_ids = set()
        candidates = DrugInteraction.objects.filter(is_active=True).only(
            "id", "drug_a", "drug_b"
        )
        for interaction in candidates:
            for drug in (interaction.drug_a, interaction.drug_b):
                terms = interaction_match_terms(drug)
                for identifier in identifiers:
                    for term in terms:
                        if term == identifier or (len(term) >= 4 and term in identifier):
                            matching_ids.add(interaction.id)
                            break
        interactions = DrugInteraction.objects.filter(id__in=matching_ids)
        return Response(DrugInteractionSerializer(interactions, many=True).data)