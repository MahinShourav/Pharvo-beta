from decimal import Decimal

from rest_framework import serializers

from .models import Sale, SaleItem


class SaleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    unit_display = serializers.CharField(source="get_unit_display", read_only=True)

    class Meta:
        model = SaleItem
        fields = [
            "id",
            "product",
            "product_name",
            "unit",
            "unit_display",
            "quantity",
            "unit_price",
            "subtotal",
        ]
        read_only_fields = ["subtotal"]

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Quantity must be greater than zero.")
        return value

    def validate_unit_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Unit price cannot be negative.")
        return value

    def create(self, validated_data):
        validated_data["subtotal"] = (
            validated_data["quantity"] * validated_data["unit_price"]
        )
        product = validated_data.get("product")
        unit = validated_data.get("unit") or "pc"
        per_unit = product.units_in(unit) if product else None
        if per_unit is None:
            raise serializers.ValidationError(
                {"unit": f"Product has no {unit} pack size configured."}
            )
        validated_data["quantity_pcs"] = validated_data["quantity"] * per_unit
        return super().create(validated_data)


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, required=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    user_username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Sale
        fields = [
            "id",
            "invoice_number",
            "customer",
            "customer_name",
            "user",
            "user_username",
            "total_amount",
            "discount",
            "payable_amount",
            "payment_method",
            "sale_date",
            "created_at",
            "items",
        ]
        read_only_fields = ["user", "total_amount", "payable_amount", "created_at"]

    @staticmethod
    def _calc_total(items):
        return sum(item["quantity"] * item["unit_price"] for item in items)

    def validate_invoice_number(self, value):
        invoice_number = value.strip()
        if not invoice_number:
            raise serializers.ValidationError("Invoice number cannot be blank.")
        return invoice_number

    def validate_discount(self, value):
        if value < 0:
            raise serializers.ValidationError("Discount cannot be negative.")
        return value

    def validate(self, attrs):
        items = attrs.get("items")
        discount = attrs.get("discount")
        if self.instance is None:
            if not items:
                raise serializers.ValidationError(
                    {"items": "At least one sale item is required."}
                )
            total = self._calc_total(items)
        else:
            total = self._calc_total(items) if items else self.instance.total_amount
        if discount is not None and discount > total:
            raise serializers.ValidationError(
                {"discount": "Discount cannot exceed the total amount."}
            )
        return attrs

    def create(self, validated_data):
        items_data = validated_data.pop("items")
        validated_data["user"] = self.context["request"].user
        total = self._calc_total(items_data)
        discount = validated_data.get("discount") or Decimal("0")
        validated_data["total_amount"] = total
        validated_data["payable_amount"] = total - discount
        sale = Sale.objects.create(**validated_data)
        for item_data in items_data:
            SaleItem.objects.create(
                sale=sale,
                subtotal=item_data["quantity"] * item_data["unit_price"],
                **item_data,
            )
        return sale

    def update(self, instance, validated_data):
        items_data = validated_data.pop("items", None)
        discount = validated_data.get("discount")
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if items_data is not None:
            total = self._calc_total(items_data)
            if discount is None:
                discount = instance.discount
            instance.total_amount = total
            instance.payable_amount = total - discount
            instance.save()
            instance.items.all().delete()
            for item_data in items_data:
                SaleItem.objects.create(
                    sale=instance,
                    subtotal=item_data["quantity"] * item_data["unit_price"],
                    **item_data,
                )
        else:
            if discount is not None:
                instance.payable_amount = instance.total_amount - discount
            instance.save()
        return instance
