from django.conf import settings
from django.db import models


class Customer(models.Model):
    class MembershipTier(models.TextChoices):
        NON_MEMBER = "", "Non-member"
        BRONZE = "bronze", "Bronze"
        SILVER = "silver", "Silver"
        GOLD = "gold", "Gold"

    class DiabetesStatus(models.TextChoices):
        UNKNOWN = "unknown", "Unknown"
        YES = "yes", "Yes"
        NO = "no", "No"

    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20, unique=True)
    email = models.EmailField()
    address = models.TextField()
    date_of_birth = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    membership_tier = models.CharField(
        max_length=20,
        choices=MembershipTier.choices,
        default=MembershipTier.NON_MEMBER,
        blank=True,
        verbose_name="membership tier",
    )
    member_since = models.DateField(null=True, blank=True)
    loyalty_points = models.IntegerField(default=0)
    # Link to the portal login account. The `user_id` column (UNIQUE FK to
    # `accounts_user`) already exists in the PostgreSQL database from an
    # earlier migration, so this field reuses it — no new column is created.
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="customer_profile",
        verbose_name="portal user",
        help_text="Login account that sees this profile in the Customer Portal.",
    )
    # Staff-recorded health details (manual entries only — never diagnosed).
    diabetes_status = models.CharField(
        max_length=10,
        choices=DiabetesStatus.choices,
        default=DiabetesStatus.UNKNOWN,
        verbose_name="diabetes",
    )
    bp_systolic = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name="blood pressure (systolic)",
    )
    bp_diastolic = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name="blood pressure (diastolic)",
    )
    bp_recorded_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="blood pressure recorded date",
    )
    health_notes = models.TextField(
        blank=True,
        default="",
        verbose_name="health notes",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "customer"
        verbose_name_plural = "customers"

    def __str__(self):
        return self.name

    @property
    def is_member(self):
        return self.membership_tier != self.MembershipTier.NON_MEMBER
