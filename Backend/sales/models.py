from django.conf import settings
from django.db import models

from inventory.models import Product


class Sale(models.Model):
    class PaymentMethod(models.TextChoices):
        CASH = "cash", "Cash"
        CARD = "card", "Card"
        BKASH = "bkash", "bKash"
        NAGAD = "nagad", "Nagad"
        DUE = "due", "Due"

    invoice_number = models.CharField(max_length=50, unique=True)
    customer = models.ForeignKey(
        "customers.Customer",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sales",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
    )
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    discount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    payable_amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_method = models.CharField(
        max_length=10,
        choices=PaymentMethod.choices,
        default=PaymentMethod.CASH,
    )
    sale_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "sale"
        verbose_name_plural = "sales"

    def __str__(self):
        return self.invoice_number


class SaleItem(models.Model):
    sale = models.ForeignKey(
        Sale,
        on_delete=models.CASCADE,
        related_name="items",
    )
    product = models.ForeignKey(
        "inventory.Product",
        on_delete=models.PROTECT,
        related_name="sale_items",
    )
    unit = models.CharField(
        max_length=10,
        choices=Product.Unit.choices,
        default=Product.Unit.PC,
    )
    quantity_pcs = models.PositiveIntegerField(
        default=0,
        help_text=(
            "PC-equivalent quantity captured at sale time so stock can be "
            "restored even if the product's pack sizes change later."
        ),
    )
    quantity = models.IntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        verbose_name = "sale item"
        verbose_name_plural = "sale items"

    def save(self, *args, **kwargs):
        if not self.quantity_pcs:
            self.quantity_pcs = self.resolve_pcs()
        super().save(*args, **kwargs)

    def resolve_pcs(self):
        """PC-equivalent of this line; 0 when pack size is unknown."""
        per_unit = self.product.units_in(self.unit)
        if per_unit is None:
            return 0
        return max(self.quantity, 0) * per_unit

    def __str__(self):
        return f"{self.product} x {self.quantity} {self.get_unit_display()}"


class SalePayment(models.Model):
    sale = models.ForeignKey(
        Sale,
        on_delete=models.CASCADE,
        related_name="payments",
    )
    method = models.CharField(
        max_length=10,
        choices=Sale.PaymentMethod.choices,
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "sale payment"
        verbose_name_plural = "sale payments"

    def __str__(self):
        return f"{self.get_method_display()}: {self.amount}"