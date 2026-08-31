import uuid
from datetime import date, datetime
from decimal import Decimal

from django.db import IntegrityError, transaction
from rest_framework import serializers

from customers.models import Customer
from interaction.services import detect_cart_interactions
from inventory.models import Product
from inventory.services import deduct_sale_stock, is_expired
from sales.models import Sale, SaleItem, SalePayment


def generate_invoice_number():
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    return f"INV-{timestamp}-{uuid.uuid4().hex[:4].upper()}"


class PosItemSerializer(serializers.Serializer):
    product = serializers.PrimaryKeyRelatedField(
        queryset=Product.objects.all(),
        error_messages={"does_not_exist": "Invalid product id."},
    )
    unit = serializers.ChoiceField(
        choices=Product.Unit.choices,
        default=Product.Unit.PC,
    )
    quantity = serializers.IntegerField()
    unit_price = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        allow_null=True,
    )

    def validate_quantity(self, value):
        if value <= 0:
            raise serializers.ValidationError(
                "Quantity must be greater than zero."
            )
        return value

    def validate_unit_price(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Unit price cannot be negative.")
        return value


class PosPaymentSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=Sale.PaymentMethod.choices)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)

    def validate_amount(self, value):
        if value < 0:
            raise serializers.ValidationError("Payment amount cannot be negative.")
        return value


