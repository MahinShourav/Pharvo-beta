from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from accounts.permissions import IsPharmacyStaff, IsStaffOrReadOnly
from interaction.services import (
    interaction_match_terms,
    product_interaction_identifiers,
)
from purchases.models import Purchase
from purchases.serializers import PurchaseSerializer

from .models import Category, DrugInteraction, MedicineGroup, Product, Supplier, SupplierRestock
from .serializers import (
    CategorySerializer,
    DrugInteractionSerializer,
    MedicineGroupSerializer,
    ProductSerializer,
    SupplierSerializer,
    SupplierProfileSerializer,
    SupplierRestockSerializer,
)
from .services import check_and_update_restock

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

    @action(detail=True, methods=["get"], url_path="profile")
    def profile(self, request, pk=None):
        supplier = get_object_or_404(Supplier, pk=pk)
        return Response(SupplierProfileSerializer(supplier).data)

    @action(detail=True, methods=["get"], url_path="restock-list")
    def restock_list(self, request, pk=None):
        supplier = get_object_or_404(Supplier, pk=pk)
        status_filter = request.query_params.get("status")
        qs = SupplierRestock.objects.select_related("product", "supplier").filter(
            supplier=supplier
        )
        if status_filter:
            qs = qs.filter(status=status_filter)
        return Response(SupplierRestockSerializer(qs, many=True).data)


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


class SupplierRestockViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierRestockSerializer
    permission_classes = [IsPharmacyStaff]

    def get_queryset(self):
        qs = SupplierRestock.objects.select_related("product", "supplier").all()
        supplier = self.request.query_params.get("supplier")
        product = self.request.query_params.get("product")
        restock_status = self.request.query_params.get("status")
        if supplier:
            qs = qs.filter(supplier_id=supplier)
        if product:
            qs = qs.filter(product_id=product)
        if restock_status:
            qs = qs.filter(status=restock_status)
        return qs

    @action(detail=True, methods=["post"], url_path="update-status")
    def update_status(self, request, pk=None):
        entry = get_object_or_404(SupplierRestock, pk=pk)
        new_status = request.data.get("status")
        if new_status not in dict(SupplierRestock.Status.choices):
            return Response(
                {"detail": f"Invalid status. Choose from: {dict(SupplierRestock.Status.choices)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        notes = request.data.get("notes")
        entry.status = new_status
        if notes is not None:
            entry.notes = notes
        entry.save(update_fields=["status", "notes", "updated_at"])
        return Response(SupplierRestockSerializer(entry).data)

    @action(detail=False, methods=["post"], url_path="check-all")
    def check_all(self, request):
        """Scan all active products with suppliers and create/update restock entries."""
        products = Product.objects.select_related("supplier").filter(
            is_active=True,
            supplier__isnull=False,
        )
        created = 0
        updated = 0
        for product in products:
            threshold = product.restock_threshold()
            stock = product.stock_quantity
            existing = SupplierRestock.objects.filter(
                supplier=product.supplier,
                product=product,
            ).exists()
            check_and_update_restock(product)
            if stock <= threshold:
                if existing:
                    updated += 1
                else:
                    created += 1
        return Response(
            {
                "detail": f"Restock check complete. Created: {created}, Updated: {updated}",
                "created": created,
                "updated": updated,
            }
        )


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

    @action(detail=True, methods=["post"], url_path="restock-check")
    def restock_check(self, request, pk=None):
        """Manually trigger a restock threshold check for a single product."""
        product = get_object_or_404(
            Product.objects.select_related("supplier"), pk=pk
        )
        if product.supplier is None:
            return Response(
                {"detail": "Product has no supplier mapped."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        check_and_update_restock(product)
        entries = SupplierRestock.objects.filter(
            supplier=product.supplier,
            product=product,
        )
        return Response(SupplierRestockSerializer(entries, many=True).data)