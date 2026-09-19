from datetime import date

from rest_framework import serializers

from .models import (
    Category,
    DrugInteraction,
    MedicineGroup,
    Product,
    Supplier,
    SupplierRestock,
)


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "description"]

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Category name cannot be blank.")
        return name


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = [
            "id",
            "name",
            "company",
            "contact_person",
            "phone",
            "email",
            "address",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["created_at"]

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Supplier name cannot be blank.")
        return name


class MedicineGroupSerializer(serializers.ModelSerializer):
    product_count = serializers.SerializerMethodField()

    class Meta:
        model = MedicineGroup
        fields = ["id", "name", "description", "product_count", "created_at"]
        read_only_fields = ["created_at"]

    def get_product_count(self, obj):
        return getattr(obj, "product_count", obj.products.count())

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Group name cannot be blank.")
        return name


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    group_name = serializers.CharField(source="group.name", read_only=True)

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "brand",
            "barcode",
            "category",
            "category_name",
            "group",
            "group_name",
            "supplier",
            "supplier_name",
            "unit_price",
            "cost_price",
            "pcs_per_strip",
            "strips_per_box",
            "pcs_per_box",
            "strip_price",
            "box_price",
            "stock_quantity",
            "reorder_level",
            "expiry_date",
            "is_active",
            "is_sensitive",
            "description",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Product name cannot be blank.")
        return name

    def validate_barcode(self, value):
        barcode = value.strip()
        if not barcode:
            raise serializers.ValidationError("Barcode cannot be blank.")
        return barcode

    def validate_unit_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Unit price cannot be negative.")
        return value

    def validate_cost_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Cost price cannot be negative.")
        return value

    def validate_stock_quantity(self, value):
        if value < 0:
            raise serializers.ValidationError("Stock quantity cannot be negative.")
        return value

    def validate_reorder_level(self, value):
        if value < 0:
            raise serializers.ValidationError("Reorder level cannot be negative.")
        return value

    def validate_pcs_per_strip(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError(
                "PCs per strip must be greater than zero."
            )
        return value

    def validate_strips_per_box(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError(
                "Strips per box must be greater than zero."
            )
        return value

    def validate_pcs_per_box(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError(
                "PCs per box must be greater than zero."
            )
        return value

    def validate_strip_price(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Strip price cannot be negative.")
        return value

    def validate_box_price(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Box price cannot be negative.")
        return value

    def validate_expiry_date(self, value):
        if value is not None and value < date.today():
            raise serializers.ValidationError("Expiry date cannot be in the past.")
        return value

    def validate(self, attrs):
        pcs_per_strip = attrs.get(
            "pcs_per_strip", getattr(self.instance, "pcs_per_strip", None)
        )
        strips_per_box = attrs.get(
            "strips_per_box", getattr(self.instance, "strips_per_box", None)
        )
        # Keep the pack chain internally consistent: when the strip size and
        # strip count are both known, pcs_per_box is always their product.
        if pcs_per_strip and strips_per_box:
            attrs["pcs_per_box"] = pcs_per_strip * strips_per_box
        pcs_per_box = attrs.get(
            "pcs_per_box", getattr(self.instance, "pcs_per_box", None)
        )
        strip_price = attrs.get("strip_price", getattr(self.instance, "strip_price", None))
        if strip_price is not None and not pcs_per_strip:
            raise serializers.ValidationError(
                {
                    "strip_price": (
                        "A pack size (PCs per strip) is required to sell by strip."
                    )
                }
            )
        box_price = attrs.get("box_price", getattr(self.instance, "box_price", None))
        if box_price is not None and not pcs_per_box:
            raise serializers.ValidationError(
                {
                    "box_price": (
                        "A pack size (PCs per box) is required to sell by box. "
                        "Set PCs per strip and strips per box."
                    )
                }
            )
        return attrs


class DrugInteractionSerializer(serializers.ModelSerializer):
    interaction_level = serializers.ChoiceField(choices=DrugInteraction.Level.choices)

    class Meta:
        model = DrugInteraction
        fields = [
            "id",
            "drug_a",
            "drug_b",
            "interaction_level",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def validate_drug_a(self, value):
        drug_a = value.strip()
        if not drug_a:
            raise serializers.ValidationError("Drug A cannot be blank.")
        return drug_a

    def validate_drug_b(self, value):
        drug_b = value.strip()
        if not drug_b:
            raise serializers.ValidationError("Drug B cannot be blank.")
        return drug_b

    def validate(self, attrs):
        drug_a = (attrs.get("drug_a") or self.instance.drug_a).strip().lower()
        drug_b = (attrs.get("drug_b") or self.instance.drug_b).strip().lower()
        if drug_a == drug_b:
            raise serializers.ValidationError(
                {"drug_b": "A drug cannot interact with itself."}
            )
        pair_key = DrugInteraction.build_pair_key(drug_a, drug_b)
        duplicate = DrugInteraction.objects.filter(pair_key=pair_key)
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if duplicate.exists():
            raise serializers.ValidationError(
                "This interaction pair already exists (in either order)."
            )
        return attrs


class SupplierRestockSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_brand = serializers.CharField(source="product.brand", read_only=True)
    product_barcode = serializers.CharField(source="product.barcode", read_only=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    stock_unit_display = serializers.SerializerMethodField()

    class Meta:
        model = SupplierRestock
        fields = [
            "id",
            "supplier",
            "supplier_name",
            "product",
            "product_name",
            "product_brand",
            "product_barcode",
            "current_stock",
            "stock_unit",
            "stock_unit_display",
            "threshold",
            "suggested_quantity",
            "status",
            "status_display",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "created_at",
            "updated_at",
        ]

    def get_stock_unit_display(self, obj):
        unit_labels = {"pc": "PC", "strip": "Strip", "box": "Box"}
        return unit_labels.get(obj.stock_unit, obj.stock_unit)

    def validate_notes(self, value):
        return value.strip() if value else ""


class SupplierProfileSerializer(serializers.ModelSerializer):
    product_count = serializers.SerializerMethodField()
    products = serializers.SerializerMethodField()
    restock_count = serializers.SerializerMethodField()

    class Meta:
        model = Supplier
        fields = [
            "id",
            "name",
            "company",
            "contact_person",
            "phone",
            "email",
            "address",
            "is_active",
            "created_at",
            "product_count",
            "products",
            "restock_count",
        ]
        read_only_fields = ["created_at"]

    def get_product_count(self, obj):
        return obj.products.count()

    def get_products(self, obj):
        products = obj.products.select_related("category", "group").all()
        return ProductSerializer(products, many=True).data

    def get_restock_count(self, obj):
        return obj.restock_items.filter(status=SupplierRestock.Status.PENDING).count()
