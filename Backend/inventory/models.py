from django.db import models


class Category(models.Model):
    name = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["name"]
        verbose_name = "category"
        verbose_name_plural = "categories"

    def __str__(self):
        return self.name


class Supplier(models.Model):
    name = models.CharField(max_length=255)
    company = models.CharField(
        max_length=255,
        blank=True,
        default="",
        verbose_name="pharmacy/company they work for",
        help_text="Pharmacy or pharmaceutical company the contact works for.",
    )
    contact_person = models.CharField(max_length=255, blank=True, default="")
    phone = models.CharField(max_length=20, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    address = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "supplier"
        verbose_name_plural = "suppliers"

    def __str__(self):
        return self.name


class MedicineGroup(models.Model):
    name = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "medicine group"
        verbose_name_plural = "medicine groups"

    def __str__(self):
        return self.name


class DrugInteraction(models.Model):
    class Level(models.TextChoices):
        BENEFICIAL = "beneficial", "Beneficial"
        CAUTION = "caution", "Caution"
        AVOID = "avoid", "Avoid"
        HIGH_RISK = "high_risk", "High Risk"
        CONTRAINDICATED = "contraindicated", "Contraindicated"

    drug_a = models.CharField(max_length=255)
    drug_b = models.CharField(max_length=255)
    interaction_level = models.CharField(
        max_length=20,
        choices=Level.choices,
    )
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    pair_key = models.CharField(
        max_length=511,
        unique=True,
        editable=False,
        help_text="Normalized unordered pair used to prevent duplicate/reversed interactions.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["drug_a", "drug_b"]
        verbose_name = "drug interaction"
        verbose_name_plural = "drug interactions"

    def __str__(self):
        return f"{self.drug_a} + {self.drug_b} ({self.get_interaction_level_display()})"

    @staticmethod
    def build_pair_key(drug_a, drug_b):
        return "||".join(
            sorted((drug_a.strip().lower(), drug_b.strip().lower()))
        )

    def save(self, *args, **kwargs):
        self.pair_key = self.build_pair_key(self.drug_a, self.drug_b)
        super().save(*args, **kwargs)


class Product(models.Model):
    class Unit(models.TextChoices):
        PC = "pc", "PC"
        STRIP = "strip", "Strip"
        BOX = "box", "Box"

    name = models.CharField(max_length=255)
    brand = models.CharField(max_length=255, blank=True, default="")
    barcode = models.CharField(max_length=100, unique=True)
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="products",
    )
    group = models.ForeignKey(
        MedicineGroup,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="products",
        verbose_name="medicine group",
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="products",
    )
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    cost_price = models.DecimalField(max_digits=10, decimal_places=2)
    # Pack structure: a strip holds `pcs_per_strip` pieces and a box holds
    # `strips_per_box` strips, i.e. pcs_per_box = pcs_per_strip * strips_per_box.
    # Strip/box selling prices are optional; a product without them can only
    # be sold per PC.
    pcs_per_strip = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Number of PCs contained in one strip.",
    )
    strips_per_box = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Number of strips contained in one box.",
    )
    pcs_per_box = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text=(
            "Number of PCs in one full box. Derived as "
            "pcs_per_strip x strips_per_box when both are set."
        ),
    )
    strip_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Selling price for one full strip.",
    )
    box_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Selling price for one full box.",
    )
    stock_quantity = models.IntegerField(default=0)
    reorder_level = models.IntegerField(default=0)
    expiry_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_sensitive = models.BooleanField(
        default=False,
        verbose_name="sensitive medicine",
        help_text="Flag medicines that require staff approval at POS checkout.",
    )
    description = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "product"
        verbose_name_plural = "products"

    def __str__(self):
        return self.name

    def units_in(self, unit):
        """Return how many PCs one selling unit of `unit` contains.

        Returns ``None`` when the pack size for that unit is not configured.
        """
        if unit == self.Unit.STRIP:
            return self.pcs_per_strip
        if unit == self.Unit.BOX:
            return self.pcs_per_box
        if unit == self.Unit.PC:
            return 1
        return None

    def pack_breakdown(self, total_pcs=None):
        """Split a PC count into (boxes, strips, pcs) using pack sizes.

        Units without a configured pack size are reported as 0; any remainder
        that cannot be expressed in whole boxes/strips stays as loose PCs, so
        boxes*pcs_per_box + strips*pcs_per_strip + pcs always equals the input.
        """
        pcs = self.stock_quantity if total_pcs is None else total_pcs
        boxes = strips = 0
        remaining = max(pcs, 0)
        if self.pcs_per_box:
            boxes = remaining // self.pcs_per_box
            remaining %= self.pcs_per_box
        if self.pcs_per_strip:
            strips = remaining // self.pcs_per_strip
            remaining %= self.pcs_per_strip
        return {"boxes": boxes, "strips": strips, "pcs": remaining}

    def get_unit_price(self, unit):
        """Selling price for one unit of `unit`, or ``None`` if unavailable."""
        if unit == self.Unit.PC:
            return self.unit_price
        if unit == self.Unit.STRIP:
            return self.strip_price
        if unit == self.Unit.BOX:
            return self.box_price
        return None

    def supports_unit(self, unit):
        """True when the product can be sold in the given unit."""
        return (
            unit in self.Unit.values
            and self.units_in(unit) is not None
            and self.get_unit_price(unit) is not None
        )
