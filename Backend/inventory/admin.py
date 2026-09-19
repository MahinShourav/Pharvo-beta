from django.contrib import admin

from .models import Category, DrugInteraction, MedicineGroup, Product, Supplier, SupplierRestock


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("name",)
    search_fields = ("name",)


@admin.register(DrugInteraction)
class DrugInteractionAdmin(admin.ModelAdmin):
    list_display = ("drug_a", "drug_b", "interaction_level", "is_active")
    list_filter = ("interaction_level", "is_active")
    search_fields = ("drug_a", "drug_b")


@admin.register(MedicineGroup)
class MedicineGroupAdmin(admin.ModelAdmin):
    list_display = ("name",)
    search_fields = ("name",)


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ("name", "company", "contact_person", "phone", "email")
    search_fields = ("name", "company", "contact_person", "phone", "email")


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("name", "brand", "barcode", "category", "group", "unit_price", "stock_quantity", "is_active")
    list_filter = ("category", "group", "is_active")
    search_fields = ("name", "brand", "barcode")
    list_editable = ("stock_quantity", "is_active")


@admin.register(SupplierRestock)
class SupplierRestockAdmin(admin.ModelAdmin):
    list_display = (
        "product",
        "supplier",
        "current_stock",
        "stock_unit",
        "threshold",
        "suggested_quantity",
        "status",
        "created_at",
    )
    list_filter = ("status", "supplier")
    search_fields = ("product__name", "supplier__name")
    readonly_fields = ("created_at", "updated_at")