class PosCheckoutSerializer(serializers.Serializer):
    items = PosItemSerializer(many=True)
    customer = serializers.PrimaryKeyRelatedField(
        queryset=Customer.objects.all(),
        required=False,
        allow_null=True,
        default=None,
        error_messages={"does_not_exist": "Invalid customer id."},
    )
    discount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        default=Decimal("0.00"),
    )
    payments = PosPaymentSerializer(many=True)
    invoice_number = serializers.CharField(max_length=50, required=False, allow_blank=False)
    sale_date = serializers.DateField(required=False)
    approve_sensitive = serializers.BooleanField(
        required=False, default=False, write_only=True
    )
    approve_interactions = serializers.BooleanField(
        required=False, default=False, write_only=True
    )

    @staticmethod
    def resolve_unit_price(product, unit):
        """Resolve the authoritative selling price for a cart line.

        Prices always come from the database for every unit type so the
        client can never invent prices at checkout.
        """
        if unit == Product.Unit.PC:
            return product.unit_price
        if not product.supports_unit(unit):
            if product.units_in(unit) is None:
                raise serializers.ValidationError(
                    {
                        "items": (
                            f"'{product.name}' has no {unit} pack size configured "
                            f"(units per {unit} missing)."
                        )
                    }
                )
            raise serializers.ValidationError(
                {
                    "items": (
                        f"'{product.name}' has no {unit} price configured."
                    )
                }
            )
        return product.get_unit_price(unit)

    @staticmethod
    def _calc_total(items):
        total = Decimal("0")
        for item in items:
            total += item["quantity"] * item["unit_price"]
        return total

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError(
                "At least one item is required. The cart is empty."
            )
        merged = {}
        for item in items:
            product_id = item["product"].id
            unit = item.get("unit") or Product.Unit.PC
            key = (product_id, unit)
            resolved_price = self.resolve_unit_price(item["product"], unit)
            if key in merged:
                merged[key]["quantity"] += item["quantity"]
            else:
                merged[key] = {
                    "product": item["product"],
                    "unit": unit,
                    "quantity": item["quantity"],
                    # Store the DB-backed price so totals and receipts can
                    # never drift from the configured selling price.
                    "unit_price": resolved_price,
                }
        return list(merged.values())

    def validate_discount(self, value):
        if value < 0:
            raise serializers.ValidationError("Discount cannot be negative.")
        return value

    def validate_invoice_number(self, value):
        invoice_number = value.strip()
        if not invoice_number:
            raise serializers.ValidationError("Invoice number cannot be blank.")
        if Sale.objects.filter(invoice_number=invoice_number).exists():
            raise serializers.ValidationError(
                f"Invoice number '{invoice_number}' already exists."
            )
        return invoice_number

    def validate(self, attrs):
        items = attrs["items"]
        discount = attrs["discount"]
        payments = attrs["payments"]
        if not payments:
            raise serializers.ValidationError(
                {"payments": "At least one payment portion is required."}
            )
        total = self._calc_total(items)
        if discount > total:
            raise serializers.ValidationError(
                {"discount": "Discount cannot exceed the total amount."}
            )
        payable = total - discount
        payments_total = sum(p["amount"] for p in payments)
        if payments_total != payable:
            raise serializers.ValidationError(
                {
                    "payments": (
                        f"Sum of payments ({payments_total}) must equal the "
                        f"payable amount ({payable})."
                    )
                }
            )
        attrs["total_amount"] = total
        attrs["payable_amount"] = payable
        self._sensitive_items = [
            item for item in items if item["product"].is_sensitive
        ]
        products = list(
            Product.objects.filter(
                id__in=[item["product"].id for item in items]
            ).select_related("group", "category")
        )
        self._interactions = detect_cart_interactions(products)
        expired_items = [
            {
                "product": item["product"].id,
                "product_name": item["product"].name,
                "quantity": item["quantity"],
                "expiry_date": item["product"].expiry_date,
            }
            for item in items
            if is_expired(item["product"].expiry_date)
        ]
        if expired_items:
            raise serializers.ValidationError(
                {
                    "message": "This cart contains expired medicines and cannot be sold.",
                    "expired_items": expired_items,
                }
            )
        return attrs

    @property
    def sensitive_items(self):
        return getattr(self, "_sensitive_items", [])

    @property
    def interactions(self):
        return getattr(self, "_interactions", [])

    def create(self, validated_data):
        items = validated_data["items"]
        payments = validated_data["payments"]
        invoice_number = validated_data.get("invoice_number") or generate_invoice_number()
        sale_date = validated_data.get("sale_date") or date.today()
        try:
            with transaction.atomic():
                sale = Sale.objects.create(
                    invoice_number=invoice_number,
                    customer=validated_data.get("customer"),
                    user=self.context["request"].user,
                    total_amount=validated_data["total_amount"],
                    discount=validated_data["discount"],
                    payable_amount=validated_data["payable_amount"],
                    payment_method=payments[0]["method"],
                    sale_date=sale_date,
                )
                sale_items = [
                    SaleItem(
                        sale=sale,
                        product=item["product"],
                        unit=item.get("unit", "pc"),
                        quantity=item["quantity"],
                        # Always resolved from the database in validate_items.
                        unit_price=item["unit_price"],
                        quantity_pcs=(
                            item["quantity"]
                            * item["product"].units_in(item.get("unit", "pc"))
                        ),
                    )
                    for item in items
                ]
                for sale_item in sale_items:
                    sale_item.subtotal = (
                        sale_item.quantity * sale_item.unit_price
                    )
                SaleItem.objects.bulk_create(sale_items)
                deduct_sale_stock(sale.items.all())
                SalePayment.objects.bulk_create(
                    SalePayment(
                        sale=sale,
                        method=payment["method"],
                        amount=payment["amount"],
                    )
                    for payment in payments
                )
        except IntegrityError as exc:
            if "invoice_number" in str(exc) or "invoice_number" in str(exc.__cause__ or ""):
                raise serializers.ValidationError(
                    {
                        "invoice_number": (
                            f"Invoice number '{invoice_number}' already exists."
                        )
                    }
                )
            raise
        return sale


class PosReceiptItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    unit_display = serializers.CharField(source="get_unit_display", read_only=True)

    class Meta:
        model = SaleItem
        fields = [
            "product",
            "product_name",
            "unit",
            "unit_display",
            "quantity",
            "unit_price",
            "subtotal",
        ]


class PosReceiptPaymentSerializer(serializers.ModelSerializer):
    method_display = serializers.CharField(source="get_method_display", read_only=True)

    class Meta:
        model = SalePayment
        fields = ["method", "method_display", "amount"]


class PosReceiptSerializer(serializers.ModelSerializer):
    items = PosReceiptItemSerializer(many=True, read_only=True)
    payments = PosReceiptPaymentSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    customer_phone = serializers.CharField(source="customer.phone", read_only=True)
    user_username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Sale
        fields = [
            "id",
            "invoice_number",
            "sale_date",
            "created_at",
            "customer",
            "customer_name",
            "customer_phone",
            "user",
            "user_username",
            "items",
            "total_amount",
            "discount",
            "payable_amount",
            "payment_method",
            "payments",
        ]
